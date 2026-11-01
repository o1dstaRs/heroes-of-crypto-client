import { expect, test } from "bun:test";

import { createHydraPortraitIdleClock } from "./leftSidebarPortraitPlayback";

test("Hydra traverses every pose without a held turnaround and keeps its full cycle", () => {
    const cycleMs = 20084;
    const clock = createHydraPortraitIdleClock(100, 2400 / 241, cycleMs);
    const origin = 987654;
    const runs: { frame: number; ms: number }[] = [];
    for (let ms = 0; ms < cycleMs; ms++) {
        const frame = clock(origin + ms);
        const previous = runs.at(-1);
        if (previous?.frame === frame) previous.ms++;
        else runs.push({ frame, ms: 1 });
    }
    expect(runs.map(({ frame }) => frame)).toEqual([
        ...Array.from({ length: 100 }, (_, i) => i),
        ...Array.from({ length: 98 }, (_, i) => 98 - i),
    ]);
    // Old endpoints lasted ~101 ms each. Both turns now pass in under two 60 Hz ticks.
    expect(runs[0].ms).toBeLessThan(34);
    expect(runs[99].ms).toBeLessThan(34);
    expect(runs.slice(0, 7).map(({ ms }) => ms)).toEqual(
        runs
            .slice(0, 7)
            .map(({ ms }) => ms)
            .sort((a, b) => a - b),
    );
    expect(clock(origin + cycleMs)).toBe(0);
    expect(clock(origin + cycleMs + 34)).toBe(1);
    expect(clock(origin + cycleMs * 3 + 34)).toBe(1);
});

test("Hydra's clock begins after decode and safely handles a single pose and backwards time", () => {
    const clock = createHydraPortraitIdleClock(100, 10);
    expect(clock(500000)).toBe(0);
    expect(clock(499999)).toBe(0);
    const still = createHydraPortraitIdleClock(1, 10);
    expect(still(500000)).toBe(0);
    expect(still(900000)).toBe(0);
});
