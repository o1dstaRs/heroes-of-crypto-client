import { expect, test } from "bun:test";
import { DRYAD_IDLE_PERIOD_MS, dryadIdleMotion, dryadIdleOffset } from "./DryadLabIdleMotion";

test("Dryad waits, gently checks the string, then fully relaxes before the next cycle", () => {
    expect(dryadIdleMotion(0)).toEqual([0, 0, 0, 0]);
    expect(dryadIdleMotion(1000)[2]).toBe(0);
    expect(dryadIdleMotion(1625)[2]).toBeCloseTo(9);
    expect(dryadIdleMotion(2200)[2]).toBe(18);
    expect(dryadIdleMotion(3000)[2]).toBeCloseTo(9);
    expect(dryadIdleMotion(4000)[2]).toBe(0);
    for (let axis = 0; axis < 3; axis++) {
        expect(dryadIdleMotion(DRYAD_IDLE_PERIOD_MS - 0.001)[axis]).toBeCloseTo(
            dryadIdleMotion(DRYAD_IDLE_PERIOD_MS + 0.001)[axis],
            4,
        );
    }
});

test("Dryad keeps both feet planted and the head shape unchanged throughout the idle", () => {
    for (let time = 0; time < DRYAD_IDLE_PERIOD_MS; time += 100) {
        const motion = dryadIdleMotion(time);
        for (const [x, y] of [
            [210, 715],
            [420, 702],
        ]) {
            const offset = dryadIdleOffset(x, y, motion);
            expect(offset[0]).toBeCloseTo(0, 10);
            expect(offset[1]).toBeCloseTo(0, 10);
        }
        const top = dryadIdleOffset(310, 120, motion);
        const face = dryadIdleOffset(330, 165, motion);
        expect(Math.abs(top[0] - face[0])).toBeLessThan(0.006);
        expect(top[1]).toBe(face[1]);
    }
});

test("Dryad's string stays joined to its drawing hand and both bow tips", () => {
    const motion = [0, 0, 18, 0];
    expect(dryadIdleOffset(316, 253, motion)[0]).toBeCloseTo(-18);
    for (const [x, y] of [
        [477, 61],
        [456, 480],
    ]) {
        expect(dryadIdleOffset(x, y, motion)[0]).toBeCloseTo(0, 6);
    }
    for (let amount = 0.1; amount < 0.9; amount += 0.1) {
        const offset = dryadIdleOffset(477 - 161 * amount, 61 + 192 * amount, motion);
        expect(offset[0]).toBeCloseTo(-18 * amount, 5);
    }
    expect(dryadIdleOffset(595, 252, motion)[0]).toBeCloseTo(-18);
});
