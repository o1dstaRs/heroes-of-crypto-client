import { expect, test } from "bun:test";
import { NIGHTMARE_WIND_SPEED, nightmareWindOffset, nightmareWindWeights } from "./NightmareLabIdleWind";

test("Nightmare wind anchors roots, face, body and every hoof for the full wave", () => {
    for (let t = 0; t < 12; t += 0.13) {
        for (const [x, y] of [
            [267, 420],
            [625, 275],
            [685, 330],
            [720, 390],
            [300, 440],
            [520, 390],
            [400, 510],
            [235, 715],
            [327, 716],
            [490, 716],
            [580, 716],
        ]) {
            expect(nightmareWindOffset(x, y, t).every((v) => v === 0)).toBe(true);
            expect(nightmareWindWeights(x, y)).toEqual([0, 0]);
        }
    }
});

test("Both free ends move continuously, sharing the banner frequency without a loop seam", () => {
    for (const [x, y] of [
        [80, 640],
        [355, 350],
    ]) {
        const samples = Array.from({ length: 40 }, (_, i) => nightmareWindOffset(x, y, i / 10));
        expect(Math.max(...samples.map(([a, b]) => Math.hypot(a, b)))).toBeGreaterThan(10);
        for (const time of [0, 2.4, 5.1, 60, 3600]) {
            const before = nightmareWindOffset(x, y, time - 0.001);
            const after = nightmareWindOffset(x, y, time + 0.001);
            expect(Math.hypot(after[0] - before[0], after[1] - before[1])).toBeLessThan(0.15);
        }
        const a = nightmareWindOffset(x, y, 1.7, 0.8);
        const b = nightmareWindOffset(x, y, 1.7 + (Math.PI * 2) / NIGHTMARE_WIND_SPEED, 0.8);
        expect(a[0]).toBeCloseTo(b[0], 8);
        expect(a[1]).toBeCloseTo(b[1], 8);
    }
});
