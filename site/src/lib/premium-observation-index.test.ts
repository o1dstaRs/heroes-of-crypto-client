import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { AI_META_COHORTS } from "@heroesofcrypto/common/src/simulation/ai_meta_cohorts_core";
import { aiMetaEvidencePartition } from "@heroesofcrypto/common/src/simulation/ai_meta_evidence";
import { PremiumEvidenceSnapshot } from "@heroesofcrypto/common/src/simulation/premium_evidence_snapshot";
import { buildObservationIndex, PremiumObservationIndex } from "../../server/premium-observation-index";
import { PremiumCrewHistoryStore } from "../../server/premium-crew-history";

const directory = mkdtempSync(join(tmpdir(), "hoc-balance-observations-"));
const summaryPath = join(directory, "summary.json"),
    outputPath = join(directory, "observations.sqlite");
const sourceSha256 = "a".repeat(64);
const levels = [1, 1, 2, 2, 3, 4];
const army = (ids: number[], faction: string) => ({
    roster: ids.map((id, index) => ({
        creatureName: `Fixture ${id}`,
        level: levels[index],
        faction,
        size: 1,
        amount: 1,
    })),
    creatureIds: ids,
    doctrine: 3,
    synergies: [],
    artifactT1: { id: 1, mode: "explore" },
    artifactT2: { id: 2, mode: "explore" },
    augment: {
        planId: "P0-A0-M0-S0-V0",
        mode: "explore",
        plan: { placement: 0, armor: 0, might: 0, sniper: 0, movement: 0 },
    },
});
const outcome = (aIsGreen: boolean, winner: string) => ({
    aIsGreen,
    winner,
    laps: 2,
    endReason: "elimination",
    armageddonDecided: false,
    rejectedA: 0,
    rejectedB: 0,
    hpA: 1,
    hpB: 0,
    survivorsA: 1,
    survivorsB: 0,
});
let summary: Record<string, unknown>;
beforeAll(async () => {
    const cohorts = AI_META_COHORTS.map((cohort) => {
        const rawPath = `${cohort}.pairs.jsonl.gz`;
        const records = [1, 3, 4].map((map, pair) => ({
            schemaVersion: 1,
            cohort,
            map,
            pair,
            setupSeed: 1,
            combatSeed: 2,
            armyA: army([1, 2, 4, 5, 7, 9], "Chaos"),
            armyB: army([11, 12, 14, 15, 17, 19], "Might"),
            games: [outcome(true, "a"), outcome(false, "draw")],
        }));
        writeFileSync(
            join(directory, rawPath),
            gzipSync(records.map((record) => JSON.stringify(record)).join("\n") + "\n"),
        );
        return {
            cohort,
            rawPath,
            pairs: 3,
            games: 6,
            greenWins: 3,
            redWins: 0,
            draws: 3,
            rejectedActions: 0,
            distinctRosterViolations: 0,
            overlappingCreatureViolations: 0,
            mapGames: { 1: 2, 3: 2, 4: 2 },
        };
    });
    summary = {
        schemaVersion: 1,
        complete: true,
        generatedAt: "2026-11-05T07:04:00Z",
        cohorts,
        provenance: {
            sourceSha256,
            baseSeed: 1,
            maps: [1, 3, 4],
            gamesPerCohort: 6,
            totalPairs: 21,
            totalGames: 42,
            evidenceCollection: null,
            fightProfile: { name: "fixture-a19", studyProfile: "legacy-oracle" },
        },
    };
    writeFileSync(summaryPath, JSON.stringify(summary));
    await buildObservationIndex(summaryPath, outputPath);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

test("balance import retains pair zero, every original battle, hashes and seat-averaged outcomes", () => {
    const index = new PremiumObservationIndex(outputPath, sourceSha256, true);
    expect(index.manifest.fights).toBe(42);
    expect(index.manifest.families).toBe(21);
    expect(index.manifest.sources).toHaveLength(7);
    expect(index.manifest.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256))).toBe(true);
    const result = index.query({
        cohort: "ranked-draft",
        map: 1,
        partition: aiMetaEvidencePartition(1, "ranked-draft", 0),
        ownUnits: [1],
    });
    expect(result.independentFamilies).toBe(1);
    expect(result.armyObservations).toBe(1);
    expect(result.scoreRate).toBe(0.75);
    expect(index.manifest.capabilities).not.toContain("formation-examples");
    index.close();
});

test("observation indexes need explicit development opt-in and never pass canonical Premium provenance validation", () => {
    expect(() => new PremiumObservationIndex(outputPath, sourceSha256)).toThrow("explicit development access");
    expect(() => new PremiumObservationIndex(outputPath, "b".repeat(64), true)).toThrow("verified provenance");
    expect(() => new PremiumEvidenceSnapshot(outputPath, sourceSha256, { allowDevelopment: true })).toThrow(
        "Incompatible Premium snapshot",
    );
    expect(() => new PremiumCrewHistoryStore(outputPath, sourceSha256, true)).toThrow("Incompatible Premium snapshot");
    const store = new PremiumCrewHistoryStore(outputPath, sourceSha256, true, { observationIndex: true });
    expect(store.history([], "ranked-draft", "all").snapshotId).toBeTruthy();
    store.close();
});

test("imports refuse overwrite and reject summaries whose raw outcome counts do not agree", async () => {
    await expect(buildObservationIndex(summaryPath, outputPath)).rejects.toThrow("Refusing to overwrite");
    const invalid = structuredClone(summary) as { cohorts: { draws: number }[] };
    invalid.cohorts[0].draws = 0;
    const path = join(directory, "bad-summary.json");
    writeFileSync(path, JSON.stringify(invalid));
    await expect(buildObservationIndex(path, join(directory, "invalid.sqlite"))).rejects.toThrow("do not match");
    expect(await Bun.file(join(directory, "invalid.sqlite")).exists()).toBe(false);
});
