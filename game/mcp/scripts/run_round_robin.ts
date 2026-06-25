#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
    boolArg,
    numberArg,
    parseActor,
    parseArgs,
    parseList,
    parseScenario,
    parseStyle,
    stringArg,
} from "./harness/cli";
import { runHarnessMatch } from "./harness/runner";
import type { HarnessActorConfig, HarnessReplay } from "./harness/types";

const usage = (): void => {
    console.log(`Usage: bun scripts/run_round_robin.ts [options]

Options:
  --players=builtin,model[:name],model:other
  --scenarios=draft,approach,priority_targets,spell_duel,summon_duel
  --styles=balanced,aggressive,defensive
  --iterations=1
  --model-api-base=http://127.0.0.1:9091/
  --model=auto
  --timeout-ms=20000
  --max-actions=500
  --mechanics=true|false
  --out=/path/summary.jsonl
  --replay-dir=/path/replays

Environment defaults:
  HOC_MODEL_API_BASE, HOC_MODEL_NAME, HOC_AI_STYLE, HOC_MODEL_TIMEOUT_MS, HOC_MODEL_STREAM, HOC_MODEL_TEMPERATURE
`);
};

const args = parseArgs();
if (args.has("help") || args.has("h")) {
    usage();
    process.exit(0);
}

const modelApiBase = stringArg(args, "model-api-base", process.env.HOC_MODEL_API_BASE ?? "http://127.0.0.1:9091/");
const modelName = stringArg(args, "model", process.env.HOC_MODEL_NAME ?? "auto");
const timeoutMs = numberArg(args, "timeout-ms", Number(process.env.HOC_MODEL_TIMEOUT_MS ?? 20000));
const maxActions = numberArg(args, "max-actions", 500);
const includeMechanicsContext = boolArg(args, "mechanics", true);
const players = parseList(stringArg(args, "players", `builtin,model:${modelName}`));
const scenarios = parseList(stringArg(args, "scenarios", "draft")).map(parseScenario);
const styles = parseList(stringArg(args, "styles", process.env.HOC_AI_STYLE ?? "balanced")).map(parseStyle);
const iterations = numberArg(args, "iterations", 1);
const outPath = stringArg(args, "out", "");
const replayDir = stringArg(args, "replay-dir", "");

if (replayDir) {
    await mkdir(replayDir, { recursive: true });
}

const actorName = (actor: HarnessActorConfig): string =>
    actor.controller === "builtin" ? "builtin" : `model:${actor.modelName ?? modelName}`;

const summaryForReplay = (replay: HarnessReplay) => ({
    matchId: replay.matchId,
    scenario: replay.scenario,
    lower: actorName(replay.actors.lower),
    upper: actorName(replay.actors.upper),
    lowerStyle: replay.actors.lower.style,
    upperStyle: replay.actors.upper.style,
    durationMs: replay.durationMs,
    metrics: replay.metrics,
});

const lines: string[] = [];

for (const scenario of scenarios) {
    for (const style of styles) {
        const defaults = { modelApiBase, modelName, style, timeoutMs };
        const pairings =
            players.length === 1
                ? [[players[0], players[0]]]
                : players.flatMap((lower) => players.filter((upper) => upper !== lower).map((upper) => [lower, upper]));

        for (const [lowerSpec, upperSpec] of pairings) {
            for (let i = 0; i < iterations; i++) {
                const lower = parseActor(lowerSpec, "LOWER", defaults);
                const upper = parseActor(upperSpec, "UPPER", defaults);
                const replay = await runHarnessMatch({
                    matchId: `mcp-rr-${scenario}-${style}-${lowerSpec.replaceAll(":", "_")}-vs-${upperSpec.replaceAll(":", "_")}-${i + 1}-${Date.now()}`,
                    scenario,
                    lower,
                    upper,
                    maxActions,
                    includeMechanicsContext,
                });
                const summary = summaryForReplay(replay);
                lines.push(JSON.stringify(summary));

                if (replayDir) {
                    await Bun.write(join(replayDir, `${replay.matchId}.json`), JSON.stringify(replay, null, 2));
                }
                console.error(
                    `${summary.matchId}: winner=${summary.metrics.winner ?? "none"} actions=${summary.metrics.totalActions} fallback=${summary.metrics.fallbackDecisions}`,
                );
            }
        }
    }
}

const output = `${lines.join("\n")}${lines.length ? "\n" : ""}`;
if (outPath) {
    await Bun.write(outPath, output);
    console.log(outPath);
} else {
    process.stdout.write(output);
}
