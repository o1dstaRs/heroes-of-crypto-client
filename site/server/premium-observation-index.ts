import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, createReadStream, existsSync, linkSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import {
    AI_META_COHORTS,
    AI_META_MAPS,
    type AiMetaCohort,
} from "@heroesofcrypto/common/src/simulation/ai_meta_cohorts_core";
import { aiMetaEvidencePartition } from "@heroesofcrypto/common/src/simulation/ai_meta_evidence";
import { parsePairRecord } from "@heroesofcrypto/common/src/simulation/reaggregate_ai_meta_summary";
import {
    canonicalPremiumEvidenceQuery,
    PREMIUM_SNAPSHOT_SQL,
    type IPremiumEvidenceQuery,
    type IPremiumEvidenceResult,
} from "@heroesofcrypto/common/src/simulation/premium_evidence_snapshot";

export const OBSERVATION_INDEX_SCHEMA = "hoc-balance-observation-index-v1";
export interface ObservationIndexManifest {
    schema: typeof OBSERVATION_INDEX_SCHEMA;
    snapshotId: string;
    sourceSha256: string;
    studyProfile: "balance-meta-v1";
    createdAt: string;
    indexedAt: string;
    status: "development";
    fights: number;
    families: number;
    cohorts: string[];
    summarySha256: string;
    capabilities: string[];
    sources: { name: string; sha256: string; pairs: number }[];
    caveats: string[];
    provenance: Record<string, unknown>;
}
const digest = (text: string) => createHash("sha256").update(text).digest("hex");

