import { describe, expect, test } from "bun:test";
import { TeamVals, type TeamType } from "@heroesofcrypto/common";

import { syncRankedSnapshotSynergies } from "./rankedSynergySync";

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
