import { describe, expect, test } from "bun:test";

import { effectIconsPerLane, effectLaneWellHeight, planEffectLanes } from "./effectLanes";

describe("effect lanes", () => {
    test("counts how many icons fit on one line", () => {
        expect(effectIconsPerLane(0, 40, 6)).toBe(1);
        expect(effectIconsPerLane(200, 40, 8)).toBe(4);
        expect(effectIconsPerLane(190, 40, 8)).toBe(4);
    });

    test("a row that already fits stays on one line even when the sidebar is tall", () => {
        expect(planEffectLanes({ perLane: 6, buffItems: 4, debuffItems: 2, extraSlots: 3 })).toEqual({
            buffLanes: 1,
            debuffLanes: 1,
        });
    });

    test("a clipped buff row takes the next free line before an empty debuff row does", () => {
        expect(planEffectLanes({ perLane: 4, buffItems: 7, debuffItems: 2, extraSlots: 1 })).toEqual({
            buffLanes: 2,
            debuffLanes: 1,
        });
    });

    test("both rows that overflow share the free lines, and neither grows past what it needs", () => {
        expect(planEffectLanes({ perLane: 4, buffItems: 9, debuffItems: 6, extraSlots: 5 })).toEqual({
            buffLanes: 3,
            debuffLanes: 2,
        });
    });

    test("no free line means the overflow stays on the single scrolling lane", () => {
        expect(planEffectLanes({ perLane: 4, buffItems: 12, debuffItems: 8, extraSlots: 0 })).toEqual({
            buffLanes: 1,
            debuffLanes: 1,
        });
    });

    test("well height adds a row and the gap between rows, and the chrome only once", () => {
        expect(effectLaneWellHeight(1, 40, 6, 9)).toBe(49);
        expect(effectLaneWellHeight(2, 40, 6, 9)).toBe(95);
    });
});
