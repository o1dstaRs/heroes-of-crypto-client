import { afterAll, beforeAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PremiumCrewHistoryStore, premiumCrewHistoryResponse } from "../../server/premium-crew-history";
import { validCrewHistory } from "./premium-crew-history";

const directory = mkdtempSync(join(tmpdir(), "hoc-crew-history-"));
const path = join(directory, "premium.sqlite");
const sourceSha256 = "a".repeat(64);
const ownUnits = [1, 11, 14, 15, 17, 19];
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
    for (const changes of [
        { snapshot: "wrong" },
        { units: "1,1" },
        { units: "7,8" },
        { units: "45" },
        { map: "99" },
        { cohort: "unknown" },
    ])
        expect(premiumCrewHistoryResponse(request(changes), { active: true }, store).status).toBe(400);
    expect(premiumCrewHistoryResponse(request({ units: "" }), { active: true }, store).status).toBe(200);
    expect(() => new PremiumCrewHistoryStore(path, "b".repeat(64), true)).toThrow("Incompatible Premium snapshot");
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
