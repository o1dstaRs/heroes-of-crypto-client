import { describe, expect, test } from "bun:test";

import type { Grid } from "@heroesofcrypto/common";

import {
    alliesAreTransparent,
    isTargetedSpellReachable,
    targetedSpellBlockerCell,
    targetedSpellBlockerId,
    thrownSpellImpact,
    thrownSpellReachesTarget,
} from "./spell_targeting";

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

    /*
     * Owner 2026-08-09: Fire Strike is thrown like an arrow, not called down. A body in the line no longer
     * refuses it — it INTERCEPTS it and takes the burn — so the client has to preview the real victim rather
     * than grey the target out. Terrain is the only thing that still refuses the cast.
     */
    describe("Fire Strike interception", () => {
        const LEFT_TEAM = 2;
        const RIGHT_TEAM = 1;
        const teams = new Map<string, { getTeam: () => number }>([["blocking-unit", { getTeam: () => RIGHT_TEAM }]]);

        test("is castable through a body, and reports that body as the impact", () => {
            expect(isTargetedSpellReachable("Fire Strike", sightGrid(true), FROM, TO)).toBe(true);
            const impact = thrownSpellImpact("Fire Strike", sightGrid(true), FROM, TO);
            expect(impact.interceptedBy).toBe("blocking-unit");
            expect(impact.cell).toEqual({ x: 2, y: 1 });
            expect(impact.blockedByTerrain).toBe(false);
        });

        test("lands on the aimed target when the lane is clear", () => {
            const impact = thrownSpellImpact("Fire Strike", sightGrid(false), FROM, TO);
            expect(impact.interceptedBy).toBeUndefined();
            expect(impact.cell).toEqual(TO);
        });

        test("is still refused by terrain, which is reported as a block rather than a victim", () => {
            expect(isTargetedSpellReachable("Fire Strike", terrainGrid("B"), FROM, TO)).toBe(false);
            const impact = thrownSpellImpact("Fire Strike", terrainGrid("B"), FROM, TO);
            expect(impact.blockedByTerrain).toBe(true);
            expect(impact.interceptedBy).toBeUndefined();
        });

        test("arcs over a FRIENDLY body, so the aimed target is the one that burns", () => {
            const friendly = alliesAreTransparent(
                new Map([["blocking-unit", { getTeam: () => LEFT_TEAM }]]),
                LEFT_TEAM,
            );
            const impact = thrownSpellImpact("Fire Strike", sightGrid(true), FROM, TO, friendly);
            expect(impact.interceptedBy).toBeUndefined();
            expect(impact.cell).toEqual(TO);
        });

        // The AI gate is the strict one: an intercepted throw does not REACH the unit being scored, so it
        // must not be proposed against it — the interceptor is enumerated as its own target instead.
        test("does not count as reaching a target it would be intercepted before", () => {
            const enemyScreen = alliesAreTransparent(teams, LEFT_TEAM);
            expect(thrownSpellReachesTarget("Fire Strike", sightGrid(true), FROM, TO, enemyScreen)).toBe(false);
            expect(thrownSpellReachesTarget("Fire Strike", sightGrid(false), FROM, TO, enemyScreen)).toBe(true);
        });
    });

    test("reports the screening creature's cell so the preview can stop the lane there", () => {
        expect(targetedSpellBlockerCell("Vine Throw", sightGrid(true), FROM, TO)).toEqual({ x: 2, y: 1 });
        expect(targetedSpellBlockerCell("Vine Throw", sightGrid(false), FROM, TO)).toBeUndefined();
    });
});
