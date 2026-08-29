import { describe, expect, test } from "bun:test";

import { GridConstants, GridSettings } from "@heroesofcrypto/common";

import { projectedCellPoints } from "./sandbox/BattlefieldVisualGrid";
import { MOVEMENT_TILE_INSET_CELLS, movementTilePolygon } from "./movementAreaVisual";
import { normalizeMovementAreaTuning } from "./movementAreaTuning";

const settings = () =>
    new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );

describe("movement-area cell fill", () => {
    test("insets the wash so painted seams remain untouched", () => {
        const gs = settings();
        const cell = { x: 7, y: 8 };

        expect(MOVEMENT_TILE_INSET_CELLS).toBeGreaterThan(0);
        expect(movementTilePolygon(cell, gs)).toEqual(projectedCellPoints(cell, gs, MOVEMENT_TILE_INSET_CELLS));
        expect(movementTilePolygon(cell, gs)).not.toEqual(projectedCellPoints(cell, gs));
    });

    test("raises only the top edge of either calibrated row", () => {
        const gs = settings();
        const topY = Math.round((gs.getMaxY() - gs.getMinY()) / gs.getStep()) - 1;
        const cell = { x: 7, y: topY };
        const base = movementTilePolygon(cell, gs, normalizeMovementAreaTuning());
        const lifted = movementTilePolygon(
            cell,
            gs,
            normalizeMovementAreaTuning({ firstRowTopLiftCells: 0.3, secondRowTopLiftCells: 0 }),
        );

        const baseY = base.filter((_, index) => index % 2 === 1);
        const liftedY = lifted.filter((_, index) => index % 2 === 1);
        expect(Math.min(...liftedY)).toBe(Math.min(...baseY));
        expect(Math.max(...liftedY)).toBeGreaterThan(Math.max(...baseY));
    });

    test("moves only the bottom edge of the uppermost row", () => {
        const gs = settings();
        const topY = Math.round((gs.getMaxY() - gs.getMinY()) / gs.getStep()) - 1;
        const cell = { x: 7, y: topY };
        const base = movementTilePolygon(cell, gs, normalizeMovementAreaTuning());
        const shifted = movementTilePolygon(cell, gs, normalizeMovementAreaTuning({ firstRowBottomLiftCells: 0.2 }));

        const baseY = base.filter((_, index) => index % 2 === 1);
        const shiftedY = shifted.filter((_, index) => index % 2 === 1);
        expect(Math.max(...shiftedY)).toBe(Math.max(...baseY));
        expect(Math.min(...shiftedY)).toBeGreaterThan(Math.min(...baseY));
    });
});
