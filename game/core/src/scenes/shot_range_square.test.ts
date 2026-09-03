/*
 * The shot-range overlay is the player's contract with the damage model: whatever it encloses takes a
 * full 1/1 arrow, everything past it is halved. The selected presentation is concept 06: one thin,
 * continuous cold-steel frame and four authored bitmap corners.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GridConstants, GridMath, GridSettings } from "@heroesofcrypto/common";
import { Container, Graphics, Texture } from "pixi.js";

import {
    ALLY_HOVERED_SHOT_RANGE_COLOR,
    ENEMY_HOVERED_SHOT_RANGE_COLOR,
    SHOT_RANGE_COLOR,
    SHOT_RANGE_CORNER_SPRITE_ANCHOR,
    SHOT_RANGE_CORNER_SPRITE_SIZE_CELLS,
    SandboxDrawer,
    shotRangeCornerSpriteMatrix,
    shotRangeCornerSpritePlacements,
    type IGameplayDrawContext,
} from "./SandboxDrawer";
import { projectedPolyline, projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

interface RecordedStroke {
    width?: number;
    color?: number;
    alpha?: number;
    cap?: string;
    join?: string;
}

/** Just enough of the Pixi Graphics chaining API to record what the drawer asked for. */
const recorder = () => {
    const polygons: number[][] = [];
    const polygonClosed: Array<boolean | undefined> = [];
    const strokes: RecordedStroke[] = [];
    const graphics = {
        poly(points: number[], close?: boolean) {
            polygons.push([...points]);
            polygonClosed.push(close);
            return graphics;
        },
        rect: () => graphics,
        circle: () => graphics,
        moveTo: () => graphics,
        lineTo: () => graphics,
        stroke: (style?: RecordedStroke) => {
            strokes.push(style ?? {});
            return graphics;
        },
        fill: () => graphics,
    };
    return { graphics, polygons, polygonClosed, strokes };
};

const cellCenter = (cell: { x: number; y: number }) =>
    GridMath.getPositionForCell(cell, gridSettings.getMinX(), gridSettings.getStep(), gridSettings.getHalfStep());

const drawRange = (
    shotDistance: number,
    footprintWidth: number,
    cell: { x: number; y: number },
    phase = 0,
    footprintHeight = footprintWidth,
) => {
    const recorded = recorder();
    const context = {
        fightProps: { hasFightStarted: () => true },
        currentActiveShotRange: {
            xy: cellCenter(cell),
            distance: GridMath.getFullDamageSquareHalfExtent(shotDistance, footprintWidth, GridConstants.STEP),
            verticalDistance: GridMath.getFullDamageSquareHalfExtent(shotDistance, footprintHeight, GridConstants.STEP),
        },
        isActiveUnitMoving: false,
        gridSettings,
        hoverManager: { drawHoverBattlefieldFootprint: () => undefined },
        hoverGlowPhase: phase,
        sc_isAnimating: false,
    } as unknown as IGameplayDrawContext;

    SandboxDrawer.drawGameplayVisuals(recorded.graphics as never, context);
    return recorded;
};

const logicalBounds = (
    shotDistance: number,
    footprintWidth: number,
    cell: { x: number; y: number },
    footprintHeight = footprintWidth,
) => {
    const center = cellCenter(cell);
    const horizontalHalfExtent = GridMath.getFullDamageSquareHalfExtent(
        shotDistance,
        footprintWidth,
        GridConstants.STEP,
    );
    const verticalHalfExtent = GridMath.getFullDamageSquareHalfExtent(
        shotDistance,
        footprintHeight,
        GridConstants.STEP,
    );
    return {
        left: Math.max(center.x - horizontalHalfExtent, gridSettings.getMinX()),
        right: Math.min(center.x + horizontalHalfExtent, gridSettings.getMaxX()),
        bottom: Math.max(center.y - verticalHalfExtent, gridSettings.getMinY()),
        top: Math.min(center.y + verticalHalfExtent, gridSettings.getMaxY()),
    };
};

/** Cell borders are the only x/y a whole-cell square may end on. */
const onCellBorder = (value: number, axisMin: number) => (value - axisMin) % gridSettings.getStep() === 0;

