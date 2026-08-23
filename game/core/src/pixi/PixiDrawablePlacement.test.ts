import { describe, expect, test } from "bun:test";

import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { projectedCellPoints } from "../scenes/sandbox/BattlefieldVisualGrid";
import {
    PLACEMENT_BOUNDARY_TOP_EXTENSION,
    PLACEMENT_TILE_INSET_CELLS,
    placementBoundarySides,
    placementTileOpacity,
    placementTilePolygon,
    placementVerticalBoundarySpan,
} from "./PixiDrawablePlacement";

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

describe("placement tile highlight", () => {
    test("extends only the top boundary upward by one percent", () => {
        expect(PLACEMENT_BOUNDARY_TOP_EXTENSION).toBe(0.01);
    });

    test("uses an inset projected polygon so the native grout remains untouched", () => {
        const gs = settings();
        const cell = { x: 2, y: 7 };

        expect(PLACEMENT_TILE_INSET_CELLS).toBeGreaterThan(0);
        expect(placementTilePolygon(cell, gs)).toEqual(projectedCellPoints(cell, gs, PLACEMENT_TILE_INSET_CELLS));
        expect(placementTilePolygon(cell, gs)).not.toEqual(projectedCellPoints(cell, gs));
    });

    test("keeps the current-turn-style pulse subtle", () => {
        const samples = Array.from({ length: 32 }, (_, index) => placementTileOpacity((index * Math.PI) / 8));
        expect(samples.every((alpha) => alpha >= 0.09 && alpha <= 0.11)).toBe(true);
        expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.019);
    });

    test("adds emphasis only to outward-facing tile sides", () => {
        const occupied = new Set(["3:4", "4:4", "3:5", "4:5"]);

        expect(placementBoundarySides({ x: 3, y: 4 }, occupied)).toEqual({
            left: true,
            right: false,
            bottom: true,
            top: false,
        });
        expect(placementBoundarySides({ x: 4, y: 5 }, occupied)).toEqual({
            left: false,
            right: true,
            bottom: false,
            top: true,
        });
    });

    test("trims vertical boundary strips so corner alpha never overlaps", () => {
        expect(placementVerticalBoundarySpan({ left: true, right: false, bottom: true, top: true })).toEqual({
            start: 0.077,
            end: 0.923,
        });
        expect(placementVerticalBoundarySpan({ left: true, right: false, bottom: false, top: false })).toEqual({
            start: 0,
            end: 1,
        });
    });
});
