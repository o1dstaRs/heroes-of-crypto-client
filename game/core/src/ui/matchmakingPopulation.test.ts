import { describe, expect, test } from "bun:test";

import { reconcileArenaPopulation } from "./matchmakingPopulation";

describe("ranked arena population", () => {
    test("shows two online when the live queue has two players and the cached poll still has one", () => {
        expect(reconcileArenaPopulation({ searching: 1, playing: 0, online: 1 }, 2)).toEqual({
            searching: 2,
            playing: 0,
            online: 2,
        });
    });

    test("a delayed population poll cannot overwrite the live queue count", () => {
        const cachedPolls = [
            { searching: 1, playing: 3, online: 4 },
            { searching: 0, playing: 3, online: 3 },
            { searching: 2, playing: 4, online: 6 },
        ];
        for (const population of cachedPolls) {
            const displayed = reconcileArenaPopulation(population, 2);
            expect(displayed?.searching).toBe(2);
            expect(displayed?.online).toBe(2 + population.playing);
        }
    });

    test("players leaving the queue lower the online count, including an empty queue", () => {
        const population = { searching: 3, playing: 2, online: 5 };
        expect(reconcileArenaPopulation(population, 1)).toEqual({ searching: 1, playing: 2, online: 3 });
        expect(reconcileArenaPopulation(population, 0)).toEqual({ searching: 0, playing: 2, online: 2 });
    });

    test("uses the public population until a queue heartbeat arrives and after searching ends", () => {
        const population = { searching: 1, playing: 2, online: 3 };
        expect(reconcileArenaPopulation(population, null)).toBe(population);
        expect(reconcileArenaPopulation(undefined, 2)).toBeUndefined();
    });
});