describe("the full-damage shot square", () => {
    test("draws concept 06 as one continuous single-tone perimeter", () => {
        const shotDistance = 3.5;
        const cell = { x: 5, y: 5 };
        const bounds = logicalBounds(shotDistance, 1, cell);
        const expectedFrame = projectedRectPoints(bounds.left, bounds.bottom, bounds.right, bounds.top, gridSettings);
        const { polygons, polygonClosed, strokes } = drawRange(shotDistance, 1, cell);

        // One opaque path gives every side the exact same hue instead of blending layers over the floor.
        expect(polygons).toEqual([expectedFrame]);
        expect(expectedFrame.slice(0, 2)).toEqual(expectedFrame.slice(-2));
        expect(polygonClosed).toEqual([undefined]);
        expect(strokes[0].width).toBeLessThanOrEqual(1.5);
        expect(strokes[0].color).toBe(SHOT_RANGE_COLOR);
        expect(strokes[0].alpha).toBe(0.83);
        expect(strokes[0].cap).toBe("square");
        expect(strokes[0].join).toBe("miter");
    });

    test("paints an identical enemy hover range after the active friendly range", () => {
        const range = {
            xy: cellCenter({ x: 5, y: 5 }),
            distance: GridMath.getFullDamageSquareHalfExtent(3.5, 1, GridConstants.STEP),
        };
        const recorded = recorder();
        const context = {
            fightProps: { hasFightStarted: () => true },
            currentActiveShotRange: { ...range, color: ALLY_HOVERED_SHOT_RANGE_COLOR },
            hoveredShotRange: { ...range, color: ENEMY_HOVERED_SHOT_RANGE_COLOR },
            isActiveUnitMoving: false,
            gridSettings,
            hoverManager: { drawHoverBattlefieldFootprint: () => undefined },
            hoverGlowPhase: 0,
            sc_isAnimating: false,
        } as unknown as IGameplayDrawContext;

        SandboxDrawer.drawGameplayVisuals(recorded.graphics as never, context);

        expect(recorded.strokes).toHaveLength(2);
        expect(recorded.strokes[0].color).toBe(ALLY_HOVERED_SHOT_RANGE_COLOR);
        expect(recorded.strokes[1].color).toBe(ENEMY_HOVERED_SHOT_RANGE_COLOR);
        expect(recorded.strokes[0].alpha).toBe(0.83);
        expect(recorded.strokes[1].alpha).toBe(0.83);
    });

    test("does not stack the active range over itself when the active creature is hovered", () => {
        const range = {
            xy: cellCenter({ x: 5, y: 5 }),
            distance: GridMath.getFullDamageSquareHalfExtent(3.5, 1, GridConstants.STEP),
            color: ALLY_HOVERED_SHOT_RANGE_COLOR,
        };
        const recorded = recorder();
        const context = {
            fightProps: { hasFightStarted: () => true },
            currentActiveShotRange: range,
            hoveredShotRange: { ...range },
            isActiveUnitMoving: false,
            gridSettings,
            hoverManager: { drawHoverBattlefieldFootprint: () => undefined },
            hoverGlowPhase: 0,
            sc_isAnimating: false,
        } as unknown as IGameplayDrawContext;

        SandboxDrawer.drawGameplayVisuals(recorded.graphics as never, context);

        expect(recorded.strokes).toHaveLength(1);
        expect(recorded.strokes[0].alpha).toBe(0.83);
    });

    test("places the same authored bitmap at all four actual perimeter corners", () => {
        const bounds = { left: 256, bottom: 256, width: 896, height: 768 };
        const placements = shotRangeCornerSpritePlacements(bounds);
        const expectedCorners = [
            { x: bounds.left, y: bounds.bottom },
            { x: bounds.left + bounds.width, y: bounds.bottom },
            { x: bounds.left + bounds.width, y: bounds.bottom + bounds.height },
            { x: bounds.left, y: bounds.bottom + bounds.height },
        ];

        expect(placements.map(({ xy }) => xy)).toEqual(expectedCorners);
        expect(placements.map(({ horizontal }) => horizontal)).toEqual([
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: -1, y: 0 },
            { x: 1, y: 0 },
        ]);
        expect(placements.map(({ vertical }) => vertical)).toEqual([
            { x: 0, y: 1 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
            { x: 0, y: -1 },
        ]);
    });

    test("affine-aligns both ornament rails with the two projected main lines", () => {
        const bounds = { left: 256, bottom: 256, width: 896, height: 768 };
        const cellSize = gridSettings.getCellSize();

        for (const placement of shotRangeCornerSpritePlacements(bounds)) {
            const matrix = shotRangeCornerSpriteMatrix(placement, 0.1, cellSize, gridSettings);
            const horizontalEnd = {
                x: placement.xy.x + placement.horizontal.x * cellSize,
                y: placement.xy.y + placement.horizontal.y * cellSize,
            };
            const verticalEnd = {
                x: placement.xy.x + placement.vertical.x * cellSize,
                y: placement.xy.y + placement.vertical.y * cellSize,
            };
            const horizontal = projectedPolyline([placement.xy, horizontalEnd], gridSettings);
            const vertical = projectedPolyline([placement.xy, verticalEnd], gridSettings);
            const projectedHorizontal = {
                x: horizontal[horizontal.length - 2] - horizontal[0],
                y: horizontal[horizontal.length - 1] - horizontal[1],
            };
            const projectedVertical = {
                x: vertical[vertical.length - 2] - vertical[0],
                y: vertical[vertical.length - 1] - vertical[1],
            };

            expect(matrix.a * projectedHorizontal.y - matrix.b * projectedHorizontal.x).toBeCloseTo(0);
            expect(-matrix.c * projectedVertical.y + matrix.d * projectedVertical.x).toBeCloseTo(0);
            expect(matrix.a * projectedHorizontal.x + matrix.b * projectedHorizontal.y).toBeGreaterThan(0);
            expect(-matrix.c * projectedVertical.x - matrix.d * projectedVertical.y).toBeGreaterThan(0);
            expect(Math.hypot(matrix.a, matrix.b)).toBeCloseTo(0.1);
            expect(Math.hypot(matrix.c, matrix.d)).toBeCloseTo(0.1);
            expect({ x: matrix.tx, y: matrix.ty }).toEqual({ x: horizontal[0], y: horizontal[1] });
        }
    });

    test("renders the selected corner as a bitmap instead of rebuilding it from vector strokes", () => {
        const source = readFileSync(join(import.meta.dir, "SandboxDrawer.ts"), "utf8");
        expect(source).toContain("new Sprite(cornerTexture)");
        expect(source).toContain("cornerContainer.addChild(corner)");
        expect(source).toContain("cornerPool?.sprites[cornerIndex]");
        expect(source).toContain("cornerPool.sprites[cornerIndex] = corner");
        expect(source).toContain("corner.setFromMatrix(shotRangeCornerSpriteMatrix");
        expect(source).toContain("corner.alpha = cornerAlpha");
        expect(source).toContain("const cornerAlpha = 0.85");
        expect(SHOT_RANGE_CORNER_SPRITE_SIZE_CELLS).toBeCloseTo(0.92 * 0.85 * 0.8 * 0.6 * 1.15);
        expect(SHOT_RANGE_CORNER_SPRITE_ANCHOR).toEqual({ x: 0.137, y: 0.891 });
        expect(source).not.toContain("corner.tint = color");
        const sandboxSource = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        expect(sandboxSource).toContain('this.texAny("shot_range_corner_aaa_v4_green")');
        expect(sandboxSource).toContain('this.texAny("shot_range_corner_aaa_v4_red")');
        expect(sandboxSource).not.toContain("shotRangeCornerContainer?.removeChildren()");
    });

    test("reuses the same four ornament sprites across animated redraws", () => {
        const graphics = new Graphics();
        const cornerContainer = new Container();
        const cornerPool = { sprites: [], used: 0 };
        const context = {
            fightProps: { hasFightStarted: () => true },
            currentActiveShotRange: {
                xy: cellCenter({ x: 5, y: 5 }),
                distance: GridMath.getFullDamageSquareHalfExtent(3.5, 1, GridConstants.STEP),
            },
            isActiveUnitMoving: false,
            gridSettings,
            hoverManager: { drawHoverBattlefieldFootprint: () => undefined },
            hoverGlowPhase: 0,
            sc_isAnimating: false,
            shotRangeCornerContainer: cornerContainer,
            shotRangeCornerPool: cornerPool,
            shotRangeCornerTexture: Texture.WHITE,
        } as unknown as IGameplayDrawContext;

        SandboxDrawer.drawGameplayVisuals(graphics, context);
        const firstSprites = [...cornerPool.sprites];
        expect(firstSprites).toHaveLength(4);
        expect(cornerContainer.children).toHaveLength(4);

        cornerPool.used = 0;
        SandboxDrawer.drawGameplayVisuals(graphics, context);

        expect(cornerPool.sprites).toEqual(firstSprites);
        expect(cornerContainer.children).toHaveLength(4);
        cornerContainer.destroy({ children: true });
        graphics.destroy();
    });

    test("downsamples the detailed corner without camera shimmer", () => {
        const source = readFileSync(join(import.meta.dir, "SandboxDrawer.ts"), "utf8");
        expect(source).toContain('source.scaleMode = "linear"');
        expect(source).toContain("source.autoGenerateMipmaps = true");
        expect(source).toContain("source.unload()");
        expect(source).toContain("corner.roundPixels = false");
    });

    test("does not render the four midpoint ornaments", () => {
        const drawerSource = readFileSync(join(import.meta.dir, "SandboxDrawer.ts"), "utf8");
        const sandboxSource = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        expect(drawerSource).not.toContain("new Sprite(markerTexture)");
        expect(sandboxSource).not.toContain("shotRangeMarkerTexture");
    });

    test("keeps enemy hover ranges read-only while AI locks active board input", () => {
        const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        const hoverStart = source.indexOf("protected override hover(): void");
        const genericHoverStart = source.indexOf("Generic Hover Logic", hoverStart);
        const beforeGenericHover = source.slice(hoverStart, genericHoverStart);

        expect(beforeGenericHover).toContain("const boardInputLockedByAI = this.isBoardInputLockedByAI()");
        expect(beforeGenericHover).not.toContain("this.clearBoardHoverPreviews()");
        expect(beforeGenericHover).toContain("!boardInputLockedByAI &&");
    });

    test("does not erase a directly hovered enemy range during attack targeting", () => {
        const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        const fallbackStart = source.indexOf("The generic block above resolves the unit directly");
        const movementStart = source.indexOf("Movement Visualization", fallbackStart);
        const fallback = source.slice(fallbackStart, movementStart);

        expect(fallback).toContain(
            "if (!this.sc_hoveredShotRange && targetUnit && targetUnit.getAttackType() === AttackVals.RANGE)",
        );
        expect(fallback).toContain("else if (!this.sc_hoveredShotRange)");
    });

    test("shows the enemy shot frame for Handyman shooters such as Centaur and Zena", () => {
        const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        const genericRangeStart = source.indexOf("// Range Attack Visuals (Only if Ranged)");
        const movementRangeStart = source.indexOf("// Movement range:", genericRangeStart);
        const genericRange = source.slice(genericRangeStart, movementRangeStart);

        expect(genericRange).toContain("hoverTargetUnit.getAttackType() === AttackVals.RANGE");
        expect(genericRange).not.toContain('hasAbilityActive("Handyman")');
    });

    test("does not revive an unreachable target trajectory from the geometric edge fallback", () => {
        const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        const guardStart = source.indexOf("if (isRangeAttackContext && shootableRangeEdges.length === 0)");
        const rangedDrawStart = source.indexOf("if (isRangeAttackContext) {", guardStart + 1);
        const guard = source.slice(guardStart, rangedDrawStart);

        expect(guardStart).toBeGreaterThan(-1);
        expect(guard).toContain("this.attackHandler.evaluateRangeAttack(");
        expect(guard).toContain("if (!fallbackEvaluation.attackObstacle)");
        expect(guard).toContain("this.hoverManager.clearAttackVisuals()");
        expect(guard).toContain("return;");
    });

    test("keeps the frame and sights static instead of pulsing or travelling", () => {
        const atStart = drawRange(3.5, 1, { x: 5, y: 5 }, 0);
        const later = drawRange(3.5, 1, { x: 5, y: 5 }, Math.PI / 3);

        expect(later.polygons).toEqual(atStart.polygons);
        expect(later.strokes).toEqual(atStart.strokes);
    });

    test("floors a fractional shot distance and keeps the frame on exact cell borders", () => {
        const bounds = logicalBounds(3.5, 1, { x: 5, y: 5 });

        expect(bounds.right - bounds.left).toBe(7 * GridConstants.STEP);
        expect(bounds.top - bounds.bottom).toBe(7 * GridConstants.STEP);
        expect(onCellBorder(bounds.left, gridSettings.getMinX())).toBe(true);
        expect(onCellBorder(bounds.bottom, gridSettings.getMinY())).toBe(true);
    });

    test("wraps a 2x2 attacker's whole footprint", () => {
        const bounds = logicalBounds(3, 2, { x: 5, y: 5 });
        expect(bounds.right - bounds.left).toBe(8 * GridConstants.STEP);
    });

    test("uses the Centaur's 2x1 footprint without adding half a cell below it", () => {
        const bounds = logicalBounds(4, 2, { x: 5, y: 5 }, 1);
        const { polygons } = drawRange(4, 2, { x: 5, y: 5 }, 0, 1);
        const expectedFrame = projectedRectPoints(bounds.left, bounds.bottom, bounds.right, bounds.top, gridSettings);

        expect(bounds.right - bounds.left).toBe(10 * GridConstants.STEP);
        expect(bounds.top - bounds.bottom).toBe(9 * GridConstants.STEP);
        expect(polygons).toEqual([expectedFrame]);
    });

    test("never claims cells beyond the arena", () => {
        const bounds = logicalBounds(6.5, 1, { x: 0, y: 0 });

        expect(bounds.left).toBe(gridSettings.getMinX());
        expect(bounds.bottom).toBe(gridSettings.getMinY());
        expect(bounds.right).toBeLessThanOrEqual(gridSettings.getMaxX());
        expect(bounds.top).toBeLessThanOrEqual(gridSettings.getMaxY());
    });

    test("keeps corner ornaments out of the single-layer vector perimeter", () => {
        const { polygons, polygonClosed, strokes } = drawRange(3.5, 1, { x: 5, y: 5 });

        expect(polygons).toHaveLength(1);
        expect(strokes).toHaveLength(1);
        expect(polygonClosed).toEqual([undefined]);
    });
});
