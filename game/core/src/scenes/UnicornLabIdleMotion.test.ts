import { expect, test } from "bun:test";
import { unicornIdleFrame, unicornDustAge } from "./UnicornLabIdleMotion";

test("authored paw poses play once every three seconds without crossfades", () => {
    const samples = [
        [0, 0],
        [2099, 0],
        [2100, 1],
        [2250, 2],
        [2400, 3],
        [2650, 4],
        [2850, 5],
        [2999, 5],
        [3000, 0],
        [5400, 3],
    ];
    for (const [time, frame] of samples) expect(unicornIdleFrame(time)).toBe(frame);
});
test("dust accompanies hoof movement and is gone when the leg recovers", () => {
    expect(unicornDustAge(2249)).toBe(-1);
    expect(unicornDustAge(2250)).toBe(0);
    expect(unicornIdleFrame(2250)).toBe(2);
    expect(unicornDustAge(2400)).toBe(0.375);
    expect(unicornIdleFrame(2400)).toBe(3);
    expect(unicornDustAge(2649)).toBeGreaterThan(0);
    expect(unicornDustAge(2650)).toBe(-1);
    expect(unicornDustAge(2950)).toBe(-1);
    expect(unicornDustAge(5400)).toBe(0.375);
});
