import { describe, expect, test } from "bun:test";

import type { Grid } from "@heroesofcrypto/common";

import { isTargetedSpellReachable } from "./spell_targeting";

const sightGrid = (blocked: boolean): Pick<Grid, "getOccupantUnitId" | "getSettings"> =>
    ({
        getOccupantUnitId: ({ x, y }) => (blocked && x === 2 && y === 1 ? "blocking-unit" : undefined),
        getSettings: () =>
            ({
                getGridSize: () => 16,
            }) as ReturnType<Grid["getSettings"]>,
    }) as Pick<Grid, "getOccupantUnitId" | "getSettings">;

const FROM = { x: 1, y: 1 };
const TO = { x: 3, y: 1 };

describe("client targeted-spell reachability", () => {
    test("allows a clear Vine Throw lane", () => {
        expect(isTargetedSpellReachable("Vine Throw", sightGrid(false), FROM, TO)).toBe(true);
    });

    test("rejects Vine Throw when a unit blocks the lane", () => {
        expect(isTargetedSpellReachable("Vine Throw", sightGrid(true), FROM, TO)).toBe(false);
    });

    test("keeps called-down targeted spells legal through an occupied lane", () => {
        expect(isTargetedSpellReachable("Lightning Strike", sightGrid(true), FROM, TO)).toBe(true);
    });
});
