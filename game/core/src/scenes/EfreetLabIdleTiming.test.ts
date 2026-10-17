import { expect, test } from "bun:test";
import { EFREET_LAB_IDLE_FRAME_DURATIONS_MS, efreetLabIdleFrame } from "./EfreetLabIdleTiming";

test("Efreet's joined-palms phase repeats every six seconds and returns to idle", () => {
    expect(EFREET_LAB_IDLE_FRAME_DURATIONS_MS.reduce((sum, ms) => sum + ms, 0)).toBe(6000);
    expect(efreetLabIdleFrame(4799)).toBe(23);
    expect(efreetLabIdleFrame(4800)).toBe(24);
    expect(efreetLabIdleFrame(5300 - 1e-10)).toBe(29);
    for (let cycle = 0; cycle < 10; cycle++) {
        expect(efreetLabIdleFrame(5300 + cycle * 6000)).toBe(29);
        expect(efreetLabIdleFrame(5999 + cycle * 6000)).toBe(35);
        expect(efreetLabIdleFrame(6000 + cycle * 6000)).toBe(0);
    }
});
