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

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

interface IRecordedRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Just enough of the Pixi Graphics chaining API to record what the drawer asked for. */
const recorder = () => {
    const rects: IRecordedRect[] = [];
    const graphics = {
        rect(x: number, y: number, width: number, height: number) {
            rects.push({ x, y, width, height });
            return graphics;
        },
        circle: () => graphics,
        moveTo: () => graphics,
        lineTo: () => graphics,
        stroke: () => graphics,
        fill: () => graphics,
    };
    return { graphics, rects };
};

const cellCenter = (cell: { x: number; y: number }) =>
    GridMath.getPositionForCell(cell, gridSettings.getMinX(), gridSettings.getStep(), gridSettings.getHalfStep());

/** The border is the largest rectangle the drawer emits; the rest feather inward from it. */
const drawnBorder = (shotDistance: number, unitSize: number, cell: { x: number; y: number }): IRecordedRect => {
    const { graphics, rects } = recorder();
    const context = {
        fightProps: { hasFightStarted: () => true },
        currentActiveShotRange: {
            xy: cellCenter(cell),
            distance: GridMath.getFullDamageSquareHalfExtent(shotDistance, unitSize, GridConstants.STEP),
        },
        isActiveUnitMoving: false,
        gridSettings,
        hoverGlowPhase: 0,
        sc_isAnimating: false,
    } as unknown as IGameplayDrawContext;

    SandboxDrawer.drawGameplayVisuals(graphics as never, context);
    expect(rects.length).toBeGreaterThan(0);
    return rects.reduce((widest, rect) => (rect.width > widest.width ? rect : widest));
};

/** Cell borders are the only x/y a whole-cell square may end on. */
const onCellBorder = (value: number, axisMin: number) => (value - axisMin) % gridSettings.getStep() === 0;

describe("the full-damage shot square", () => {
    test("floors a fractional shot distance and ends on cell borders", () => {
        // 3.5 plays as three whole cells; the extra half cell only carries the edge from the unit's
        // own cell CENTER out to that cell's border, which is why the span is seven cells, not six.
        const border = drawnBorder(3.5, 1, { x: 5, y: 5 });

        expect(border.width).toBe(7 * GridConstants.STEP);
        expect(border.height).toBe(7 * GridConstants.STEP);
        expect(onCellBorder(border.x, gridSettings.getMinX())).toBe(true);
        expect(onCellBorder(border.y, gridSettings.getMinY())).toBe(true);
    });

    test("wraps a 2x2 attacker's whole footprint", () => {
        // A 2x2 is centred on the intersection of its four cells, so its own body already eats a full
        // cell of the half-extent on each side: three cells of reach spans 3 + 1 + 1 + 3 cells.
        const border = drawnBorder(3, 2, { x: 5, y: 5 });

        expect(border.width).toBe(8 * GridConstants.STEP);
    });

    test("never claims cells beyond the arena", () => {
        // A corner shooter's square would hang off two sides of the board; cells that do not exist can
        // not take a full 1/1 arrow, so the overlay stops at the edge.
        const border = drawnBorder(6.5, 1, { x: 0, y: 0 });

        expect(border.x).toBe(gridSettings.getMinX());
        expect(border.y).toBe(gridSettings.getMinY());
        expect(border.x + border.width).toBeLessThanOrEqual(gridSettings.getMaxX());
        expect(border.y + border.height).toBeLessThanOrEqual(gridSettings.getMaxY());
    });
});
