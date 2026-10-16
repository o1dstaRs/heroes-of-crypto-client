import { describe, expect, test } from "bun:test";

import type { Grid, Unit } from "@heroesofcrypto/common";

import {
    alliesAreTransparent,
    throwTransparencyFor,
    isTargetedSpellReachable,
    targetedSpellBlockerCell,
    targetedSpellBlockerId,
    thrownSpellImpact,
    thrownSpellReachesTarget,
    swapTargetCellsWithinMovementRange,
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

    // Owner report 2026-09-20: Fireball is thrown exactly like Fire Strike, yet the client spelled the
    // "arcs over friendlies" list out by hand and left it at Fire Strike — so the preview refused a Fireball
    // behind the caster's own front line that the server would have thrown over.
    describe("which throws arc over the caster's own troops", () => {
        const OWN_TEAM = 2;
        const units = new Map([["blocking-unit", { getTeam: () => OWN_TEAM }]]);

        test("the intercepted throws see through allies", () => {
            for (const spellName of ["Fire Strike", "Fireball"]) {
                const transparent = throwTransparencyFor(spellName, units, OWN_TEAM);
                expect(transparent?.("blocking-unit")).toBe(true);
                expect(
                    thrownSpellImpact(spellName, sightGrid(true), FROM, TO, transparent).interceptedBy,
                ).toBeUndefined();
            }
        });

        test("every other throw is stopped by any body", () => {
            for (const spellName of ["Vine Throw", "Ring of Fire"]) {
                expect(throwTransparencyFor(spellName, units, OWN_TEAM)).toBeUndefined();
            }
        });
    });
});

describe("Castling target list: same footprint, standing on a reachable anchor", () => {
    // The swap exchanges ANCHORS, so only two bodies of the same shape land on the cells the other
    // vacated. Neither half of that rule is visible at 1x1 — a single-cell unit's only cell IS its
    // anchor — so these cases are the multi-cell ones a stolen Castling opens up.
    const LOWER = 2;
    const UPPER = 3;

    const unit = (params: {
        id: string;
        team: number;
        anchor: { x: number; y: number };
        width: number;
        height: number;
        dead?: boolean;
    }): Unit => {
        const cells: Array<{ x: number; y: number }> = [];
        for (let dx = 0; dx < params.width; dx += 1) {
            for (let dy = 0; dy < params.height; dy += 1) {
                cells.push({ x: params.anchor.x - dx, y: params.anchor.y - dy });
            }
        }
        return {
            getId: () => params.id,
            getTeam: () => params.team,
            isDead: () => params.dead ?? false,
            getBaseCell: () => params.anchor,
            getCells: () => cells,
            getFootprintWidth: () => params.width,
            getFootprintHeight: () => params.height,
            isSmallSize: () => params.width === 1 && params.height === 1,
        } as unknown as Unit;
    };

    /** Every cell of every unit resolves to its occupant, exactly as Grid.getOccupantUnitId does. */
    const boardOf = (units: Unit[]) => {
        const byCell = new Map<string, Unit>();
        for (const u of units) {
            for (const cell of u.getCells()) {
                byCell.set(`${cell.x},${cell.y}`, u);
            }
        }
        return (cell: { x: number; y: number }) => byCell.get(`${cell.x},${cell.y}`);
    };

    test("offers only the enemy whose footprint matches the caster's", () => {
        const queen = unit({ id: "queen", team: LOWER, anchor: { x: 3, y: 3 }, width: 2, height: 2 });
        const sameShape = unit({ id: "big", team: UPPER, anchor: { x: 7, y: 3 }, width: 2, height: 2 });
        const small = unit({ id: "small", team: UPPER, anchor: { x: 5, y: 5 }, width: 1, height: 1 });
        const rectangle = unit({ id: "mount", team: UPPER, anchor: { x: 9, y: 3 }, width: 2, height: 1 });
        const reach = [sameShape.getBaseCell(), small.getBaseCell(), rectangle.getBaseCell()];

        expect(swapTargetCellsWithinMovementRange(queen, reach, boardOf([sameShape, small, rectangle]))).toEqual([
            { x: 7, y: 3 },
        ]);
    });

    test("a 2x1 swaps with a 2x1 but never with a 1x2 of the same two cells' worth of body", () => {
        const tiger = unit({ id: "tiger", team: LOWER, anchor: { x: 3, y: 3 }, width: 2, height: 1 });
        const wolf = unit({ id: "wolf", team: UPPER, anchor: { x: 7, y: 3 }, width: 2, height: 1 });
        const tall = unit({ id: "tall", team: UPPER, anchor: { x: 9, y: 6 }, width: 1, height: 2 });
        const reach = [wolf.getBaseCell(), tall.getBaseCell()];

        expect(swapTargetCellsWithinMovementRange(tiger, reach, boardOf([wolf, tall]))).toEqual([{ x: 7, y: 3 }]);
    });

    test("reaching a multi-cell enemy's far cell is not reaching it: the ANCHOR has to be reachable", () => {
        const tiger = unit({ id: "tiger", team: LOWER, anchor: { x: 3, y: 3 }, width: 2, height: 1 });
        const wolf = unit({ id: "wolf", team: UPPER, anchor: { x: 7, y: 3 }, width: 2, height: 1 });
        const board = boardOf([wolf]);

        // (6,3) is the wolf's second cell, not its anchor — standing there would put this body on
        // (5,3)-(6,3), cells the wolf never held.
        expect(swapTargetCellsWithinMovementRange(tiger, [{ x: 6, y: 3 }], board)).toEqual([]);
        expect(swapTargetCellsWithinMovementRange(tiger, [{ x: 7, y: 3 }], board)).toEqual([{ x: 7, y: 3 }]);
    });

    test("skips allies and the dead, and never repeats an anchor", () => {
        const harpy = unit({ id: "harpy", team: LOWER, anchor: { x: 2, y: 2 }, width: 1, height: 1 });
        const ally = unit({ id: "ally", team: LOWER, anchor: { x: 3, y: 2 }, width: 1, height: 1 });
        const corpse = unit({ id: "corpse", team: UPPER, anchor: { x: 4, y: 2 }, width: 1, height: 1, dead: true });
        const enemy = unit({ id: "enemy", team: UPPER, anchor: { x: 5, y: 2 }, width: 1, height: 1 });
        const reach = [
            ally.getBaseCell(),
            corpse.getBaseCell(),
            enemy.getBaseCell(),
            enemy.getBaseCell(),
            { x: 9, y: 9 },
        ];

        expect(swapTargetCellsWithinMovementRange(harpy, reach, boardOf([ally, corpse, enemy]))).toEqual([
            { x: 5, y: 2 },
        ]);
    });
});
