import { describe, expect, test } from "bun:test";

import { GridConstants, GridSettings } from "@heroesofcrypto/common";

import {
    DEFAULT_MOVEMENT_AREA_TUNING,
    movementAreaRowFromTop,
    movementAreaBottomLiftForCell,
    movementAreaTopLiftForCell,
    normalizeMovementAreaTuning,
} from "./movementAreaTuning";

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

describe("movement-area top-row tuning", () => {
    test("addresses only the two visually uppermost rows", () => {
        const gs = settings();
        const topY = Math.round((gs.getMaxY() - gs.getMinY()) / gs.getStep()) - 1;
        const tuning = normalizeMovementAreaTuning({ firstRowTopLiftCells: 0.25, secondRowTopLiftCells: 0.4 });

        expect(movementAreaRowFromTop({ x: 3, y: topY }, gs)).toBe(0);
        expect(movementAreaTopLiftForCell({ x: 3, y: topY }, gs, tuning)).toBe(0.25);
        expect(movementAreaTopLiftForCell({ x: 3, y: topY - 1 }, gs, tuning)).toBe(0.4);
        expect(movementAreaTopLiftForCell({ x: 3, y: topY - 2 }, gs, tuning)).toBe(0);
    });

    test("moves the uppermost row bottom independently", () => {
        const gs = settings();
        const topY = Math.round((gs.getMaxY() - gs.getMinY()) / gs.getStep()) - 1;
        const tuning = normalizeMovementAreaTuning({ firstRowBottomLiftCells: -0.12 });

        expect(movementAreaBottomLiftForCell({ x: 3, y: topY }, gs, tuning)).toBe(-0.12);
        expect(movementAreaBottomLiftForCell({ x: 3, y: topY - 1 }, gs, tuning)).toBe(0);
    });

    test("clamps malformed drafts and keeps the approved two-row lift", () => {
        expect(DEFAULT_MOVEMENT_AREA_TUNING.firstRowTopLiftCells).toBe(0.055);
        expect(DEFAULT_MOVEMENT_AREA_TUNING.secondRowTopLiftCells).toBe(0.055);
        expect(DEFAULT_MOVEMENT_AREA_TUNING.firstRowBottomLiftCells).toBe(0.04);
        expect(normalizeMovementAreaTuning({}).firstRowBottomLiftCells).toBe(0.04);
        expect(normalizeMovementAreaTuning({}).firstRowTopLiftCells).toBe(0.055);
        expect(normalizeMovementAreaTuning({ firstRowTopLiftCells: 99 }).firstRowTopLiftCells).toBe(1.5);
        expect(normalizeMovementAreaTuning({ secondRowTopLiftCells: -99 }).secondRowTopLiftCells).toBe(-0.5);
    });
});
