import { describe, expect, test } from "bun:test";

import { fireWallCrossingSchedule } from "./fireWallCrossing";

// A cell's centre is its coordinates times 10 here, so a straight walk along y = 0 passes cell (n, 0) at
// x = 10n. Speed 20 px/s means one cell every half second.
const center = (cell: { x: number; y: number }) => ({ x: cell.x * 10, y: cell.y * 10 });

describe("fire wall crossing schedule", () => {
    test("times each burning cell by the distance walked to it, in travel order", () => {
        const path = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 20, y: 0 },
            { x: 30, y: 0 },
        ];
        const steps = fireWallCrossingSchedule(
            path,
            [
                { x: 2, y: 0 },
                { x: 1, y: 0 },
            ],
            center,
            20,
        );
        expect(steps.map((step) => step.cell)).toEqual([
            { x: 1, y: 0 },
            { x: 2, y: 0 },
        ]);
        expect(steps[0].delaySec).toBeCloseTo(0.5, 6);
        expect(steps[1].delaySec).toBeCloseTo(1, 6);
        expect(steps[0].direction).toEqual({ x: 1, y: 0 });
    });

    test("follows a bent path and keeps the segment's own direction for each cell", () => {
        const path = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
        ];
        const steps = fireWallCrossingSchedule(path, [{ x: 1, y: 1 }], center, 10);
        expect(steps).toHaveLength(1);
        // 10 px east, then 10 px north: the corner cell is reached after 20 px, heading north.
        expect(steps[0].delaySec).toBeCloseTo(2, 6);
        expect(steps[0].direction).toEqual({ x: 0, y: 1 });
    });

    test("projects a cell the body brushes past onto the nearest point of the walk", () => {
        const path = [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
        ];
        // A large body's route runs one cell beside the burning cell; the flare still lines up with it.
        const steps = fireWallCrossingSchedule(path, [{ x: 3, y: 1 }], center, 40);
        expect(steps[0].delaySec).toBeCloseTo(0.75, 6);
    });

    test("schedules everything at once when the walk cannot be timed", () => {
        expect(fireWallCrossingSchedule([{ x: 0, y: 0 }], [{ x: 1, y: 0 }], center, 20)[0].delaySec).toBe(0);
        expect(
            fireWallCrossingSchedule(
                [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                ],
                [{ x: 1, y: 0 }],
                center,
                0,
            )[0].delaySec,
        ).toBe(0);
    });

    test("skips a cell the board cannot place", () => {
        expect(
            fireWallCrossingSchedule(
                [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                ],
                [{ x: 1, y: 0 }],
                () => undefined,
                20,
            ),
        ).toEqual([]);
    });
});
