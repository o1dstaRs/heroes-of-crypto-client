/*
 * The shot-range overlay is the player's contract with the damage model: whatever it encloses takes a
 * full 1/1 arrow (AttackHandler.getRangeAttackDivisor), everything past it is halved. A circle could
 * never state that honestly — its edge cut diagonals short and sliced through cells — so the overlay is
 * a SQUARE of whole cells. These tests pin the two properties that keep the promise true: the border
 * lands on cell borders, and it never claims cells that are off the board.
 */
import { describe, expect, test } from "bun:test";

import { GridConstants, GridMath, GridSettings } from "@heroesofcrypto/common";

import { SandboxDrawer, type IGameplayDrawContext } from "./SandboxDrawer";
import { projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

/** Just enough of the Pixi Graphics chaining API to record what the drawer asked for. */
const recorder = () => {
    const polygons: number[][] = [];
    const graphics = {
        poly(points: number[]) {
            polygons.push([...points]);
            return graphics;
        },
        rect: () => graphics,
        circle: () => graphics,
        moveTo: () => graphics,
        lineTo: () => graphics,
        stroke: () => graphics,
        fill: () => graphics,
    };
    return { graphics, polygons };
};

const cellCenter = (cell: { x: number; y: number }) =>
    GridMath.getPositionForCell(cell, gridSettings.getMinX(), gridSettings.getStep(), gridSettings.getHalfStep());

/** The closed polygon is the range border; the other four paths are its open corner brackets. */
const drawnBorder = (shotDistance: number, unitSize: number, cell: { x: number; y: number }): number[] => {
    const { graphics, polygons } = recorder();
    const context = {
        fightProps: { hasFightStarted: () => true },
        currentActiveShotRange: {
            xy: cellCenter(cell),
            distance: GridMath.getFullDamageSquareHalfExtent(shotDistance, unitSize, GridConstants.STEP),
        },
        isActiveUnitMoving: false,
        gridSettings,
        hoverManager: { drawHoverBattlefieldFootprint: () => undefined },
        hoverGlowPhase: 0,
        sc_isAnimating: false,
    } as unknown as IGameplayDrawContext;

    SandboxDrawer.drawGameplayVisuals(graphics as never, context);
    const closed = polygons.filter(
        (points) =>
            points.length >= 4 && points[0] === points[points.length - 2] && points[1] === points[points.length - 1],
    );
    expect(closed).toHaveLength(1);
    return closed[0];
};

const drawnPolygons = (shotDistance: number, unitSize: number, cell: { x: number; y: number }): number[][] => {
    const { graphics, polygons } = recorder();
    const context = {
        fightProps: { hasFightStarted: () => true },
        currentActiveShotRange: {
            xy: cellCenter(cell),
            distance: GridMath.getFullDamageSquareHalfExtent(shotDistance, unitSize, GridConstants.STEP),
        },
        isActiveUnitMoving: false,
        gridSettings,
        hoverManager: { drawHoverBattlefieldFootprint: () => undefined },
        hoverGlowPhase: 0,
        sc_isAnimating: false,
    } as unknown as IGameplayDrawContext;

    SandboxDrawer.drawGameplayVisuals(graphics as never, context);
    return polygons;
};

/** Cell borders are the only x/y a whole-cell square may end on. */
const onCellBorder = (value: number, axisMin: number) => (value - axisMin) % gridSettings.getStep() === 0;

const logicalBounds = (shotDistance: number, unitSize: number, cell: { x: number; y: number }) => {
    const center = cellCenter(cell);
    const halfExtent = GridMath.getFullDamageSquareHalfExtent(shotDistance, unitSize, GridConstants.STEP);
    return {
        left: Math.max(center.x - halfExtent, gridSettings.getMinX()),
        right: Math.min(center.x + halfExtent, gridSettings.getMaxX()),
        bottom: Math.max(center.y - halfExtent, gridSettings.getMinY()),
        top: Math.min(center.y + halfExtent, gridSettings.getMaxY()),
    };
};

describe("the full-damage shot square", () => {
    test("uses one quiet boundary instead of nested glowing frames", () => {
        const closed = drawnPolygons(3.5, 1, { x: 5, y: 5 }).filter(
            (points) => points[0] === points[points.length - 2] && points[1] === points[points.length - 1],
        );
        expect(closed).toHaveLength(1);
    });

    test("floors a fractional shot distance and follows the painted cell seams", () => {
        // 3.5 plays as three whole cells; the extra half cell only carries the edge from the unit's
        // own cell CENTER out to that cell's border, which is why the span is seven cells, not six.
        const bounds = logicalBounds(3.5, 1, { x: 5, y: 5 });
        const border = drawnBorder(3.5, 1, { x: 5, y: 5 });

        expect(bounds.right - bounds.left).toBe(7 * GridConstants.STEP);
        expect(bounds.top - bounds.bottom).toBe(7 * GridConstants.STEP);
        expect(onCellBorder(bounds.left, gridSettings.getMinX())).toBe(true);
        expect(onCellBorder(bounds.bottom, gridSettings.getMinY())).toBe(true);
        expect(border).toEqual(projectedRectPoints(bounds.left, bounds.bottom, bounds.right, bounds.top, gridSettings));
    });

    test("wraps a 2x2 attacker's whole footprint", () => {
        // A 2x2 is centred on the intersection of its four cells, so its own body already eats a full
        // cell of the half-extent on each side: three cells of reach spans 3 + 1 + 1 + 3 cells.
        const bounds = logicalBounds(3, 2, { x: 5, y: 5 });
        const border = drawnBorder(3, 2, { x: 5, y: 5 });

        expect(bounds.right - bounds.left).toBe(8 * GridConstants.STEP);
        expect(border).toEqual(projectedRectPoints(bounds.left, bounds.bottom, bounds.right, bounds.top, gridSettings));
    });

    test("never claims cells beyond the arena", () => {
        // A corner shooter's square would hang off two sides of the board; cells that do not exist can
        // not take a full 1/1 arrow, so the overlay stops at the edge.
        const bounds = logicalBounds(6.5, 1, { x: 0, y: 0 });
        const border = drawnBorder(6.5, 1, { x: 0, y: 0 });

        expect(bounds.left).toBe(gridSettings.getMinX());
        expect(bounds.bottom).toBe(gridSettings.getMinY());
        expect(bounds.right).toBeLessThanOrEqual(gridSettings.getMaxX());
        expect(bounds.top).toBeLessThanOrEqual(gridSettings.getMaxY());
        expect(border).toEqual(projectedRectPoints(bounds.left, bounds.bottom, bounds.right, bounds.top, gridSettings));
    });
});
