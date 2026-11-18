#!/usr/bin/env bun
// Merge a process-sharded AI-meta run (shard_driver.sh) into one complete run directory that the standard
// validator and renderer accept. Rankings, interactions, and cohort qualities are rebuilt from the raw pair
// records with the runner's own AiMetaAccumulator/AiMetaAggregation, in pair order.
import {
    createReadStream,
    createWriteStream,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { once } from "node:events";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";

const [runArg, outArg, rootArg] = process.argv.slice(2);
if (!runArg || !outArg || !rootArg) {
    throw new Error("Usage: bun merge_ai_meta_shards.ts <sharded-run-dir> <fresh-output-dir> <common-root>");
}
const runDir = resolve(runArg);
const outDir = resolve(outArg);
const root = resolve(rootArg);
const measure = await import(resolve(root, "src/simulation/measure_ai_meta_cohorts.ts"));
const core = await import(resolve(root, "src/simulation/ai_meta_cohorts_core.ts"));
const study = await import(resolve(root, "src/simulation/ai_meta_study.ts"));
const { AiMetaAccumulator, AiMetaAggregation } = measure;
const jobsPath = join(runDir, "jobs.txt");
const cohorts: readonly string[] = existsSync(jobsPath)
    ? [
          ...new Set(
              readFileSync(jobsPath, "utf8")
                  .trim()
                  .split("\n")
                  .map((line) => line.split(/\s+/)[0]),
          ),
      ]
    : core.AI_META_COHORTS;
if (!cohorts.length || cohorts.some((cohort) => !core.AI_META_COHORTS.includes(cohort)))
    throw new Error("Invalid registered cohort set");
const gamesPerMatchup: number = core.AI_META_GAMES_PER_MATCHUP;

if (existsSync(outDir) && readdirSync(outDir).length) throw new Error(`refusing non-empty output ${outDir}`);

interface IShard {
    dir: string;
    summary: any;
    cohort: string;
    start: number;
    count: number;
}

const shardRoot = join(runDir, "shards");
const shards: IShard[] = [];
let attemptDirs = 0;
for (const name of readdirSync(shardRoot).sort()) {
    const dir = join(shardRoot, name);
    const path = join(dir, "ai-meta.summary.json");
    if (name.endsWith(".log")) continue;
    attemptDirs += 1;
    if (!existsSync(path)) continue;
    const summary = JSON.parse(readFileSync(path, "utf8"));
    const window = summary.provenance?.pairWindow;
    const quality = summary.cohorts?.[0];
    if (!window || summary.cohorts.length !== 1 || !quality || quality.pairs !== window.count) continue;
    shards.push({
        dir,
        summary,
        cohort: quality.cohort,
        start: window.start,
        count: window.count,
    });
}
if (!shards.length) throw new Error(`no completed shards under ${shardRoot}`);

const reference = shards[0].summary;
const identity = (summary: any): string => {
    const p = summary.provenance;
    return JSON.stringify([
        summary.schemaVersion,
        p.commonCommit,
        p.commonDirty,
        p.sourceSha256,
        p.runtime,
        p.baseSeed,
        p.gamesPerCohort,
        p.fightProfile,
        p.outputContract,
        p.selectionPolicy,
        p.explorationRate,
        p.executionHost?.cpuModel,
        p.executionHost?.logicalCpus,
        p.executionHost?.osRelease,
    ]);
};
const referenceIdentity = identity(reference);
for (const shard of shards) {
    if (identity(shard.summary) !== referenceIdentity) throw new Error(`${shard.dir} has a different run identity`);
}
if (reference.provenance.commonDirty !== false) {
    const origin = reference.provenance.frozenSource;
    const current = measure.captureAiMetaSourceIdentity();
    if (
        !study.isPremiumMetaStudy(reference.provenance.fightProfile?.studyProfile) ||
        origin?.schema !== "ai-meta-frozen-source-v1" ||
        origin.purpose !== "development-pilot" ||
        origin.sourceSha256 !== reference.provenance.sourceSha256 ||
        current.sourceSha256 !== origin.sourceSha256 ||
        JSON.stringify(current.frozenSource) !== JSON.stringify(origin)
    ) {
        throw new Error(
            "dirty shards require a verified frozen Premium development source; other dirty runs are rejected",
        );
    }
    console.log("Development pilot: preserving original dirty status from the verified frozen source manifest.");
}

const fullPairCount = reference.provenance.gamesPerCohort / gamesPerMatchup;
const byCohort = new Map<string, IShard[]>();
for (const shard of shards) {
    const list = byCohort.get(shard.cohort) ?? [];
    list.push(shard);
    byCohort.set(shard.cohort, list);
}
for (const cohort of cohorts) {
    const windows = (byCohort.get(cohort) ?? []).sort((a, b) => a.start - b.start);
    let next = 0;
    for (const window of windows) {
        if (window.start !== next)
            throw new Error(`${cohort}: window gap/overlap at pair ${next} (next window ${window.start})`);
        next += window.count;
    }
    if (next !== fullPairCount) throw new Error(`${cohort}: windows cover ${next}/${fullPairCount} pairs`);
}
if ([...byCohort.keys()].some((cohort) => !cohorts.includes(cohort))) throw new Error("unexpected cohort in shards");

mkdirSync(outDir, { recursive: true });
const aggregation = new AiMetaAggregation();
const qualities: any[] = [];
const cohortTiming: any[] = [];
const numericQualityKeys = [
    "pairs",
    "games",
    "newlySimulatedGames",
    "reusedGames",
    "greenWins",
    "redWins",
    "draws",
    "armageddonDecided",
    "rejectedActions",
    "distinctRosterViolations",
    "overlappingCreatureViolations",
] as const;

for (const cohort of cohorts) {
    const windows = byCohort.get(cohort)!;
    const accumulator = new AiMetaAccumulator(cohort);
    const rawPath = `${cohort}.pairs.jsonl.gz`;
    const output = createWriteStream(join(outDir, rawPath));
    const gzip = createGzip({ level: 6 });
    gzip.pipe(output);
    const seen = new Set<number>();
    let seconds = 0;
    const shardTotals = Object.fromEntries(numericQualityKeys.map((key) => [key, 0])) as Record<string, number>;
    for (const window of windows) {
        const shardQuality = window.summary.cohorts[0];
        seconds += shardQuality.seconds;
        const fresh = shardQuality.newlySimulatedGames ?? shardQuality.games;
        const reused = shardQuality.reusedGames ?? 0;
        if (
            !Number.isSafeInteger(fresh) ||
            fresh < 0 ||
            !Number.isSafeInteger(reused) ||
            reused < 0 ||
            fresh + reused !== shardQuality.games
        )
            throw new Error("Shard simulation/reuse counts disagree with fixed cases");
        for (const key of numericQualityKeys)
            shardTotals[key] += shardQuality[key] ?? (key === "newlySimulatedGames" ? shardQuality.games : 0);
        const lines = createInterface({
            input: createReadStream(join(window.dir, shardQuality.rawPath)).pipe(createGunzip()),
            crlfDelay: Infinity,
        });
        let count = 0;
        for await (const line of lines) {
            if (!line.trim()) continue;
            const record = JSON.parse(line);
            if (record.cohort !== cohort) throw new Error(`${window.dir}: record for ${record.cohort}`);
            if (record.pair < window.start || record.pair >= window.start + window.count || seen.has(record.pair)) {
                throw new Error(`${window.dir}: duplicate or out-of-window pair ${record.pair}`);
            }
            seen.add(record.pair);
            count += 1;
            accumulator.add(record);
            aggregation.add(record);
            if (!gzip.write(`${line}\n`)) await once(gzip, "drain");
        }
        if (count !== window.count) throw new Error(`${window.dir}: ${count} raw lines, expected ${window.count}`);
    }
    gzip.end();
    await once(output, "finish");
    if (seen.size !== fullPairCount) throw new Error(`${cohort}: merged ${seen.size}/${fullPairCount} pairs`);
    const quality = {
        cohort,
        description: windows[0].summary.cohorts[0].description,
        pairs: accumulator.pairs,
        games: accumulator.games,
        greenWins: accumulator.greenWins,
        redWins: accumulator.redWins,
        draws: accumulator.draws,
        armageddonDecided: accumulator.armageddonDecided,
        rejectedActions: accumulator.rejectedActions,
        distinctRosterViolations: accumulator.distinctRosterViolations,
        overlappingCreatureViolations: accumulator.overlappingCreatureViolations,
        mapGames: accumulator.mapGames,
        endReasons: accumulator.endReasons,
        seconds,
        gamesPerSecond: shardTotals.newlySimulatedGames / Math.max(0.001, seconds),
        newlySimulatedGames: shardTotals.newlySimulatedGames,
        reusedGames: shardTotals.reusedGames,
        rawPath,
    };
    for (const key of numericQualityKeys) {
        if (quality[key] !== shardTotals[key]) {
            throw new Error(`${cohort}.${key}: raw ${quality[key]} != shard summaries ${shardTotals[key]}`);
        }
    }
    qualities.push(quality);
    const firstStart = windows.map((w) => w.summary.provenance.startedAt).sort()[0];
    const lastFinish = windows
        .map((w) => w.summary.generatedAt)
        .sort()
        .at(-1);
    cohortTiming.push({
        cohort,
        startedAt: firstStart,
        finishedAt: lastFinish,
        wallSpanSeconds: (Date.parse(lastFinish) - Date.parse(firstStart)) / 1000,
        accumulatedProcessSeconds: seconds,
    });
    console.log(
        `${cohort}: ${quality.games} games from ${windows.length} windows; draws ${quality.draws}; ` +
            `rejections ${quality.rejectedActions}; roster violations ` +
            `${quality.distinctRosterViolations + quality.overlappingCreatureViolations}`,
    );
}

const driverStart = existsSync(join(runDir, "driver.log"))
    ? (readFileSync(join(runDir, "driver.log"), "utf8")
          .split("\n")
          .find((line) => line.startsWith("START")) ?? "")
    : "";
const processes = Number(/procs=(\d+)/.exec(driverStart)?.[1] ?? NaN);
const workersPerProcess = Number(/workers=(\d+)/.exec(driverStart)?.[1] ?? "1");
const driverTiming = existsSync(join(runDir, "timing.json"))
    ? JSON.parse(readFileSync(join(runDir, "timing.json"), "utf8"))
    : null;
const windowPairs = Number(/window=(\d+)/.exec(driverStart)?.[1] ?? NaN);
const totalGames = qualities.reduce((sum, quality) => sum + quality.games, 0);
const totalPairs = qualities.reduce((sum, quality) => sum + quality.pairs, 0);
const startedAt = shards.map((shard) => shard.summary.provenance.startedAt).sort()[0];
const finishedAt = shards
    .map((shard) => shard.summary.generatedAt)
    .sort()
    .at(-1);

const summary = {
    schemaVersion: reference.schemaVersion,
    complete: true,
    generatedAt: new Date().toISOString(),
    provenance: {
        ...reference.provenance,
        startedAt,
        pairWindow: { start: 0, count: fullPairCount, fullPairCount },
        requestedCohorts: [...cohorts],
        totalGames,
        totalPairs,
        concurrency: Number.isFinite(processes) ? processes * workersPerProcess : reference.provenance.concurrency,
        timing: {
            ...(driverTiming ?? {
                startedAt,
                finishedAt,
                wallSeconds: (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000,
            }),
            cohorts: cohortTiming,
        },
        cohortTimingSemantics:
            "cohorts.seconds sums concurrent process durations; elapsed cohort spans and full-run wall time are in timing",
        parallelCohorts: Number.isFinite(processes) ? Math.min(processes, cohorts.length) : cohorts.length,
        sharding: {
            mode: "process-isolated pair windows with a fixed worker pool per process",
            processes: Number.isFinite(processes) ? processes : null,
            workersPerProcess,
            gcMarkers: driverTiming?.gcMarkers ?? null,
            windowPairs: Number.isFinite(windowPairs) ? windowPairs : null,
            completedWindows: shards.length,
            attemptDirectories: attemptDirs,
            shardsFinishedAt: finishedAt,
            sourceRun: runDir,
            reason:
                "Uses the adopted CPU process layout. Pair seeds are global, so windows tile the pooled run. " +
                "The timing fields measure this run directly; historical layout benchmarks used a separate fight workload.",
        },
    },
    cohorts: qualities,
    rankings: aggregation.rows(),
    interactions: aggregation.interactions(),
    doctrines: aggregation.doctrines.result(),
};
const summaryPath = join(outDir, "ai-meta.summary.json");
if (study.isPremiumMetaStudy(summary.provenance.fightProfile?.studyProfile)) {
    writeFileSync(summaryPath, `${JSON.stringify({ ...summary, complete: false }, null, 2)}\n`, { flag: "wx" });
    const capturedPath = join(outDir, "ai-meta.captured-summary.json");
    writeFileSync(capturedPath, `${JSON.stringify(summary, null, 2)}\n`, {
        flag: "wx",
    });
    const { finalizeAiMetaOutputs } = await import(resolve(root, "src/simulation/ai_meta_outputs.ts"));
    await finalizeAiMetaOutputs(capturedPath, {
        publishSummaryPath: summaryPath,
    });
} else {
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, {
        flag: "wx",
    });
}
console.log(`Merged ${totalGames} games / ${totalPairs} pairs from ${shards.length} windows -> ${outDir}`);
