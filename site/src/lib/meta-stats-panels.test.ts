import { describe, expect, test } from "bun:test";

import type { MetaArtifactRow, MetaComboRow, MetaCreatureRow, MetaStats } from "./meta-stats-client";
import { emptyMetaPanels, metaPanelRows, withGamesFloor } from "./meta-stats-panels";

const creature = (name: string, games: number, winRatePct: number): MetaCreatureRow => ({
    creatureId: name.length,
    name,
    faction: "Chaos",
    games,
    wins: Math.round((games * winRatePct) / 100),
    losses: games - Math.round((games * winRatePct) / 100),
    draws: 0,
    winRatePct,
    pickRatePct: 10,
});

const combo = (names: string[], games: number, winRatePct: number): MetaComboRow => ({
    creatureIds: names.map((name) => name.length),
    names,
    games,
    wins: Math.round((games * winRatePct) / 100),
    losses: games - Math.round((games * winRatePct) / 100),
    draws: 0,
    winRatePct,
});

const artifact = (name: string, tier: number, games: number, winRatePct: number): MetaArtifactRow => ({
    artifactId: name.length,
    tier,
    name,
    games,
    wins: Math.round((games * winRatePct) / 100),
    losses: games - Math.round((games * winRatePct) / 100),
    draws: 0,
    winRatePct,
    pickRatePct: 10,
});

const stats = (overrides: Partial<MetaStats>): MetaStats => ({
    computedAt: 1,
    windowDays: 30,
    games: 8,
    draws: 0,
    creatures: [],
    pairs: [],
    triples: [],
    artifactsTier1: [],
    artifactsTier2: [],
    ...overrides,
});

describe("meta panel rows", () => {
    test("keeps the highest floor any row reaches, so one lucky game never headlines a mature ladder", () => {
        const mature = [creature("Manticore", 20, 60), creature("Efreet", 9, 55), creature("Fairy", 1, 100)];
        expect(withGamesFloor(mature).map((row) => row.name)).toEqual(["Manticore", "Efreet"]);

        const young = [creature("Manticore", 4, 100), creature("Efreet", 3, 66), creature("Fairy", 1, 100)];
        expect(withGamesFloor(young).map((row) => row.name)).toEqual(["Manticore", "Efreet"]);

        const brandNew = [creature("Manticore", 1, 100), creature("Efreet", 1, 0)];
        expect(withGamesFloor(brandNew).map((row) => row.name)).toEqual(["Manticore", "Efreet"]);

        expect(withGamesFloor([])).toEqual([]);
    });

    test("fills each list from the payload and limits it", () => {
        const rows = metaPanelRows(
            stats({
                creatures: [
                    creature("Manticore", 4, 100),
                    creature("Efreet", 3, 100),
                    creature("Scavenger", 4, 75),
                    creature("Battle Mage", 3, 66),
                    creature("Black Dragon", 3, 66),
                    creature("Arbalester", 7, 57),
                    creature("Healer", 3, 0),
                ],
                pairs: [combo(["Manticore", "Efreet"], 2, 100), combo(["Scavenger", "Healer"], 2, 50)],
                triples: [combo(["Manticore", "Efreet", "Healer"], 2, 100)],
                artifactsTier1: [artifact("Swift Boots", 1, 3, 100), artifact("Veteran Helm", 1, 3, 33)],
                artifactsTier2: [artifact("Clover of Fortune", 2, 5, 40)],
            }),
        );
        expect(rows.strongest.map((row) => row.name)).toEqual([
            "Manticore",
            "Efreet",
            "Scavenger",
            "Battle Mage",
            "Black Dragon",
            "Arbalester",
        ]);
        expect(rows.weakest[0].name).toBe("Healer");
        expect(rows.duos).toHaveLength(2);
        expect(rows.trios).toHaveLength(1);
        expect(rows.artifactsTier1).toHaveLength(2);
        expect(rows.artifactsTier2).toHaveLength(1);
    });

    test("reports the empty panel that left the middle column blank", () => {
        const withoutCombos = stats({
            creatures: [creature("Manticore", 4, 100)],
            pairs: [],
            triples: [],
            artifactsTier1: [artifact("Swift Boots", 1, 3, 100)],
        });
        expect(emptyMetaPanels(withoutCombos)).toEqual({ units: false, combos: true, artifacts: false });

        const everything = stats({
            creatures: [creature("Manticore", 4, 100)],
            pairs: [combo(["Manticore", "Efreet"], 2, 100)],
            artifactsTier1: [artifact("Swift Boots", 1, 3, 100)],
        });
        expect(emptyMetaPanels(everything)).toEqual({ units: false, combos: false, artifacts: false });

        expect(emptyMetaPanels(stats({ games: 0 }))).toEqual({ units: true, combos: true, artifacts: true });
    });

    test("survives a payload missing whole sections", () => {
        const partial = { computedAt: 1, windowDays: 30, games: 3, draws: 0 } as unknown as MetaStats;
        expect(() => metaPanelRows(partial)).not.toThrow();
        expect(emptyMetaPanels(partial)).toEqual({ units: true, combos: true, artifacts: true });
    });
});
