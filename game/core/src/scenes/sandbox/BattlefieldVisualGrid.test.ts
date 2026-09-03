import { describe, expect, test } from "bun:test";

import { GridConstants, GridMath, GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { boardFitHeight, boardFitWidth } from "../../pixi/boardFit";
import {
    BATTLEFIELD_ARTWORK,
    BATTLEFIELD_GRID_ROWS,
    BATTLEFIELD_HORIZONTAL_BIAS,
    BATTLEFIELD_HORIZONTAL_OVERSCAN,
    battlefieldArtworkLayout,
    battlefieldVisualQuad,
    projectBattlefieldPoint,
    projectedBattlefieldMetricsAtPoint,
    projectedCellPoints,
    projectedPolyline,
    projectedRangeAttackCellSideCenter,
    rangeAttackCellSideCenter,
    unprojectBattlefieldPoint,
} from "./BattlefieldVisualGrid";

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

describe("battlefield visual grid", () => {
    test("projects the unchanged square mechanics board onto the hand-traced outer seams", () => {
        const gs = settings();
        const quad = battlefieldVisualQuad(gs);
        const corners = [
            projectBattlefieldPoint({ x: gs.getMinX(), y: gs.getMinY() }, gs),
            projectBattlefieldPoint({ x: gs.getMaxX(), y: gs.getMinY() }, gs),
            projectBattlefieldPoint({ x: gs.getMaxX(), y: gs.getMaxY() }, gs),
            projectBattlefieldPoint({ x: gs.getMinX(), y: gs.getMaxY() }, gs),
        ];
        const expectedBottomLeft =
            (gs.getMinX() + gs.getMaxX()) * 0.5 +
            (gs.getMaxX() - gs.getMinX()) * (BATTLEFIELD_HORIZONTAL_BIAS - BATTLEFIELD_HORIZONTAL_OVERSCAN * 0.5);
        expect(quad.bottomLeft.x).toBeCloseTo(expectedBottomLeft, 8);
        const field = BATTLEFIELD_ARTWORK.field;
        const fieldWidth = field.bottomRight.x - field.bottomLeft.x;
        const fieldHeight = field.bottomLeft.y - field.topLeft.y;
        const worldWidth = gs.getMaxX() - gs.getMinX();
        const worldHeight = gs.getMaxY() - gs.getMinY();
        const bottomMidX = (field.bottomLeft.x + field.bottomRight.x) * 0.5;
        const centerX = (gs.getMinX() + gs.getMaxX()) * 0.5 + worldWidth * BATTLEFIELD_HORIZONTAL_BIAS;
        const toWorld = (sourceX: number, sourceY: number) => ({
            x: centerX + ((sourceX - bottomMidX) / fieldWidth) * worldWidth * BATTLEFIELD_HORIZONTAL_OVERSCAN,
            y: gs.getMaxY() - ((sourceY - field.topLeft.y) / fieldHeight) * worldHeight,
        });
        const top = BATTLEFIELD_GRID_ROWS[0];
        const bottom = BATTLEFIELD_GRID_ROWS.at(-1)!;
        expect(corners[0]).toEqual(toWorld(bottom.x[0], bottom.y));
        expect(corners[1]).toEqual(toWorld(bottom.x.at(-1)!, bottom.y));
        expect(corners[2]).toEqual(toWorld(top.x.at(-1)!, top.y));
        expect(corners[3]).toEqual(toWorld(top.x[0], top.y));
    });

    test("keeps exactly 16 visual cells in each logical direction", () => {
        const gs = settings();
        const cells = Array.from({ length: 16 }, (_, y) =>
            Array.from({ length: 16 }, (_, x) => projectedCellPoints({ x, y }, gs)),
        );
        expect(cells).toHaveLength(16);
        expect(cells.every((row) => row.length === 16)).toBe(true);
        expect(
            cells
                .flat()
                .every((polygon) => polygon.length >= 10 && polygon.length % 2 === 0 && polygon.every(Number.isFinite)),
        ).toBe(true);
    });

    test("maps every painted cell centre back to its logical placement cell", () => {
        const gs = settings();
        for (let y = 0; y < 16; y += 1) {
            for (let x = 0; x < 16; x += 1) {
                const logical = {
                    x: gs.getMinX() + (x + 0.5) * gs.getStep(),
                    y: gs.getMinY() + (y + 0.5) * gs.getStep(),
                };
                const painted = projectBattlefieldPoint(logical, gs);
                const restored = unprojectBattlefieldPoint(painted, gs);
                expect(restored?.x).toBeCloseTo(logical.x, 8);
                expect(restored?.y).toBeCloseTo(logical.y, 8);
            }
        }
    });

    test("writes projected coordinates into a caller-owned point", () => {
        const gs = settings();
        const logical = { x: 6.25, y: 9.75 };
        const expected = projectBattlefieldPoint(logical, gs);
        const reusable = { x: Number.NaN, y: Number.NaN };

        expect(projectBattlefieldPoint(logical, gs, reusable)).toBe(reusable);
        expect(reusable).toEqual(expected);
    });

    test("reports local particle scale from the same painted cell geometry", () => {
        const gs = settings();
        for (const cell of [
            { x: 1, y: 1 },
            { x: 8, y: 8 },
            { x: 14, y: 14 },
        ]) {
            const logical = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
            const metrics = projectedBattlefieldMetricsAtPoint(logical, gs);
            const polygon = projectedCellPoints(cell, gs);
            const corners = [0, 2, 4, 6].map((index) => ({ x: polygon[index], y: polygon[index + 1] }));
            const midpoint = (a: HoCMath.XY, b: HoCMath.XY) => ({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 });
            const left = midpoint(corners[0], corners[3]);
            const right = midpoint(corners[1], corners[2]);
            const bottom = midpoint(corners[0], corners[1]);
            const top = midpoint(corners[3], corners[2]);

            expect(metrics.center).toEqual(projectBattlefieldPoint(logical, gs));
            expect(metrics.width).toBeCloseTo(Math.hypot(right.x - left.x, right.y - left.y), 8);
            expect(metrics.height).toBeCloseTo(Math.hypot(top.x - bottom.x, top.y - bottom.y), 8);
            expect(metrics.cellSize).toBeCloseTo((metrics.width + metrics.height) * 0.5, 8);
        }
    });

    test("pins ranged trajectories to the shooter centre and exact painted target-edge midpoints", () => {
        const gs = settings();
        const shooterCell = { x: 3, y: 2 };
        const shooterLogical = GridMath.getPositionForCell(shooterCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        const shooterVisual = projectBattlefieldPoint(shooterLogical, gs);
        const shooterPolygon = projectedCellPoints(shooterCell, gs);
        const shooterCorners = [
            { x: shooterPolygon[0], y: shooterPolygon[1] },
            { x: shooterPolygon[2], y: shooterPolygon[3] },
            { x: shooterPolygon[4], y: shooterPolygon[5] },
            { x: shooterPolygon[6], y: shooterPolygon[7] },
        ];
        expect(shooterVisual.x).toBeCloseTo(
            shooterCorners.reduce((sum, point) => sum + point.x, 0) / shooterCorners.length,
            8,
        );
        expect(shooterVisual.y).toBeCloseTo(
            shooterCorners.reduce((sum, point) => sum + point.y, 0) / shooterCorners.length,
            8,
        );

        const targetCell = { x: 11, y: 12 };
        const targetPolygon = projectedCellPoints(targetCell, gs);
        const corners = {
            bottomLeft: { x: targetPolygon[0], y: targetPolygon[1] },
            bottomRight: { x: targetPolygon[2], y: targetPolygon[3] },
            topRight: { x: targetPolygon[4], y: targetPolygon[5] },
            topLeft: { x: targetPolygon[6], y: targetPolygon[7] },
        };
        const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
            x: (a.x + b.x) * 0.5,
            y: (a.y + b.y) * 0.5,
        });
        const expected = new Map([
            [GridMath.RangeAttackCellSide.LEFT, midpoint(corners.bottomLeft, corners.topLeft)],
            [GridMath.RangeAttackCellSide.RIGHT, midpoint(corners.bottomRight, corners.topRight)],
            [GridMath.RangeAttackCellSide.DOWN, midpoint(corners.bottomLeft, corners.bottomRight)],
            [GridMath.RangeAttackCellSide.UP, midpoint(corners.topLeft, corners.topRight)],
        ]);

        for (const [side, edgeMidpoint] of expected) {
            const logical = rangeAttackCellSideCenter(targetCell, side, gs);
            const visual = projectedRangeAttackCellSideCenter(targetCell, side, gs);
            expect(visual).toEqual(projectBattlefieldPoint(logical, gs));
            expect(visual.x).toBeCloseTo(edgeMidpoint.x, 8);
            expect(visual.y).toBeCloseTo(edgeMidpoint.y, 8);
        }
    });

    test("keeps every long code-drawn guide on all intermediate painted seam vertices", () => {
        const gs = settings();
        const x = gs.getMinX() + gs.getStep() * 8;
        const guide = projectedPolyline(
            [
                { x, y: gs.getMinY() },
                { x, y: gs.getMaxY() },
            ],
            gs,
        );
        expect(guide).toHaveLength(BATTLEFIELD_GRID_ROWS.length * 2);
        expect(guide.every(Number.isFinite)).toBe(true);
    });

    test("sizes and positions the bitmap from its painted field instead of its decorative bounds", () => {
        const layout = battlefieldArtworkLayout(1600, 1400, 1500, 1200);
        const field = BATTLEFIELD_ARTWORK.field;
        const scaleX = layout.width / BATTLEFIELD_ARTWORK.width;
        const scaleY = layout.height / BATTLEFIELD_ARTWORK.height;
        const left = layout.x - layout.width * 0.5;
        const top = layout.y - layout.height * 0.5;
        expect(left + (field.bottomLeft.x + field.bottomRight.x) * 0.5 * scaleX).toBeCloseTo(
            800 + 1500 * BATTLEFIELD_HORIZONTAL_BIAS,
            8,
        );
        expect(top + field.bottomLeft.y * scaleY).toBeCloseTo(1400, 8);
        expect(top + field.topLeft.y * scaleY).toBeCloseTo(200, 8);
    });

    test("bleeds under the combat frame without leaving top or side gaps at short and tall aspect ratios", () => {
        for (const [viewportWidth, viewportHeight] of [
            [1280, 720],
            [1680, 1474],
        ]) {
            const boardWidth = boardFitWidth(viewportWidth, viewportHeight);
            const boardHeight = boardFitHeight(viewportWidth, viewportHeight);
            const layout = battlefieldArtworkLayout(viewportWidth, viewportHeight, boardWidth, boardHeight);
            const boardLeft = (viewportWidth - boardWidth) * 0.5;
            const boardRight = boardLeft + boardWidth;
            expect(layout.y - layout.height * 0.5).toBeLessThanOrEqual(0);
            expect(layout.x - layout.width * 0.5).toBeLessThan(boardLeft);
            expect(layout.x + layout.width * 0.5).toBeGreaterThan(boardRight);
        }
    });
});
