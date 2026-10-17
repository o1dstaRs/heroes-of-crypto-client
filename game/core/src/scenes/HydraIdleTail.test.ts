import { expect, test } from "bun:test";
import { hydraTailOffset, HYDRA_TAIL_WAVE_SPEED } from "./HydraIdleTail";

test("Hydra tail keeps its attached root, heads, body and feet fixed", () => {
    for (const time of [0, 200, 1000, 3000, 6000, 9000, 12000]) {
        for (const [x, y] of [
            [260, 548],
            [390, 520],
            [650, 455],
            [192, 690],
            [405, 705],
            [575, 685],
        ]) {
            expect(hydraTailOffset(x, y, time)).toEqual([0, 0]);
        }
    }
});

test("Hydra tail continues smoothly across both bite and idle boundaries", () => {
    for (const boundary of [2000, 6000, 9000, 12000, 15000]) {
        const before = hydraTailOffset(123, 445, boundary - 0.01);
        const after = hydraTailOffset(123, 445, boundary + 0.01);
        expect(Math.hypot(after[0] - before[0], after[1] - before[1])).toBeLessThan(0.002);
    }
    const period = (Math.PI * 2 * 1000) / HYDRA_TAIL_WAVE_SPEED;
    const a = hydraTailOffset(123, 445, 123);
    const b = hydraTailOffset(123, 445, period + 123);
    expect(b[0]).toBeCloseTo(a[0], 6);
    expect(b[1]).toBeCloseTo(a[1], 6);
    expect(hydraTailOffset(123, 445, 6000)).not.toEqual(hydraTailOffset(123, 445, 0));
    expect(Math.hypot(...hydraTailOffset(123, 445, 0))).toBeGreaterThan(15);
    expect(Math.hypot(...hydraTailOffset(180, 605, 0))).toBeLessThan(1);
});

test("Hydra tail inverse sampling keeps the moving tip connected at every wave phase", () => {
    for (let time = 0; time < 2500; time += 50) {
        for (const [x, y] of [
            [123, 445],
            [110, 453],
            [90, 468],
            [65, 495],
            [44, 550],
            [40, 580],
        ]) {
            const offset = hydraTailOffset(x, y, time);
            const destination = [x + offset[0], y + offset[1]];
            let source = [...destination];
            for (let iteration = 0; iteration < 8; iteration++) {
                const displacement = hydraTailOffset(source[0], source[1], time);
                source = [destination[0] - displacement[0], destination[1] - displacement[1]];
            }
            expect(Math.hypot(source[0] - x, source[1] - y)).toBeLessThan(0.1);
        }
    }
});
