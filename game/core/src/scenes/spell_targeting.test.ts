import { describe, expect, test } from "bun:test";

import type { Grid } from "@heroesofcrypto/common";

import { isTargetedSpellReachable, targetedSpellBlockerCell, targetedSpellBlockerId } from "./spell_targeting";

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

    // Owner 2026-08-08: Vine Throw arcs over terrain — only a creature screens it. The aim preview draws
    // the lane up to the blocking CELL, so the client needs the cell, not just who stands on it.
    const terrainGrid = (marker: string): Pick<Grid, "getOccupantUnitId" | "getSettings"> =>
        ({
            getOccupantUnitId: ({ x, y }) => (x === 2 && y === 1 ? marker : undefined),
            getSettings: () => ({ getGridSize: () => 16 }) as ReturnType<Grid["getSettings"]>,
        }) as Pick<Grid, "getOccupantUnitId" | "getSettings">;

    test("Vine Throw arcs over the mountain and a narrowed hole", () => {
        for (const marker of ["B", "H"]) {
            expect(isTargetedSpellReachable("Vine Throw", terrainGrid(marker), FROM, TO)).toBe(true);
            expect(targetedSpellBlockerId("Vine Throw", terrainGrid(marker), FROM, TO)).toBeUndefined();
        }
        // Fire Strike still obeys the archer's rule, so the same rock stops it.
        expect(targetedSpellBlockerId("Fire Strike", terrainGrid("B"), FROM, TO)).toBe("B");
    });

    test("reports the screening creature's cell so the preview can stop the lane there", () => {
        expect(targetedSpellBlockerCell("Vine Throw", sightGrid(true), FROM, TO)).toEqual({ x: 2, y: 1 });
        expect(targetedSpellBlockerCell("Vine Throw", sightGrid(false), FROM, TO)).toBeUndefined();
    });
});
