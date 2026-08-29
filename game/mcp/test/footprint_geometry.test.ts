import { afterEach, describe, expect, test } from "bun:test";

import { GridConstants, GridMath, GridSettings, GridVals, Grid, TeamVals, UnitSizeVals } from "@heroesofcrypto/common";

import { creatureNameFromId, createUnitFromCreatureId, placeDraftUnit } from "../src/draft";
import { getAvailableSummonCells } from "../src/legal_actions";
import { createMcpUnit } from "../src/test_units";

/**
 * The mcp driver's footprint geometry: the draft placement expansion and the summon ring, with
 * rectangular bodies in play. First test file of the package — the driver proposes actions the engine
 * then validates, so anchor-convention drift here surfaces as engine rejects in live model matches.
 */

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

afterEach(() => {
    delete (globalThis as { __hocFootprintOverrides?: unknown }).__hocFootprintOverrides;
});

describe("draft placement with rectangular footprints", () => {
    test("placeDraftUnit expands the MAX-corner anchor and centres the unit on the whole body", () => {
        const name = creatureNameFromId(3);
        (globalThis as { __hocFootprintOverrides?: string }).__hocFootprintOverrides = `${name}=2x1`;
        const unit = createUnitFromCreatureId(3, TeamVals.LEFT, gridSettings);
        expect(unit.getFootprintWidth()).toBe(2);
        expect(unit.getFootprintHeight()).toBe(1);

        const cells = placeDraftUnit(gridSettings, unit, { x: 5, y: 3 });
        // Canonical anchor-first expansion: the body hangs down-left of the MAX corner.
        expect(cells).toEqual([
            { x: 5, y: 3 },
            { x: 4, y: 3 },
        ]);
        // The unit's position is the centre of the whole block, so its cells read back as the same body.
        expect(unit.getCells().map((cell) => `${cell.x}:${cell.y}`).sort()).toEqual(["4:3", "5:3"]);
        expect(unit.getBaseCell()).toEqual({ x: 5, y: 3 });
    });

    test("an anchor whose body would hang off the board is refused loudly", () => {
        const name = creatureNameFromId(3);
        (globalThis as { __hocFootprintOverrides?: string }).__hocFootprintOverrides = `${name}=1x3`;
        const unit = createUnitFromCreatureId(3, TeamVals.LEFT, gridSettings);
        expect(unit.getFootprintHeight()).toBe(3);
        // y = 1 leaves the bottom cell at y = -1: off the board, not silently clipped.
        expect(() => placeDraftUnit(gridSettings, unit, { x: 5, y: 1 })).toThrow();
        expect(placeDraftUnit(gridSettings, unit, { x: 5, y: 2 })).toHaveLength(3);
    });
});

describe("summon ring around a multi-cell caster", () => {
    test("candidates surround the WHOLE body and never include the caster's own cells", () => {
        const caster = createMcpUnit({ size: UnitSizeVals.LARGE, spells: ["Nature:Summon Wolves"] });
        const anchor = { x: 5, y: 5 };
        const body = GridMath.getFootprintCellsForAnchor(anchor, 2, 2);
        const position = GridMath.getPositionForCells(gridSettings, body);
        expect(position).toBeDefined();
        caster.setPosition(position!.x, position!.y);
        expect(caster.getCells()).toHaveLength(4);

        const spell = caster.getSpells().find((candidate) => candidate.isSummon());
        expect(spell).toBeDefined();

        const grid = new Grid(gridSettings, GridVals.NORMAL);
        const ring = getAvailableSummonCells(caster, grid, spell!);
        // A 2x2 interior body has a 12-cell perimeter ring on an empty board.
        expect(ring).toHaveLength(12);
        const own = new Set(caster.getCells().map((cell) => `${cell.x}:${cell.y}`));
        for (const cell of ring) {
            expect(own.has(`${cell.x}:${cell.y}`)).toBe(false);
            // Chebyshev-adjacent to at least one body cell — a true ring, not an anchor halo.
            expect(
                caster
                    .getCells()
                    .some((bodyCell) => Math.max(Math.abs(bodyCell.x - cell.x), Math.abs(bodyCell.y - cell.y)) === 1),
            ).toBe(true);
        }
        // The far side of the body (below-left of the anchor block) is reachable — the old
        // anchor-ring missed it entirely.
        expect(ring.some((cell) => cell.x === 3 && cell.y === 3)).toBe(true);
    });
});
