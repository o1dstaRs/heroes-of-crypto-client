import { describe, expect, test } from "bun:test";

import { GridConstants, GridMath, GridSettings, PlacementPositionType } from "@heroesofcrypto/common";
import { projectedCellPoints } from "../scenes/sandbox/BattlefieldVisualGrid";
import {
    ENEMY_MOVEMENT_HIGHLIGHT_COLOR,
    movementFillAlphaForPhase,
    movementTilePolygon,
    tunedCellFillCornerPoints,
} from "../scenes/movementAreaVisual";
import {
    GREEN_PLACEMENT_HIGHLIGHT_COLOR,
    GREEN_PLACEMENT_OPACITY_SCALE,
    GREEN_PLACEMENT_CARPET_TOP_EXTENSION,
    GREEN_PLACEMENT_GOLD_BORDER_OPACITY,
    PLACEMENT_GOLD_BORDER_BOTTOM_DROP,
    PLACEMENT_GOLD_BORDER_LEFT_EXTENSION,
    PLACEMENT_GOLD_BORDER_RIGHT_EXTENSION,
    PLACEMENT_GOLD_BORDER_TOP_EXTENSION,
    RED_PLACEMENT_GOLD_BORDER_BOTTOM_OPACITY,
    RED_PLACEMENT_GOLD_BORDER_LEFT_OPACITY,
    RED_PLACEMENT_GOLD_BORDER_RIGHT_OPACITY,
    RED_PLACEMENT_GOLD_BORDER_TOP_OPACITY,
    PLACEMENT_WASH_TOP_EXTENSION_RATIO,
    PLACEMENT_WASH_TOP_MIN_ALPHA,
    PLACEMENT_WASH_TOP_OPACITY_MULTIPLIER,
    RED_PLACEMENT_WASH_TOP_MIN_ALPHA,
    RED_PLACEMENT_WASH_TOP_OPACITY_MULTIPLIER,
    PLACEMENT_WASH_BOTTOM_TRIM_CELLS,
    PLACEMENT_BOUNDARY_TOP_EXTENSION,
    PLACEMENT_CARPET_HEIGHT_SCALE,
    PLACEMENT_TILE_INSET_CELLS,
    placementBoundarySides,
    placementCarpetCellPolygon,
    placementCarpetSeamEdges,
    placementGoldBorderCellPolygon,
    placementGoldBorderTextureKey,
    placementGoldBorderZonePolygon,
    placementGreenCarpetTextureKey,
    placementCarpetTextureFrame,
    placementCarpetOpacityForPhase,
    placementTileOpacity,
    placementTilePolygon,
    placementUsesEnemyMovementWash,
    placementWashCellPolygon,
    placementWashTopExtensionPolygon,
    placementZonePolygon,
    placementVerticalBoundarySpan,
    DrawableRectanglePlacement,
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
    test("keeps separately redrawn green carpet textures for every upgraded width", () => {
        expect(placementGreenCarpetTextureKey()).toBe("placement_carpet_green_uniform_gold_aaa_3col_v16");
        expect(placementGreenCarpetTextureKey(4)).toBe("placement_carpet_green_uniform_gold_aaa_4col_v16");
        expect(placementGreenCarpetTextureKey(5)).toBe("placement_carpet_green_uniform_gold_aaa_5col_v16");
        expect(placementGreenCarpetTextureKey(6)).toBe("placement_carpet_green_uniform_gold_aaa_5col_v16");
    });

    test("selects the continuous 20%-thicker v23 raster frame for every green field extension", () => {
        for (const columns of [3, 4, 5, 6]) {
            for (const rows of [14, 16]) {
                expect(String(placementGoldBorderTextureKey(columns, rows))).toBe(
                    `placement_gold_outer_border_green_continuous_${columns}col_${rows}row_v23`,
                );
            }
        }
    });

    test("uses the same continuous 20%-thicker v23 raster frame for the red field", () => {
        expect(GREEN_PLACEMENT_GOLD_BORDER_OPACITY).toBe(0.6);
        expect(RED_PLACEMENT_GOLD_BORDER_TOP_OPACITY).toBe(0.6);
        expect(RED_PLACEMENT_GOLD_BORDER_RIGHT_OPACITY).toBe(0.6);
        expect(RED_PLACEMENT_GOLD_BORDER_LEFT_OPACITY).toBe(0.6);
        expect(RED_PLACEMENT_GOLD_BORDER_BOTTOM_OPACITY).toBe(0.6);
        for (const columns of [3, 4, 5, 6]) {
            for (const rows of [14, 16]) {
                expect(String(placementGoldBorderTextureKey(columns, rows, true))).toBe(
                    `placement_gold_outer_border_green_continuous_${columns}col_${rows}row_v23`,
                );
            }
        }
    });

    test("raises only the top of both raster borders while keeping the bottom on the test-server zone", () => {
        const gs = settings();
        const cells = [
            { x: 10, y: 0 },
            { x: 10, y: 1 },
            { x: 10, y: 2 },
        ];
        const borderTop = placementGoldBorderCellPolygon(cells[0], gs, cells);
        const borderBottom = placementGoldBorderCellPolygon(cells[2], gs, cells);
        const topFull = projectedCellPoints(cells[2], gs);
        const fullPolygons = cells.map((cell) => projectedCellPoints(cell, gs));
        const fullMinY = Math.min(...fullPolygons.flatMap((points) => [points[1], points[3], points[5], points[7]]));
        const fullMaxY = Math.max(...fullPolygons.flatMap((points) => [points[1], points[3], points[5], points[7]]));
        const fullHeight = fullMaxY - fullMinY;

        expect(PLACEMENT_GOLD_BORDER_TOP_EXTENSION).toBe(0.001);
        expect(PLACEMENT_GOLD_BORDER_BOTTOM_DROP).toBe(0.001);
        expect(PLACEMENT_GOLD_BORDER_LEFT_EXTENSION).toBe(0.003);
        expect(PLACEMENT_GOLD_BORDER_RIGHT_EXTENSION).toBe(0.002);
        const bottomFull = projectedCellPoints(cells[0], gs);
        expect(borderTop[1]).toBeCloseTo(bottomFull[1] - fullHeight * PLACEMENT_GOLD_BORDER_BOTTOM_DROP, 8);
        expect(borderTop[3]).toBeCloseTo(bottomFull[3] - fullHeight * PLACEMENT_GOLD_BORDER_BOTTOM_DROP, 8);
        expect(borderTop.slice(4)).toEqual(bottomFull.slice(4));
        expect(Math.min(borderBottom[5], borderBottom[7])).toBeCloseTo(
            Math.min(topFull[5], topFull[7]) + fullHeight * PLACEMENT_GOLD_BORDER_TOP_EXTENSION,
            8,
        );
        expect(borderBottom.slice(0, 4)).toEqual(topFull.slice(0, 4));

        const zone = placementZonePolygon(cells, gs);
        const completeFrame = placementGoldBorderZonePolygon(cells, gs);
        const zoneMinX = Math.min(zone[0], zone[2], zone[4], zone[6]);
        const zoneMaxX = Math.max(zone[0], zone[2], zone[4], zone[6]);
        const width = zoneMaxX - zoneMinX;
        const leftExtension = width * PLACEMENT_GOLD_BORDER_LEFT_EXTENSION;
        const rightExtension = width * PLACEMENT_GOLD_BORDER_RIGHT_EXTENSION;
        expect(completeFrame[0]).toBeCloseTo(zone[0] - leftExtension, 8);
        expect(completeFrame[6]).toBeCloseTo(zone[6] - leftExtension, 8);
        expect(completeFrame[2]).toBeCloseTo(zone[2] + rightExtension, 8);
        expect(completeFrame[4]).toBeCloseTo(zone[4] + rightExtension, 8);
        expect(completeFrame[1]).toBeCloseTo(zone[1] - fullHeight * PLACEMENT_GOLD_BORDER_BOTTOM_DROP, 8);
        expect(completeFrame[3]).toBeCloseTo(zone[3] - fullHeight * PLACEMENT_GOLD_BORDER_BOTTOM_DROP, 8);
        expect(completeFrame[5]).toBeCloseTo(zone[5] + fullHeight * PLACEMENT_GOLD_BORDER_TOP_EXTENSION, 8);
        expect(completeFrame[7]).toBeCloseTo(zone[7] + fullHeight * PLACEMENT_GOLD_BORDER_TOP_EXTENSION, 8);
    });

    test("extends the red and green wash to the raised frame at the top", () => {
        const gs = settings();
        const cells = [
            { x: 10, y: 0 },
            { x: 10, y: 1 },
            { x: 10, y: 2 },
        ];
        const zone = placementZonePolygon(cells, gs);
        const extension = placementWashTopExtensionPolygon(cells, gs);
        const topInset = placementTilePolygon(cells[2], gs);
        const fullPolygons = cells.map((cell) => projectedCellPoints(cell, gs));
        const fullMinY = Math.min(...fullPolygons.flatMap((points) => [points[1], points[3], points[5], points[7]]));
        const fullMaxY = Math.max(...fullPolygons.flatMap((points) => [points[1], points[3], points[5], points[7]]));

        expect(PLACEMENT_WASH_TOP_EXTENSION_RATIO).toBe(PLACEMENT_GOLD_BORDER_TOP_EXTENSION);
        expect(PLACEMENT_WASH_TOP_EXTENSION_RATIO).toBe(0.001);
        expect(PLACEMENT_WASH_TOP_OPACITY_MULTIPLIER).toBe(1);
        expect(PLACEMENT_WASH_TOP_MIN_ALPHA).toBe(0);
        expect(extension.slice(0, 4)).toEqual([topInset[6], topInset[7], topInset[4], topInset[5]]);
        expect(extension[5] - zone[5]).toBeCloseTo((fullMaxY - fullMinY) * PLACEMENT_WASH_TOP_EXTENSION_RATIO, 8);
        expect(extension[7] - zone[7]).toBeCloseTo((fullMaxY - fullMinY) * PLACEMENT_WASH_TOP_EXTENSION_RATIO, 8);
    });

    test("trims only the visual bottom row of the placement wash", () => {
        const gs = settings();
        const cells = [
            { x: 2, y: 1 },
            { x: 2, y: 2 },
        ];
        const bottom = placementWashCellPolygon(cells[0], cells, gs);
        const top = placementWashCellPolygon(cells[1], cells, gs);
        const regularBottom = placementTilePolygon(cells[0], gs);

        expect(PLACEMENT_WASH_BOTTOM_TRIM_CELLS).toBe(0.012);
        expect(bottom[1]).not.toBe(regularBottom[1]);
        expect(bottom.slice(4)).toEqual(regularBottom.slice(4));
        expect(top).toEqual(placementTilePolygon(cells[1], gs));
    });

    test("derives decorative seams from every real shared cell edge", () => {
        const gs = settings();
        const columns = 4;
        const rows = 16;
        const cells = Array.from({ length: columns * rows }, (_, index) => ({
            x: 2 + Math.floor(index / rows),
            y: index % rows,
        }));
        const edges = placementCarpetSeamEdges(cells, gs);

        expect(edges).toHaveLength((columns - 1) * rows + columns * (rows - 1));
        expect(edges.every(({ from, to }) => Math.hypot(to.x - from.x, to.y - from.y) > 0)).toBe(true);
    });

    test("matches the red field's inner transparency on the green carpet", () => {
        const dimPhase = -Math.PI / (2 * 0.65);
        const brightPhase = Math.PI / (2 * 0.65);

        expect(placementCarpetOpacityForPhase(dimPhase)).toBeCloseTo(movementFillAlphaForPhase(dimPhase));
        expect(placementCarpetOpacityForPhase(brightPhase)).toBeCloseTo(movementFillAlphaForPhase(brightPhase));
        expect(placementCarpetOpacityForPhase(dimPhase)).toBeCloseTo(0.065);
        expect(placementCarpetOpacityForPhase(brightPhase)).toBeCloseTo(0.08);
    });

    test("uses the green army flag palette at a visibility-compensated opacity", () => {
        expect(GREEN_PLACEMENT_HIGHLIGHT_COLOR).toBe(0x102b1b);
        expect(GREEN_PLACEMENT_OPACITY_SCALE).toBe(2);
        expect(GREEN_PLACEMENT_HIGHLIGHT_COLOR).not.toBe(ENEMY_MOVEMENT_HIGHLIGHT_COLOR);
        expect(movementFillAlphaForPhase(0) * GREEN_PLACEMENT_OPACITY_SCALE).toBeCloseTo(0.145, 5);
        expect(movementFillAlphaForPhase(0) * (2.7 - GREEN_PLACEMENT_OPACITY_SCALE)).toBeCloseTo(0.05075, 5);
    });

    test("renders the red field with the exact enemy movement wash contract", () => {
        const dimPhase = -Math.PI / (2 * 0.65);
        const brightPhase = Math.PI / (2 * 0.65);

        expect(placementUsesEnemyMovementWash(PlacementPositionType.UPPER_LEFT)).toBe(true);
        expect(placementUsesEnemyMovementWash(PlacementPositionType.UPPER_RIGHT)).toBe(true);
        expect(placementUsesEnemyMovementWash(PlacementPositionType.LOWER_LEFT)).toBe(false);
        expect(ENEMY_MOVEMENT_HIGHLIGHT_COLOR).toBe(0xff3b3b);
        expect(movementFillAlphaForPhase(dimPhase)).toBeCloseTo(0.065);
        expect(movementFillAlphaForPhase(brightPhase)).toBeCloseTo(0.08);
        expect(RED_PLACEMENT_WASH_TOP_OPACITY_MULTIPLIER).toBe(1);
        expect(RED_PLACEMENT_WASH_TOP_MIN_ALPHA).toBe(0);
        expect(
            Math.max(
                RED_PLACEMENT_WASH_TOP_MIN_ALPHA,
                movementFillAlphaForPhase(brightPhase) * RED_PLACEMENT_WASH_TOP_OPACITY_MULTIPLIER,
            ),
        ).toBeCloseTo(movementFillAlphaForPhase(brightPhase));
    });

    test("washes the UPPER field red and the LOWER field green, from every seat", () => {
        // Placement zones are coloured by TEAM, not by viewer: an UPPER player's own zone reads RED. The
        // viewer-relative flip briefly reversed this (b0aed99c) and was reverted — see scenes/teamColors.ts.
        expect(placementUsesEnemyMovementWash(PlacementPositionType.UPPER_LEFT)).toBe(true);
        expect(placementUsesEnemyMovementWash(PlacementPositionType.UPPER_RIGHT)).toBe(true);
        expect(placementUsesEnemyMovementWash(PlacementPositionType.LOWER_LEFT)).toBe(false);
        expect(placementUsesEnemyMovementWash(PlacementPositionType.LOWER_RIGHT)).toBe(false);
    });
    test("slices every green cell from its exact region of one continuous carpet image", () => {
        const cells = [
            { x: 2, y: 4 },
            { x: 2, y: 5 },
            { x: 3, y: 4 },
            { x: 3, y: 5 },
        ];

        expect(placementCarpetTextureFrame({ x: 2, y: 5 }, cells, 400, 800)).toEqual({
            x: 0,
            y: 0,
            width: 200,
            height: 400,
        });
        expect(placementCarpetTextureFrame({ x: 3, y: 4 }, cells, 400, 800)).toEqual({
            x: 200,
            y: 400,
            width: 200,
            height: 400,
        });
    });
    test("uses upgrade-dependent left and right deployment columns", () => {
        const gs = settings();
        const left = new DrawableRectanglePlacement(gs, PlacementPositionType.LOWER_LEFT, 3);
        const right = new DrawableRectanglePlacement(gs, PlacementPositionType.UPPER_RIGHT, 5);

        expect(left.possibleCellPositions()).toHaveLength(3 * (GridConstants.GRID_SIZE - 2));
        expect(left.possibleCellPositions().every(({ x, y }) => x >= 1 && x <= 3 && y >= 1 && y <= 14)).toBe(true);
        expect(right.possibleCellPositions()).toHaveLength(5 * GridConstants.GRID_SIZE);
        expect(right.possibleCellPositions().every(({ x, y }) => x >= 10 && x <= 14 && y >= 0 && y <= 15)).toBe(true);
    });

    test("validates world-space cell centers through the shared placement contract", () => {
        const gs = settings();
        const left = new DrawableRectanglePlacement(gs, PlacementPositionType.LOWER_LEFT, 3);
        const positionFor = (cell: { x: number; y: number }) =>
            GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());

        expect(left.isAllowed(positionFor({ x: 1, y: 1 }))).toBe(true);
        expect(left.isAllowed(positionFor({ x: 3, y: 14 }))).toBe(true);
        expect(left.isAllowed(positionFor({ x: 4, y: 7 }))).toBe(false);
    });

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

    test("uses the approved upper-row fill geometry for deployment tiles too", () => {
        const gs = settings();
        const topY = Math.round((gs.getMaxY() - gs.getMinY()) / gs.getStep()) - 1;
        const topCell = { x: 7, y: topY };

        expect(PLACEMENT_TILE_INSET_CELLS).toBe(0.028);
        expect(placementTilePolygon(topCell, gs)).toEqual(movementTilePolygon(topCell, gs));
    });

    test("covers internal grout and extends the complete carpet height by 0.2 percent", () => {
        const gs = settings();
        const cells = [
            { x: 2, y: 4 },
            { x: 2, y: 5 },
            { x: 2, y: 6 },
        ];
        const bottomFull = projectedCellPoints(cells[0], gs);
        const topFull = projectedCellPoints(cells[2], gs);
        const bottomCarpet = placementCarpetCellPolygon(cells[0], gs, cells);
        const middleCarpet = placementCarpetCellPolygon(cells[1], gs, cells);
        const topCarpet = placementCarpetCellPolygon(cells[2], gs, cells);
        const fullHeight = Math.max(bottomFull[1], bottomFull[3]) - Math.min(topFull[5], topFull[7]);
        const carpetHeight = Math.max(bottomCarpet[1], bottomCarpet[3]) - Math.min(topCarpet[5], topCarpet[7]);

        expect(PLACEMENT_CARPET_HEIGHT_SCALE).toBe(1.002);
        expect(carpetHeight / fullHeight).toBeCloseTo(PLACEMENT_CARPET_HEIGHT_SCALE, 8);
        expect(bottomCarpet[5]).toBe(bottomFull[5]);
        expect(middleCarpet).toEqual(projectedCellPoints(cells[1], gs));
        expect(topCarpet[1]).toBe(topFull[1]);
    });

    test("keeps the green carpet upward extension", () => {
        const gs = settings();
        const cells = [
            { x: 2, y: 4 },
            { x: 2, y: 5 },
            { x: 2, y: 6 },
        ];
        const topFull = projectedCellPoints(cells[0], gs);
        const bottomFull = projectedCellPoints(cells[2], gs);
        const fullHeight = Math.max(bottomFull[5], bottomFull[7]) - Math.min(topFull[1], topFull[3]);
        const greenTop = placementCarpetCellPolygon(cells[0], gs, cells, GREEN_PLACEMENT_CARPET_TOP_EXTENSION);

        expect(GREEN_PLACEMENT_CARPET_TOP_EXTENSION).toBe(0.01);
        expect(Math.min(topFull[1], topFull[3]) - Math.min(greenTop[1], greenTop[3])).toBeCloseTo(
            fullHeight * (0.001 + 0.01),
            8,
        );
    });

    test("fills the deployment zone as one polygon spanning its internal grout", () => {
        const gs = settings();
        const cells = [
            { x: 2, y: 4 },
            { x: 2, y: 5 },
            { x: 3, y: 4 },
            { x: 3, y: 5 },
        ];
        const bottomLeft = projectedCellPoints(cells[0], gs);
        const bottomRight = projectedCellPoints(cells[2], gs);
        const topRight = projectedCellPoints(cells[3], gs);
        const topLeft = projectedCellPoints(cells[1], gs);

        expect(placementZonePolygon(cells, gs)).toEqual([
            bottomLeft[0],
            bottomLeft[1],
            bottomRight[2],
            bottomRight[3],
            topRight[4],
            topRight[5],
            topLeft[6],
            topLeft[7],
        ]);
    });

    test("applies the upper-row corrections to a continuous deployment field", () => {
        const gs = settings();
        const topY = Math.round((gs.getMaxY() - gs.getMinY()) / gs.getStep()) - 1;
        const cells = [
            { x: 2, y: topY - 1 },
            { x: 2, y: topY },
            { x: 3, y: topY - 1 },
            { x: 3, y: topY },
        ];
        const bottomLeft = tunedCellFillCornerPoints(cells[0], gs);
        const bottomRight = tunedCellFillCornerPoints(cells[2], gs);
        const topRight = tunedCellFillCornerPoints(cells[3], gs);
        const topLeft = tunedCellFillCornerPoints(cells[1], gs);

        expect(placementZonePolygon(cells, gs)).toEqual([
            bottomLeft[0],
            bottomLeft[1],
            bottomRight[2],
            bottomRight[3],
            topRight[4],
            topRight[5],
            topLeft[6],
            topLeft[7],
        ]);
    });

    test("keeps the draft-army cloth colours translucent over the board", () => {
        const samples = Array.from({ length: 32 }, (_, index) => placementTileOpacity((index * Math.PI) / 8));
        expect(samples.every((alpha) => alpha >= 0.34 && alpha <= 0.38)).toBe(true);
        expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.039);
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
