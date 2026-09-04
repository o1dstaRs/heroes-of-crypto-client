import { describe, expect, test } from "bun:test";

import { movementCellsOutsideUnitFootprint, movementFillAlphaForPhase } from "./SandboxDrawer";

describe("movement-area presentation", () => {
    test("does not highlight any cell occupied by the active creature", () => {
        const reachable = [
            { x: 4, y: 5 },
            { x: 5, y: 5 },
            { x: 6, y: 5 },
            { x: 6, y: 6 },
        ];

        expect(
            movementCellsOutsideUnitFootprint(reachable, [
                { x: 4, y: 5 },
                { x: 5, y: 5 },
            ]),
        ).toEqual([
            { x: 6, y: 5 },
            { x: 6, y: 6 },
        ]);
    });

    test("removes every occupied base cell from 2x1 and 2x2 hovered-creature movement washes", () => {
        const reachable = [
            { x: 3, y: 3 },
            { x: 4, y: 3 },
            { x: 3, y: 4 },
            { x: 4, y: 4 },
            { x: 5, y: 4 },
        ];

        expect(
            movementCellsOutsideUnitFootprint(reachable, [
                { x: 3, y: 3 },
                { x: 4, y: 3 },
            ]),
        ).toEqual([
            { x: 3, y: 4 },
            { x: 4, y: 4 },
            { x: 5, y: 4 },
        ]);

        expect(
            movementCellsOutsideUnitFootprint(reachable, [
                { x: 3, y: 3 },
                { x: 4, y: 3 },
                { x: 3, y: 4 },
                { x: 4, y: 4 },
            ]),
        ).toEqual([{ x: 5, y: 4 }]);
    });

    test("makes the overall reachable-area wash slightly less transparent", () => {
        const dimPhase = -Math.PI / (2 * 0.65);
        const brightPhase = Math.PI / (2 * 0.65);

        expect(movementFillAlphaForPhase(dimPhase)).toBeCloseTo(0.065);
        expect(movementFillAlphaForPhase(brightPhase)).toBeCloseTo(0.08);
    });
});
