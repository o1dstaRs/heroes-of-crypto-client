import { expect, test } from "bun:test";
import { championIdleFrame, CHAMPION_IDLE_GESTURE_MS, CHAMPION_IDLE_RAISE_MS } from "./ChampionLabIdleMotion";

test("Champion keeps the painted wind loop active between six-second rally gestures", () => {
    expect(Array.from({ length: 8 }, (_, i) => championIdleFrame(i * 125))).toEqual([0, 9, 1, 10, 2, 11, 3, 12]);
    expect(championIdleFrame(5999)).toBe(12);
    for (const cycle of [6000, 12000, 18000]) {
        expect(championIdleFrame(cycle)).toBe(4);
        expect(championIdleFrame(cycle + 625)).toBe(8);
        expect(championIdleFrame(cycle + 1290)).toBe(4);
        expect(championIdleFrame(cycle + CHAMPION_IDLE_GESTURE_MS - 1)).toBe(0);
        expect(championIdleFrame(cycle + CHAMPION_IDLE_GESTURE_MS + 0.001)).toBe(0);
        expect(championIdleFrame(cycle + CHAMPION_IDLE_GESTURE_MS + 125)).toBe(9);
    }
    expect(championIdleFrame(NaN)).toBe(0);
    expect(championIdleFrame(-100)).toBe(0);
    for (let time = 0; time < 24000; time += 17) {
        expect(championIdleFrame(time)).toBeGreaterThanOrEqual(0);
        expect(championIdleFrame(time)).toBeLessThan(13);
    }
});

test("Champion accelerates the spear raise by another thirty percent and preserves recovery", () => {
    const oldFrameMs = 2000 / 1.2 / 10;
    expect(CHAMPION_IDLE_RAISE_MS * 1.3).toBeCloseTo(4 * oldFrameMs);
    expect(CHAMPION_IDLE_GESTURE_MS - CHAMPION_IDLE_RAISE_MS).toBeCloseTo(6 * oldFrameMs);
    for (const [i, frame] of [4, 5, 6, 7].entries()) {
        expect(championIdleFrame(6000 + ((i + 0.5) * oldFrameMs) / 1.3)).toBe(frame);
    }
    for (const [i, frame] of [8, 7, 6, 5, 4, 0].entries()) {
        expect(championIdleFrame(6000 + CHAMPION_IDLE_RAISE_MS + (i + 0.5) * oldFrameMs)).toBe(frame);
    }
    expect(championIdleFrame(124)).toBe(0);
    expect(championIdleFrame(125)).toBe(9);
    expect(championIdleFrame(6000)).toBe(4);
    expect(championIdleFrame(12000)).toBe(4);
});
