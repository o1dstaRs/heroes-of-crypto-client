import { describe, expect, test } from "bun:test";

import { GridConstants, GridMath, GridSettings, HoCConstants, type HoCMath } from "@heroesofcrypto/common";

import { stackPowerPipRects } from "./SandboxDrawer";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

/** The board rectangle a footprint covers, the same way the drawer measures it. */
const footprintBounds = (cells: readonly HoCMath.XY[]) => {
    const size = gridSettings.getCellSize();
    const positions = cells.map((cell) =>
        GridMath.getPositionForCell(cell, gridSettings.getMinX(), gridSettings.getStep(), gridSettings.getHalfStep()),
    );
    return {
        left: Math.min(...positions.map((p) => p.x)) - size / 2,
        right: Math.max(...positions.map((p) => p.x)) + size / 2,
        bottom: Math.min(...positions.map((p) => p.y)) - size / 2,
        top: Math.max(...positions.map((p) => p.y)) + size / 2,
    };
};

const SMALL: HoCMath.XY[] = [{ x: 4, y: 5 }];
const WIDE: HoCMath.XY[] = [
    { x: 4, y: 5 },
    { x: 5, y: 5 },
];
const LARGE: HoCMath.XY[] = [
    { x: 4, y: 5 },
    { x: 5, y: 5 },
    { x: 4, y: 6 },
    { x: 5, y: 6 },
];

describe("stack power pips under ALT", () => {
    test("one pip per stack level, filled up to the unit's power", () => {
        const pips = stackPowerPipRects(SMALL, gridSettings, 3);
        expect(pips).toHaveLength(HoCConstants.MAX_UNIT_STACK_POWER);
        expect(pips.map((pip) => pip.filled)).toEqual([true, true, true, false, false]);
        expect(stackPowerPipRects(SMALL, gridSettings, 5).every((pip) => pip.filled)).toBe(true);
        expect(stackPowerPipRects(SMALL, gridSettings, 0).some((pip) => pip.filled)).toBe(false);
    });

    test("a power outside the ladder is clamped rather than drawn past the row", () => {
        expect(stackPowerPipRects(SMALL, gridSettings, 99).filter((pip) => pip.filled)).toHaveLength(5);
        expect(stackPowerPipRects(SMALL, gridSettings, -4).filter((pip) => pip.filled)).toHaveLength(0);
    });

    /** The whole point of the row is that it reads as part of the body it belongs to. */
    for (const [name, cells] of [
        ["1x1", SMALL],
        ["2x1", WIDE],
        ["2x2", LARGE],
    ] as const) {
        test(`the row stays inside a ${name} footprint, centred and in order`, () => {
            const bounds = footprintBounds(cells);
            const pips = stackPowerPipRects(cells, gridSettings, 4);

            for (const pip of pips) {
                expect(pip.x1).toBeGreaterThanOrEqual(bounds.left);
                expect(pip.x2).toBeLessThanOrEqual(bounds.right);
                expect(pip.y1).toBeGreaterThanOrEqual(bounds.bottom);
                expect(pip.y2).toBeLessThanOrEqual(bounds.top);
                expect(pip.x2).toBeGreaterThan(pip.x1);
                expect(pip.y2).toBeGreaterThan(pip.y1);
            }
            // Left to right, no overlaps.
            for (let index = 1; index < pips.length; index++) {
                expect(pips[index].x1).toBeGreaterThanOrEqual(pips[index - 1].x2);
            }
            // Centred on the footprint: the margins either side match.
            const leftMargin = pips[0].x1 - bounds.left;
            const rightMargin = bounds.right - pips[pips.length - 1].x2;
            expect(Math.abs(leftMargin - rightMargin)).toBeLessThan(0.001);
            // Near the bottom edge, not floating in the middle of the body.
            expect(pips[0].y1 - bounds.bottom).toBeLessThan((bounds.top - bounds.bottom) / 2);
        });
    }

    test("a wider body spreads its pips instead of bunching them at 1x1 width", () => {
        const small = stackPowerPipRects(SMALL, gridSettings, 5);
        const wide = stackPowerPipRects(WIDE, gridSettings, 5);
        const rowWidth = (pips: typeof small) => pips[pips.length - 1].x2 - pips[0].x1;
        expect(rowWidth(wide)).toBeGreaterThan(rowWidth(small));
    });

    test("no cells, no row", () => {
        expect(stackPowerPipRects([], gridSettings, 3)).toEqual([]);
    });
});
