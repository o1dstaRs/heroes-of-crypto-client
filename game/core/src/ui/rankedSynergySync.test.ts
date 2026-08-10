import { describe, expect, test } from "bun:test";
import { FactionVals, TeamVals, type TeamType } from "@heroesofcrypto/common";

import { syncPlacementSynergyUnitCounts, syncRankedSnapshotSynergies } from "./rankedSynergySync";

const placementSnapshot = (gameId: string) => ({
    gameId,
    fightStarted: false,
    lowerSynergies: [],
    upperSynergies: [],
});

const createStore = (lower: string[], upper: string[]) => {
    const values = new Map<TeamType, string[]>([
        [TeamVals.LOWER, [...lower]],
        [TeamVals.UPPER, [...upper]],
    ]);
    const calls: Array<{ team: TeamType; synergies: string[] }> = [];
    return {
        values,
        calls,
        setSynergiesPerTeam(team: TeamType, synergies: string[]): void {
            calls.push({ team, synergies: [...synergies] });
            values.set(team, [...synergies]);
        },
    };
};

describe("ranked synergy snapshot sync", () => {
    test("clears stale synergies on the first placement snapshot for a game", () => {
        const store = createStore(["Might:1:3"], ["Chaos:1:2"]);

        const currentGameId = syncRankedSnapshotSynergies(store, placementSnapshot("game-b"), "game-a");

        expect(currentGameId).toBe("game-b");
        expect(store.values.get(TeamVals.LOWER)).toEqual([]);
        expect(store.values.get(TeamVals.UPPER)).toEqual([]);
        expect(store.calls).toHaveLength(2);
    });

    test("preserves optimistic choices across later placement snapshots for the same game", () => {
        const store = createStore(["Life:2:1"], []);

        const currentGameId = syncRankedSnapshotSynergies(store, placementSnapshot("game-b"), "game-b");

        expect(currentGameId).toBe("game-b");
        expect(store.values.get(TeamVals.LOWER)).toEqual(["Life:2:1"]);
        expect(store.calls).toHaveLength(0);
    });

    test("replaces both teams with authoritative synergies once the fight starts", () => {
        const store = createStore(["Life:2:1"], ["Nature:1:1"]);

        const currentGameId = syncRankedSnapshotSynergies(
            store,
            {
                gameId: "game-b",
                fightStarted: true,
                lowerSynergies: ["Might:1:3"],
                upperSynergies: ["Chaos:2:2"],
            },
            "game-b",
        );

        expect(currentGameId).toBe("game-b");
        expect(store.values.get(TeamVals.LOWER)).toEqual(["Might:1:3"]);
        expect(store.values.get(TeamVals.UPPER)).toEqual(["Chaos:2:2"]);
        expect(store.calls).toHaveLength(2);
    });
});

describe("placement synergy unit counts", () => {
    let uniqueSeq = 0;
    // name defaults to a unique value so each unit reads as a DISTINCT creature; pass a shared name to
    // model split stacks of the same creature (which must dedupe to one toward the faction synergy).
    const unit = (team: TeamType, faction: number, name = `creature-${uniqueSeq++}`) => ({
        getTeam: () => team,
        getFaction: () => faction,
        getName: () => name,
    });

    const createCountsStore = () => {
        const calls: Array<{ team: TeamType; life: number; chaos: number; might: number; nature: number }> = [];
        return {
            calls,
            setSynergyUnitsPerFactions(team: TeamType, life: number, chaos: number, might: number, nature: number) {
                calls.push({ team, life, chaos, might, nature });
            },
        };
    };

    test("counts every faction per team during placement (Nature board-units becomes reachable)", () => {
        const store = createCountsStore();
        // Lower fields 3 Nature (level 1 board-units synergy) + 1 Life; upper fields 2 Chaos.
        syncPlacementSynergyUnitCounts(
            store,
            [
                unit(TeamVals.LOWER, FactionVals.NATURE),
                unit(TeamVals.LOWER, FactionVals.NATURE),
                unit(TeamVals.LOWER, FactionVals.NATURE),
                unit(TeamVals.LOWER, FactionVals.LIFE),
                unit(TeamVals.UPPER, FactionVals.CHAOS),
                unit(TeamVals.UPPER, FactionVals.CHAOS),
                unit(TeamVals.NO_TEAM as TeamType, FactionVals.MIGHT),
            ],
            false,
        );
        const lower = store.calls.find((call) => call.team === TeamVals.LOWER);
        const upper = store.calls.find((call) => call.team === TeamVals.UPPER);
        expect(lower).toMatchObject({ nature: 3, life: 1, chaos: 0, might: 0 });
        expect(upper).toMatchObject({ chaos: 2, nature: 0 });
        expect(store.calls).toHaveLength(2);
    });

    test("counts split stacks of one creature once (splitting must not inflate synergy)", () => {
        const store = createCountsStore();
        // A single Nature creature split into three placement stacks + one distinct Nature creature: TWO
        // distinct creatures, so the faction count is 2 (level 1) — not 4 (level 2), which per-stack gave.
        syncPlacementSynergyUnitCounts(
            store,
            [
                unit(TeamVals.LOWER, FactionVals.NATURE, "Fairy Dragon"),
                unit(TeamVals.LOWER, FactionVals.NATURE, "Fairy Dragon"),
                unit(TeamVals.LOWER, FactionVals.NATURE, "Fairy Dragon"),
                unit(TeamVals.LOWER, FactionVals.NATURE, "Elf"),
            ],
            false,
        );
        const lower = store.calls.find((call) => call.team === TeamVals.LOWER);
        expect(lower).toMatchObject({ nature: 2 });
    });

    test("never recounts once the fight is live — authoritative lists own the fight", () => {
        const store = createCountsStore();
        syncPlacementSynergyUnitCounts(store, [unit(TeamVals.LOWER, FactionVals.NATURE)], true);
        expect(store.calls).toHaveLength(0);
    });
});
