import { expect, test } from "bun:test";
import {
    isPikemanIdleCanonicalFrame,
    pikemanIdleFrame,
    PIKEMAN_IDLE_PERIOD_MS,
    PIKEMAN_IDLE_HOLD_FRAME_MS,
    PIKEMAN_IDLE_MOTION_FRAME_MS,
    PIKEMAN_IDLE_START_HOLD_MS,
    PIKEMAN_IDLE_MOTION_MS,
    PIKEMAN_IDLE_FRAME_DURATIONS_MS,
} from "./PikemanLabIdleMotion";

test("Pikeman shortens the pause 20% and speeds up inhale/exhale 15% independently", () => {
    expect(13 * PIKEMAN_IDLE_HOLD_FRAME_MS).toBeCloseTo((13 / 19.2) * 1000 * 0.8);
    expect(1000 / 19.2 / PIKEMAN_IDLE_MOTION_FRAME_MS).toBeCloseTo(1.15);
    expect(PIKEMAN_IDLE_PERIOD_MS).toBeCloseTo(2851.449275);
    expect(PIKEMAN_IDLE_FRAME_DURATIONS_MS.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(PIKEMAN_IDLE_PERIOD_MS);
});

test("Pikeman preserves canonical holds and the original middle pose", () => {
    for (const time of [
        NaN,
        Infinity,
        -1,
        0,
        PIKEMAN_IDLE_START_HOLD_MS - 0.01,
        PIKEMAN_IDLE_PERIOD_MS - 0.01,
        PIKEMAN_IDLE_PERIOD_MS,
        PIKEMAN_IDLE_PERIOD_MS + 1,
    ]) {
        expect(isPikemanIdleCanonicalFrame(pikemanIdleFrame(time))).toBe(true);
    }
    expect(pikemanIdleFrame(PIKEMAN_IDLE_START_HOLD_MS + 0.01)).toBe(7);
    expect(pikemanIdleFrame(PIKEMAN_IDLE_START_HOLD_MS + 25.5 * PIKEMAN_IDLE_MOTION_FRAME_MS)).toBe(32);
    expect(pikemanIdleFrame(PIKEMAN_IDLE_START_HOLD_MS + PIKEMAN_IDLE_MOTION_MS + 0.01)).toBe(58);
    expect(pikemanIdleFrame(PIKEMAN_IDLE_PERIOD_MS - 0.01)).toBe(63);
});

test("Pikeman visits every frame across three cycles with separate hold and motion timing", () => {
    for (let loop = 0; loop < 3; loop++) {
        let start = loop * PIKEMAN_IDLE_PERIOD_MS;
        for (let frame = 0; frame < 64; frame++) {
            const duration = frame < 7 || frame >= 58 ? 1000 / 24 : 1000 / 22.08;
            expect(pikemanIdleFrame(start + 1e-6)).toBe(frame);
            expect(pikemanIdleFrame(start + duration - 0.001)).toBe(frame);
            start += duration;
        }
    }
});
