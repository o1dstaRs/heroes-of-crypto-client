import { describe, expect, test } from "bun:test";

import {
    LAVA_MOVEMENT_OVERLAY_OPACITY_SCALE,
    LAVA_MOVEMENT_OVERLAY_Z_INDEX,
    lavaMovementOverlayCells,
} from "./lavaMovementOverlay";

describe("lava movement overlay", () => {
    const cells = [
        { x: 6, y: 7 },
        { x: 7, y: 7 },
        { x: 8, y: 7 },
        { x: 9, y: 7 },
    ];
    const isLavaCell = (cell: { x: number; y: number }): boolean => cell.x === 7 || cell.x === 8;

    test("sits above the pit foreground and below gameplay targeting", () => {
        expect(LAVA_MOVEMENT_OVERLAY_Z_INDEX).toBeGreaterThan(51);
        expect(LAVA_MOVEMENT_OVERLAY_Z_INDEX).toBeLessThan(55);
    });

    test("boosts the restrained floor wash enough to remain visible against animated fire", () => {
        expect(0.065 * LAVA_MOVEMENT_OVERLAY_OPACITY_SCALE).toBeCloseTo(0.208);
        expect(0.08 * LAVA_MOVEMENT_OVERLAY_OPACITY_SCALE).toBeCloseTo(0.256);
    });

    test("raises only reachable lava cells for a creature that can stand in the fire pit", () => {
        expect(lavaMovementOverlayCells(cells, true, isLavaCell)).toEqual([
            { x: 7, y: 7 },
            { x: 8, y: 7 },
        ]);
    });

    test("keeps the foreground layer empty for creatures that cannot traverse lava", () => {
        expect(lavaMovementOverlayCells(cells, false, isLavaCell)).toEqual([]);
    });
});
