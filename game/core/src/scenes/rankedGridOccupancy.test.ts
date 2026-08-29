import { Grid, GridConstants, GridSettings, TeamVals } from "@heroesofcrypto/common";
import type { UnitProperties } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import { RankedPlayScene, rankedUnitCellsMatchAuthoritative, reconcileRankedGridOccupancy } from "./RankedPlayScene";

// The live "Angel couldn't move properly" bug (beta game f5e444ae): a Fairy's move never landed in the
// client grid, so the Angel's move-and-strike preview pathed through a corridor the real board had
// blocked and the server rejected it (attack_not_available). The snapshot fast paths must AUDIT
// occupancy against the authoritative cells, not assume every replayed move updated the grid.

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

const unitState = (
    id: string,
    cells: { x: number; y: number }[],
    size = 1,
    dead = false,
    // Omitted for the square shapes on purpose: `size` is still the only thing an older properties bag
    // carries, and the reconciler must keep reading it as a size x size body when that is all there is.
    footprint?: { width: number; height: number },
) => ({
    properties: {
        id,
        attack_range: 1,
        size,
        footprint_width: footprint?.width,
        footprint_height: footprint?.height,
    } as unknown as UnitProperties,
    team: TeamVals.LOWER,
    dead,
    cells,
});

describe("reconcileRankedGridOccupancy", () => {
    test("distinguishes stale renderable geometry even when the grid is already correct", () => {
        const authoritative = [{ x: 8, y: 10 }];

        expect(rankedUnitCellsMatchAuthoritative([{ x: 8, y: 10 }], authoritative)).toBe(true);
        expect(rankedUnitCellsMatchAuthoritative([{ x: 8, y: 9 }], authoritative)).toBe(false);
        expect(
            rankedUnitCellsMatchAuthoritative(
                [
                    { x: 4, y: 11 },
                    { x: 5, y: 11 },
                    { x: 4, y: 10 },
                    { x: 5, y: 10 },
                ],
                [
                    { x: 5, y: 10 },
                    { x: 4, y: 10 },
                    { x: 5, y: 11 },
                    { x: 4, y: 11 },
                ],
            ),
        ).toBe(true);
    });

    test("snaps stale unit geometry before an AI decision when occupancy is already authoritative", () => {
        const grid = new Grid(gridSettings, 1);
        const authoritative = [{ x: 8, y: 10 }];
        grid.occupyCells(authoritative, "scavenger", TeamVals.LOWER, 1, false, false);
        const positions: { x: number; y: number }[] = [];
        let visualsSynced = 0;
        let matricesRefreshed = 0;
        let stacksRefreshed = 0;
        const unit = {
            isDead: () => false,
            getCells: () => [{ x: 8, y: 9 }],
            setPosition: (x: number, y: number) => positions.push({ x, y }),
            syncVisual: () => {
                visualsSynced += 1;
            },
        };
        const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
            grid,
            unitsHolder: {
                getAllUnits: () => new Map([["scavenger", unit]]),
                refreshStackPowerForAllUnits: () => {
                    stacksRefreshed += 1;
                },
            },
            sc_sceneSettings: { getGridSettings: () => gridSettings },
            drawer: { getUnitsContainer: () => ({}) },
            refreshGridMatrices: () => {
                matricesRefreshed += 1;
            },
        }) as unknown as {
            healRankedGridOccupancy: (units: ReturnType<typeof unitState>[]) => void;
        };

        scene.healRankedGridOccupancy([unitState("scavenger", authoritative)]);

        expect(positions).toHaveLength(1);
        expect(visualsSynced).toBe(1);
        expect(matricesRefreshed).toBe(1);
        expect(stacksRefreshed).toBe(1);
    });

    test("re-registers a unit whose grid cells diverged from the authoritative snapshot", () => {
        const grid = new Grid(gridSettings, 1);
        // The grid still thinks the fairy stands at (6,9); the server says (6,11).
        grid.occupyCells([{ x: 6, y: 9 }], "fairy", TeamVals.LOWER, 1, false, false);

        const fixed = reconcileRankedGridOccupancy(grid, [unitState("fairy", [{ x: 6, y: 11 }])]);

        expect(fixed).toEqual(["fairy"]);
        expect(grid.getOccupantUnitId({ x: 6, y: 11 })).toBe("fairy");
        // Cleared cells read as the NO_UNIT sentinel (empty string), so assert falsy, not undefined.
        expect(Boolean(grid.getOccupantUnitId({ x: 6, y: 9 }))).toBe(false);
        expect(grid.getRegisteredCells("fairy")).toEqual([{ x: 6, y: 11 }]);
    });

    test("clears a stale double-registration (old cells lingering next to the new ones)", () => {
        const grid = new Grid(gridSettings, 1);
        grid.occupyCells([{ x: 3, y: 3 }], "wolf", TeamVals.LOWER, 1, false, false);
        // Simulate a half-applied move: the new cell got occupied without cleaning the old one.
        grid.occupyCells([{ x: 4, y: 3 }], "wolf", TeamVals.LOWER, 1, false, false);

        const fixed = reconcileRankedGridOccupancy(grid, [unitState("wolf", [{ x: 4, y: 3 }])]);

        expect(fixed).toEqual(["wolf"]);
        expect(grid.getOccupantUnitId({ x: 4, y: 3 })).toBe("wolf");
        expect(Boolean(grid.getOccupantUnitId({ x: 3, y: 3 }))).toBe(false);
    });

    test("large (2x2) units re-register their full footprint", () => {
        const grid = new Grid(gridSettings, 1);
        grid.occupyCells(
            [
                { x: 13, y: 12 },
                { x: 14, y: 12 },
                { x: 13, y: 11 },
                { x: 14, y: 11 },
            ],
            "angel",
            TeamVals.LOWER,
            1,
            false,
            false,
        );
        const target = [
            { x: 4, y: 11 },
            { x: 5, y: 11 },
            { x: 4, y: 10 },
            { x: 5, y: 10 },
        ];

        const fixed = reconcileRankedGridOccupancy(grid, [unitState("angel", target, 2)]);

        expect(fixed).toEqual(["angel"]);
        for (const cell of target) {
            expect(grid.getOccupantUnitId(cell)).toBe("angel");
        }
        expect(Boolean(grid.getOccupantUnitId({ x: 14, y: 12 }))).toBe(false);
    });

    test("a rectangular body round-trips: exactly its own cells, and only those", () => {
        // A 2x1 carries size 2, so a reconciler that reads the scalar treats it as a 2x2 and re-registers
        // two cells the unit does not stand on — the board then blocks moves the server allows. The cells
        // it re-registers must be the authoritative ones, no more and no less.
        const grid = new Grid(gridSettings, 1);
        const wide = { width: 2, height: 1 };
        grid.occupyCells(
            [
                { x: 9, y: 4 },
                { x: 8, y: 4 },
            ],
            "wide",
            TeamVals.LOWER,
            1,
            false,
            false,
        );
        const target = [
            { x: 6, y: 7 },
            { x: 5, y: 7 },
        ];

        const fixed = reconcileRankedGridOccupancy(grid, [unitState("wide", target, 2, false, wide)]);

        expect(fixed).toEqual(["wide"]);
        expect(rankedUnitCellsMatchAuthoritative(grid.getRegisteredCells("wide"), target)).toBe(true);
        for (const cell of target) {
            expect(grid.getOccupantUnitId(cell)).toBe("wide");
        }
        // The row above the body is NOT part of it — the 2x2 reading would have claimed it.
        expect(Boolean(grid.getOccupantUnitId({ x: 6, y: 8 }))).toBe(false);
        expect(Boolean(grid.getOccupantUnitId({ x: 9, y: 4 }))).toBe(false);
    });

    test("reports only the units the grid actually took", () => {
        // "Fixed" drives the caller's decision to stop looking. A refused occupy leaves the unit with no
        // registration at all, so calling that fixed is worse than the divergence it was healing.
        const grid = new Grid(gridSettings, 1);
        const refusing = Object.assign(Object.create(Grid.prototype), grid, {
            getRegisteredCells: () => [],
            getOccupantUnitId: () => undefined,
            cleanupAll: () => undefined,
            occupyCells: () => false,
        });

        expect(reconcileRankedGridOccupancy(refusing, [unitState("ghost", [{ x: 1, y: 1 }])])).toEqual([]);
    });

    test("leaves in-sync, dead and cell-less units untouched", () => {
        const grid = new Grid(gridSettings, 1);
        grid.occupyCells([{ x: 2, y: 2 }], "orc", TeamVals.LOWER, 1, false, false);

        const fixed = reconcileRankedGridOccupancy(grid, [
            unitState("orc", [{ x: 2, y: 2 }]),
            unitState("corpse", [{ x: 9, y: 9 }], 1, true),
            unitState("bench", []),
        ]);

        expect(fixed).toEqual([]);
        expect(grid.getOccupantUnitId({ x: 2, y: 2 })).toBe("orc");
        expect(Boolean(grid.getOccupantUnitId({ x: 9, y: 9 }))).toBe(false);
    });
});
