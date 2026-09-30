import { expect, test } from "bun:test";
import { centaurIdleWindMotion, centaurIdleWindOffset, CENTAUR_TAIL_WAVE_PERIOD_MS } from "./CentaurLabIdleWind";

test("Centaur wind keeps the body, helmet, spear and all hoof contacts fixed", () => {
    for (let time = 0; time < 10200; time += 173) {
        const motion = centaurIdleWindMotion(time);
        for (const [x, y] of [
            [248, 380],
            [518, 90],
            [530, 240],
            [300, 450],
            [480, 450],
            [640, 358],
            [800, 198],
            [239, 737],
            [332, 737],
            [461, 737],
            [542, 737],
        ]) {
            for (const value of centaurIdleWindOffset(x, y, motion)) expect(Math.abs(value)).toBe(0);
        }
    }
});

test("Centaur tail waves continuously across pose changes and the 5.1-second gesture seam", () => {
    for (const time of [600, 3600, 4080, 4780, 5100, 10200]) {
        const before = centaurIdleWindOffset(95, 650, centaurIdleWindMotion(time - 1));
        const after = centaurIdleWindOffset(95, 650, centaurIdleWindMotion(time + 1));
        expect(Math.hypot(after[0] - before[0], after[1] - before[1])).toBeLessThan(0.2);
    }
    expect(centaurIdleWindOffset(95, 650, centaurIdleWindMotion(0))).toEqual([0, 0]);
    expect(centaurIdleWindMotion(Number.NaN).every(Number.isFinite)).toBe(true);
});

test("Centaur hair has its own phase and rests while the hand touches it", () => {
    const time = 5500;
    const tailA = centaurIdleWindOffset(95, 650, centaurIdleWindMotion(time));
    const tailB = centaurIdleWindOffset(95, 650, centaurIdleWindMotion(time + CENTAUR_TAIL_WAVE_PERIOD_MS));
    expect(tailA[0]).toBeCloseTo(tailB[0], 5);
    const hairA = centaurIdleWindOffset(340, 250, centaurIdleWindMotion(time));
    const hairB = centaurIdleWindOffset(340, 250, centaurIdleWindMotion(time + CENTAUR_TAIL_WAVE_PERIOD_MS));
    expect(Math.abs(hairA[0] - hairB[0])).toBeGreaterThan(0.5);
    expect(centaurIdleWindOffset(340, 250, centaurIdleWindMotion(4200))).toEqual([0, 0]);
});

test("Centaur tail is another twenty percent faster and the stronger top hair does not lift the head", () => {
    expect(2550 / 1.3 / CENTAUR_TAIL_WAVE_PERIOD_MS).toBeCloseTo(1.2, 10);
    const offsets = [600, 1200, 1900, 2600].map((time) => centaurIdleWindOffset(520, 22, centaurIdleWindMotion(time)));
    expect(Math.max(...offsets.map(([x]) => x)) - Math.min(...offsets.map(([x]) => x))).toBeGreaterThan(20);
    for (const [x, y] of offsets) {
        expect(Math.abs(x)).toBeLessThanOrEqual(24);
        expect(Math.abs(y)).toBe(0);
    }
});
