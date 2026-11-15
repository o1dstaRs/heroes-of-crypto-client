import { afterAll, beforeAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PremiumCrewHistoryStore, premiumCrewHistoryResponse } from "../../server/premium-crew-history";
import { validCrewHistory } from "./premium-crew-history";
import { premiumCatalog } from "./premium-catalog";
import { CREW_LEVELS, premiumCrewBoardPlan } from "./premium-crew";
import { renderPremiumCrewRecommendations } from "./premium-crew-recommendations";

const directory = mkdtempSync(join(tmpdir(), "hoc-crew-history-"));
const path = join(directory, "premium.sqlite");
const sourceSha256 = "a".repeat(64);
const ownUnits = [1, 11, 14, 15, 17, 19];
const catalog = premiumCatalog("en");
const factionCrew = (faction: string) => {
    const ids: number[] = [];
    for (const level of CREW_LEVELS)
        ids.push(
            Number(
                Object.keys(catalog.units).find(
                    (id) =>
                        catalog.units[id].faction === faction &&
                        catalog.units[id].level === level &&
                        catalog.units[id].kit?.amount &&
                        !ids.includes(Number(id)),
                ),
            ),
        );
    return ids;
};
const natureEnemy = factionCrew("Nature"),
    lifeEnemy = factionCrew("Life");
let store: PremiumCrewHistoryStore;