/** Index existing balance archives without relabelling them as a full Premium capture. Never reruns battles. */
export async function buildObservationIndex(
    summaryPath: string,
    outputPath: string,
): Promise<ObservationIndexManifest> {
    const summaryText = readFileSync(summaryPath, "utf8");
    const summary = JSON.parse(summaryText);
    const provenance = summary.provenance;
    if (
        summary.schemaVersion !== 1 ||
        summary.complete !== true ||
        !Array.isArray(summary.cohorts) ||
        summary.cohorts.length !== AI_META_COHORTS.length ||
        !/^[a-f0-9]{64}$/.test(provenance?.sourceSha256 ?? "") ||
        !Number.isSafeInteger(provenance?.baseSeed) ||
        provenance.fightProfile?.studyProfile !== "legacy-oracle" ||
        provenance.evidenceCollection != null ||
        JSON.stringify([...(provenance.maps ?? [])].sort()) !== JSON.stringify([...AI_META_MAPS].sort()) ||
        new Set(summary.cohorts.map((cohort: { cohort: string }) => cohort.cohort)).size !== AI_META_COHORTS.length ||
        summary.cohorts.some((cohort: { cohort: AiMetaCohort }) => !AI_META_COHORTS.includes(cohort.cohort))
    )
        throw new Error(
            "A complete, source-identified seven-cohort balance archive is required; full Premium studies use the canonical snapshot builder",
        );
    const target = resolve(outputPath);
    if (existsSync(target)) throw new Error("Refusing to overwrite an existing observation index");
    mkdirSync(dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    const db = new Database(temporary, { create: true, strict: true });
    chmodSync(temporary, 0o600);
    try {
        db.exec(PREMIUM_SNAPSHOT_SQL);
        const addSource = db.query("INSERT INTO source VALUES(?,?,?,?)");
        const addFamily = db.query("INSERT INTO family VALUES(?,?,?,?,?,?,?)");
        const addArmy = db.query("INSERT INTO army VALUES(?,?,?,?,?,?,?,?)");
        const addUnit = db.query("INSERT INTO unit VALUES(?,?)");
        const addSynergy = db.query("INSERT INTO synergy VALUES(?,?,?,?)");
        let families = 0;
        const sources: ObservationIndexManifest["sources"] = [];
        for (const [sourceIndex, cohort] of summary.cohorts.entries()) {
            if (
                basename(cohort.rawPath ?? "") !== cohort.rawPath ||
                !cohort.rawPath.endsWith(".jsonl.gz") ||
                !Number.isSafeInteger(cohort.pairs) ||
                cohort.pairs < 1 ||
                cohort.games !== cohort.pairs * 2 ||
                cohort.games !== provenance.gamesPerCohort ||
                cohort.rejectedActions !== 0 ||
                cohort.distinctRosterViolations !== 0 ||
                cohort.overlappingCreatureViolations !== 0
            )
                throw new Error("Invalid archive completeness or quality");
            const rawPath = resolve(dirname(summaryPath), cohort.rawPath);
            const hash = createHash("sha256");
            for await (const chunk of createReadStream(rawPath)) hash.update(chunk);
            const sha256 = hash.digest("hex");
            addSource.run(sourceIndex + 1, cohort.rawPath, sha256, cohort.pairs);
            sources.push({ name: cohort.rawPath, sha256, pairs: cohort.pairs });
            const raw = createReadStream(rawPath),
                gzip = createGunzip();
            raw.on("error", (error) => gzip.destroy(error));
            const lines = createInterface({ input: raw.pipe(gzip), crlfDelay: Infinity });
            const pairs = new Set<number>();
            const mapGames: Record<string, number> = {};
            let lineNumber = 0,
                greenWins = 0,
                redWins = 0,
                draws = 0;
            db.exec("BEGIN");
            for await (const line of lines) {
                lineNumber++;
                const record = parsePairRecord(
                    JSON.parse(line),
                    cohort.cohort,
                    [...AI_META_MAPS],
                    `${cohort.rawPath}:${lineNumber}`,
                );
                if (
                    pairs.has(record.pair) ||
                    record.pair < 0 ||
                    record.pair >= cohort.pairs ||
                    record.games[0].aIsGreen !== true ||
                    record.games[1].aIsGreen !== false ||
                    record.games.some((game) => game.rejectedA || game.rejectedB) ||
                    record.armyA.creatureIds.some((id) => record.armyB.creatureIds.includes(id))
                )
                    throw new Error("Invalid, duplicated or rejected paired battle");
                pairs.add(record.pair);
                mapGames[String(record.map)] = (mapGames[String(record.map)] ?? 0) + 2;
                for (const game of record.games) {
                    if (game.winner === "draw") draws++;
                    else if ((game.winner === "a") === game.aIsGreen) greenWins++;
                    else redWins++;
                }
                const familyId = `balance:${provenance.sourceSha256}:${provenance.baseSeed}:${record.cohort}:${record.pair}`;
                addFamily.run(
                    familyId,
                    record.cohort,
                    record.pair,
                    record.map,
                    aiMetaEvidencePartition(provenance.baseSeed, record.cohort, record.pair),
                    sourceIndex + 1,
                    lineNumber,
                );
                for (const [index, side, army] of [
                    [0, "a", record.armyA],
                    [1, "b", record.armyB],
                ] as const) {
                    const armyId = families * 2 + index + 1;
                    const score =
                        record.games.reduce(
                            (sum, game) => sum + (game.winner === side ? 1 : game.winner === "draw" ? 0.5 : 0),
                            0,
                        ) / 2;
                    addArmy.run(
                        armyId,
                        familyId,
                        side,
                        score,
                        army.doctrine,
                        army.artifactT1.id,
                        army.artifactT2.id,
                        army.augment.planId,
                    );
                    for (const id of army.creatureIds) addUnit.run(armyId, id);
                    const factions: Record<string, number> = { Chaos: 1, Might: 2, Nature: 3, Life: 4 };
                    for (const choice of army.synergies ?? []) {
                        const count = army.roster.filter((unit) => factions[unit.faction] === choice.faction).length;
                        addSynergy.run(
                            armyId,
                            choice.faction,
                            choice.synergy,
                            count >= 6 ? 3 : count >= 4 ? 2 : count >= 2 ? 1 : 0,
                        );
                    }
                }
                families++;
            }
            if (
                pairs.size !== cohort.pairs ||
                greenWins !== cohort.greenWins ||
                redWins !== cohort.redWins ||
                draws !== cohort.draws ||
                Object.keys(cohort.mapGames).some((map) => cohort.mapGames[map] !== mapGames[map])
            )
                throw new Error("Raw battle counts, maps or outcomes do not match the completed summary");
            db.exec("COMMIT");
        }
        if (families !== provenance.totalPairs || families * 2 !== provenance.totalGames)
            throw new Error("Total archive coverage does not match provenance");
        const summarySha256 = digest(summaryText);
        const manifest: ObservationIndexManifest = {
            schema: OBSERVATION_INDEX_SCHEMA,
            snapshotId: digest(JSON.stringify([summarySha256, sources])).slice(0, 24),
            sourceSha256: provenance.sourceSha256,
            studyProfile: "balance-meta-v1",
            createdAt: summary.generatedAt,
            indexedAt: new Date().toISOString(),
            status: "development",
            fights: families * 2,
            families,
            cohorts: summary.cohorts.map((cohort: { cohort: string }) => cohort.cohort),
            summarySha256,
            capabilities: [
                "observed-unit-results",
                "observed-artifact-results",
                "crew-co-play",
                "drafted-faction-composition",
            ],
            sources,
            caveats: [
                `${families * 2} archived balance-study battles. Original AI profile: ${provenance.fightProfile.name}.`,
                "Scores describe observed whole armies, not live win probabilities or causal swap effects. Setup selections include post-draft oracle choices.",
                "This run fixed Battle Trance and did not collect Empower, full Premium draft traces or per-fight formations. Faction levels are archived drafted-roster counts.",
                "The deterministic 80/10/10 family split was assigned when indexing these archives; displayed statistics use the 80% train partition. No model was fitted or qualified on the reserved partitions.",
            ],
            provenance,
        };
        db.query("INSERT INTO metadata VALUES('manifest',?)").run(JSON.stringify(manifest));
        const integrity = db.query("PRAGMA integrity_check").get() as { integrity_check: string };
        if (integrity.integrity_check !== "ok") throw new Error("Observation index integrity check failed");
        db.close();
        linkSync(temporary, target);
        unlinkSync(temporary);
        chmodSync(target, 0o444);
        return manifest;
    } catch (error) {
        try {
            db.close();
        } catch {
            /* Already closed after a successful import. */
        }
        if (existsSync(temporary)) unlinkSync(temporary);
        throw error;
    }
}

/** Explicit development-only adapter. Canonical Premium candidate validation remains unchanged. */
export class PremiumObservationIndex {
    readonly database: Database;
    readonly manifest: ObservationIndexManifest;
    constructor(path: string, expectedSourceSha256: string, allowDevelopment = false) {
        this.database = new Database(path, { readonly: true, strict: true });
        try {
            this.database.exec("PRAGMA query_only=ON");
            this.manifest = JSON.parse(
                this.database.query<{ value: string }, []>("SELECT value FROM metadata WHERE key='manifest'").get()!
                    .value,
            );
            if (
                !allowDevelopment ||
                this.manifest.schema !== OBSERVATION_INDEX_SCHEMA ||
                this.manifest.status !== "development" ||
                this.manifest.studyProfile !== "balance-meta-v1" ||
                !/^[a-f0-9]{64}$/.test(expectedSourceSha256) ||
                this.manifest.sourceSha256 !== expectedSourceSha256 ||
                this.manifest.fights !== this.manifest.families * 2 ||
                this.manifest.sources.length !== AI_META_COHORTS.length
            )
                throw new Error("Balance observations require verified provenance and explicit development access");
        } catch (error) {
            this.database.close();
            throw error;
        }
    }
    close() {
        this.database.close();
    }
    query(input: IPremiumEvidenceQuery): IPremiumEvidenceResult {
        const scope = canonicalPremiumEvidenceQuery(input);
        const params: (string | number)[] = [scope.cohort, scope.partition!];
        const where = ["f.cohort=?", "f.partition=?"];
        for (const [column, value] of [
            ["f.map", scope.map],
            ["a.artifact_t1", scope.artifactT1],
            ["a.artifact_t2", scope.artifactT2],
            ["a.doctrine", scope.doctrine],
            ["a.augment_plan", scope.augmentPlanId],
        ] as const) {
            if (value !== undefined) {
                where.push(`${column}=?`);
                params.push(value);
            }
        }
        for (const id of scope.ownUnits!) {
            where.push("EXISTS(SELECT 1 FROM unit u WHERE u.army_id=a.id AND u.creature_id=?)");
            params.push(id);
        }
        for (const id of scope.opponentUnits!) {
            where.push(
                "EXISTS(SELECT 1 FROM army e JOIN unit u ON u.army_id=e.id WHERE e.family_id=a.family_id AND e.side<>a.side AND u.creature_id=?)",
            );
            params.push(id);
        }
        for (const choice of [...scope.variants!, ...scope.activeSynergies!]) {
            const level = "level" in choice && typeof choice.level === "number" ? choice.level : undefined;
            where.push(
                `EXISTS(SELECT 1 FROM synergy s WHERE s.army_id=a.id AND s.faction=? AND s.synergy=?${level === undefined ? "" : " AND s.level=?"})`,
            );
            params.push(choice.faction, choice.synergy);
            if (level !== undefined) params.push(level);
        }
        const result = this.database
            .query<{ n: number; observations: number | null; score: number | null }, (string | number)[]>(
                `SELECT COUNT(*) n,SUM(observations) observations,AVG(score) score FROM(SELECT f.id,COUNT(*) observations,AVG(a.score) score FROM army a JOIN family f ON f.id=a.family_id WHERE ${where.join(" AND ")} GROUP BY f.id)`,
            )
            .get(...params)!;
        const radius = result.n ? Math.sqrt(Math.log(40) / (2 * result.n)) : 1;
        return {
            snapshotId: this.manifest.snapshotId,
            evidenceId: `${this.manifest.snapshotId}:${digest(JSON.stringify(scope))}`,
            scope,
            status: result.n === 0 ? "no_evidence" : result.n < 50 ? "limited_evidence" : "supported",
            evidenceKind: "observational-association",
            independentFamilies: result.n,
            fights: result.n * 2,
            armyObservations: result.observations ?? 0,
            scoreRate: result.score,
            interval95:
                result.score === null
                    ? [0, 1]
                    : [Math.max(0, result.score - radius), Math.min(1, result.score + radius)],
            uncertainty: "family-bounded-hoeffding-95",
            examples: [],
        };
    }
}

if (import.meta.main) {
    const [summary, output] = process.argv.slice(2);
    if (!summary || !output)
        throw new Error("Usage: bun site/server/premium-observation-index.ts <summary.json> <index.sqlite>");
    const manifest = await buildObservationIndex(resolve(summary), resolve(output));
    console.log(
        JSON.stringify(
            {
                snapshotId: manifest.snapshotId,
                sourceSha256: manifest.sourceSha256,
                fights: manifest.fights,
                families: manifest.families,
                sources: manifest.sources,
            },
            null,
            2,
        ),
    );
}
