import { describe, expect, test } from "bun:test";

import { movementCellsOutsideUnitFootprint, visibleAuraRanges } from "./SandboxDrawer";

// aura_ranges is ABILITY-aligned: non-aura abilities carry 0. The "+N aura range" Might synergy must
// widen REAL auras only — adding the bonus before dropping the zeros painted a phantom aura ring on
// every ability of every unit the moment the synergy was picked (live report 2026-08-02).
describe("visibleAuraRanges", () => {
    test("keeps zero-range (non-aura) entries invisible even with a synergy bonus", () => {
        expect(visibleAuraRanges([0, 0, 0], [true, true, false], 1)).toEqual([]);
        expect(visibleAuraRanges([0, 2, 0], [true, false, true], 1)).toEqual([{ range: 3, isBuff: false }]);
    });

    test("widens real auras by the bonus and preserves buff flags", () => {
        expect(visibleAuraRanges([1, 2], [true, false], 2)).toEqual([
            { range: 3, isBuff: true },
            { range: 4, isBuff: false },
        ]);
    });

    test("no bonus leaves real auras at their base range", () => {
        expect(visibleAuraRanges([2], [true], 0)).toEqual([{ range: 2, isBuff: true }]);
    });

    test("tolerates missing arrays and short isBuff lists", () => {
        expect(visibleAuraRanges(undefined, undefined, 1)).toEqual([]);
        expect(visibleAuraRanges([1, 1], [false], 0)).toEqual([
            { range: 1, isBuff: false },
            { range: 1, isBuff: true },
        ]);
    });

    test("reuses and truncates a caller-owned hot-path buffer", () => {
        const target = [
            { range: 99, isBuff: false },
            { range: 98, isBuff: false },
        ];
        const firstEntry = target[0];

        expect(visibleAuraRanges([2], [true], 1, target)).toBe(target);
        expect(target).toEqual([{ range: 3, isBuff: true }]);
        expect(target[0]).toBe(firstEntry);
        expect(visibleAuraRanges([0], [true], 1, target)).toBe(target);
        expect(target).toEqual([]);
    });
});

describe("movementCellsOutsideUnitFootprint", () => {
    test("keeps reachable order while removing every occupied footprint cell", () => {
        const reachable = [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 3, y: 1 },
        ];

        expect(
            movementCellsOutsideUnitFootprint(reachable, [
                { x: 1, y: 1 },
                { x: 2, y: 1 },
            ]),
        ).toEqual([{ x: 3, y: 1 }]);
    });

    test("reuses and clears a caller-owned destination buffer", () => {
        const target = [{ x: 99, y: 99 }];
        const reachable = [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
        ];

        expect(movementCellsOutsideUnitFootprint(reachable, [{ x: 1, y: 1 }], target)).toBe(target);
        expect(target).toEqual([{ x: 2, y: 1 }]);
        expect(movementCellsOutsideUnitFootprint([], [], target)).toBe(target);
        expect(target).toEqual([]);
    });
});