beforeAll(() => {
    const db = new Database(path);
    db.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE family(id TEXT PRIMARY KEY, cohort TEXT, partition TEXT, map INTEGER);
        CREATE TABLE army(id INTEGER PRIMARY KEY, family_id TEXT, score REAL, artifact_t1 INTEGER, artifact_t2 INTEGER);
        CREATE TABLE unit(army_id INTEGER, creature_id INTEGER, PRIMARY KEY(army_id,creature_id));
        CREATE TABLE synergy(army_id INTEGER, faction INTEGER, synergy INTEGER, level INTEGER);`);
    db.query("INSERT INTO metadata VALUES('manifest',?)").run(
        JSON.stringify({
            schema: "hoc-premium-evidence-snapshot-v2",
            snapshotId: "fixture",
            sourceSha256,
            status: "development",
            studyProfile: "premium-ranked-v3",
        }),
    );
    let armyId = 0;
    const family = (
        name: string,
        a: number[],
        b: number[],
        cohort = "ranked-draft",
        partition = "train",
        map = 1,
        score = 0.75,
        artifact = 1,
    ) => {
        db.query("INSERT INTO family VALUES(?,?,?,?)").run(name, cohort, partition, map);
        for (const [units, result] of [
            [a, score],
            [b, 1 - score],
        ] as [number[], number][]) {
            const id = ++armyId;
            db.query("INSERT INTO army VALUES(?,?,?,?,?)").run(id, name, result, artifact, artifact);
            for (const unit of units) db.query("INSERT INTO unit VALUES(?,?)").run(id, unit);
            db.query("INSERT INTO synergy VALUES(?,1,1,1)").run(id);
        }
    };
    db.transaction(() => {
        for (let i = 0; i < 150; i++)
            family(`train-${i}`, [1, 4 + (i % 3)], [1, 4 + (i % 3)], "ranked-draft", "train", 1, 0.75, 1 + (i % 2));
        family("without-ally", [4], [3], "ranked-draft", "train", 1, 1);
        family("validation", [1, 4], [11], "ranked-draft", "validation", 1, 1);
        family("test", [1, 4], [11], "ranked-draft", "test", 1, 1);
        family("other-map", [1, 4], [11], "ranked-draft", "train", 3, 1);
        family("other-cohort", [1, 4], [11], "ranged-heavy", "train", 1, 1);
        for (const [enemy, name, code] of [
            [natureEnemy, "nature", 3],
            [lifeEnemy, "life", 4],
        ] as const)
            for (const variant of [1, 2])
                for (let i = 0; i < 60; i++) {
                    const score = (name === "nature") === (variant === 1) ? 1 : 0;
                    family(
                        `matchup-${name}-${variant}-${i}`,
                        ownUnits,
                        [...enemy],
                        "ground-melee",
                        "train",
                        4,
                        score,
                        variant,
                    );
                    db.query("UPDATE synergy SET faction=2,synergy=?,level=2 WHERE army_id=?").run(variant, armyId - 1);
                    db.query("UPDATE synergy SET faction=?,synergy=2,level=3 WHERE army_id=?").run(code, armyId);
                }
    })();
    db.close();
    store = new PremiumCrewHistoryStore(path, sourceSha256, true);
});
afterAll(() => {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
});

const request = (changes: Record<string, string> = {}) =>
    new Request(
        "http://localhost/premium/crew/picks?" +
            new URLSearchParams({
                snapshot: "fixture",
                units: ownUnits.join(","),
                cohort: "ranked-draft",
                map: "1",
                ...changes,
            }),
    );

test("SQLite co-play scores average mirrored seats once per family and never read held-out, other-map or other-cohort games", async () => {
    const response = premiumCrewHistoryResponse(request(), { active: true }, store);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const data = await response.json();
    const group = data.slots[2];
    expect(group.contextUnits).toEqual([1]);
    const row = group.rows.find((row: { ids: number[] }) => row.ids[0] === 4);
    expect(row.families).toBe(50);
    expect(row.observations).toBe(100);
    expect(row.score).toBe(0.5);
    expect(row.interval[0]).toBeLessThan(0.5);
    expect(row.interval[1]).toBeGreaterThan(0.5);
    const marginal = store.history([], "ranked-draft", "1").slots[2].rows.find((row) => row.ids[0] === 4)!;
    expect(marginal.families).toBe(51);
    expect(marginal.score).toBeCloseTo(26 / 51);
    expect(
        validCrewHistory(
            data,
            { snapshotId: "fixture", sourceSha256, cohort: "ranked-draft", map: "1", ownUnits },
            store.catalog,
        ),
    ).toBe(true);
});

test("co-play endpoint enforces entitlement, snapshot identity, current roster quotas and battlefield scope", () => {
    expect(premiumCrewHistoryResponse(request(), { active: false }, store).status).toBe(403);
    expect(premiumCrewHistoryResponse(request(), { active: true }).status).toBe(503);
    const invalidScopes: Record<string, string>[] = [
        { snapshot: "wrong" },
        { units: "1,1" },
        { units: "7,8" },
        { units: "45" },
        { map: "99" },
        { cohort: "unknown" },
        { enemy: "1" },
        { enemy: "21,21" },
        { enemy: "7,8" },
    ];
    for (const changes of invalidScopes)
        expect(premiumCrewHistoryResponse(request(changes), { active: true }, store).status).toBe(400);
    expect(premiumCrewHistoryResponse(request({ units: "" }), { active: true }, store).status).toBe(200);
    expect(() => new PremiumCrewHistoryStore(path, "b".repeat(64), true)).toThrow("Incompatible Premium snapshot");
});

test("enemy-conditioned SQLite outcomes repick artifacts and synergy variants, while explicit choices remain usable", () => {
    const a = store.history(ownUnits, "ground-melee", "4", natureEnemy);
    const b = store.history(ownUnits, "ground-melee", "4", lifeEnemy);
    const plan = (enemy: number[], history: typeof a, artifacts: number[] = [], variants = {}) =>
        premiumCrewBoardPlan(ownUnits, enemy, catalog, "screen", 4, undefined, undefined, history, artifacts, variants);
    expect(plan(natureEnemy, a).own.input.artifacts).toEqual([1, 1]);
    expect(plan(lifeEnemy, b).own.input.artifacts).toEqual([2, 2]);
    expect(plan(natureEnemy, a).variants.Might).toBe(1);
    expect(plan(lifeEnemy, b).variants.Might).toBe(2);
    const custom = plan(natureEnemy, a, [2, 2], { Might: 2 });
    expect(custom.own.input.artifacts).toEqual([2, 2]);
    expect(custom.variants.Might).toBe(2);
    expect(custom.synergies.find((item) => item.faction === "Might")!.recommendedVariant).toBe(1);
    const cards = renderPremiumCrewRecommendations(ownUnits, 0, "synergies", catalog, undefined, "en", 50, a);
    expect(cards).toContain("100.0%");
    expect(cards).toContain(
        "vs " +
            [...natureEnemy]
                .sort((a, b) => a - b)
                .map((id) => catalog.units[id].name)
                .join(", "),
    );
    for (const group of [a.artifacts[0], a.synergiesByFaction!.find((item) => item.faction === "Might")!]) {
        expect(group.opponentUnits).toEqual([...natureEnemy].sort((a, b) => a - b));
        expect(group.contextUnits).toEqual([...ownUnits].sort((a, b) => a - b));
        expect(group.rows.map((row) => row.families)).toEqual([60, 60]);
        expect(group.rows.map((row) => row.observations)).toEqual([60, 60]);
    }
});

test("sparse exact enemies broaden by support coverage and report the enemy subset actually used", () => {
    const replacement = Number(
        Object.keys(catalog.units).find(
            (id) =>
                catalog.units[id].level === 4 &&
                catalog.units[id].faction === "Nature" &&
                !natureEnemy.includes(Number(id)),
        ),
    );
    const enemy = [...natureEnemy.slice(0, 5), replacement];
    const history = store.history(ownUnits, "ground-melee", "4", enemy);
    expect(history.artifacts[0].opponentUnits).toEqual([...natureEnemy.slice(0, 5)].sort((a, b) => a - b));
    expect(history.artifacts[0].rows.map((row) => row.families)).toEqual([60, 60]);
    const expected = {
        snapshotId: "fixture",
        sourceSha256,
        cohort: "ground-melee",
        map: "4",
        ownUnits,
        enemyUnits: enemy,
    };
    expect(validCrewHistory(history, expected, catalog)).toBe(true);
    expect(validCrewHistory(history, { ...expected, enemyUnits: natureEnemy }, catalog)).toBe(false);
    const corrupted = structuredClone(history);
    corrupted.artifacts[0].opponentUnits = [ownUnits[0]];
    expect(validCrewHistory(corrupted, expected, catalog)).toBe(false);
});

test("client rejects stale scopes, reordered crews and corrupted statistical results", () => {
    const history = store.history(ownUnits, "ranked-draft", "1");
    const expected = { snapshotId: "fixture", sourceSha256, cohort: "ranked-draft", map: "1", ownUnits };
    for (const override of [
        { snapshotId: "old" },
        { sourceSha256: "wrong" },
        { map: "3" },
        { partition: "test" },
        { ownUnits: [...ownUnits].reverse() },
    ])
        expect(validCrewHistory({ ...history, ...override }, expected, store.catalog)).toBe(false);
    const invalid = structuredClone(history);
    invalid.slots[2].rows[0].score = 1.1;
    expect(validCrewHistory(invalid, expected, store.catalog)).toBe(false);
});
