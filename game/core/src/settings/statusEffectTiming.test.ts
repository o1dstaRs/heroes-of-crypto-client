import { expect, test } from "bun:test";

import {
    OVERHEAD_EFFECT_PLAYBACK_SPEED,
    OVERHEAD_EFFECT_DURATION_MS,
    FLOATING_RESULT_DURATION_MS,
    statusEffectAppearanceElapsedMs,
    statusEffectElapsedMs,
} from "./statusEffectTiming";

test("the selected 50% slower rate doubles overhead lifetime without changing floating result timing", () => {
    expect(OVERHEAD_EFFECT_PLAYBACK_SPEED).toBe(0.5);
    expect(OVERHEAD_EFFECT_DURATION_MS).toBe(1300);
    expect(FLOATING_RESULT_DURATION_MS).toBe(650);
    expect(statusEffectElapsedMs(0)).toBe(0);
    expect(statusEffectElapsedMs(650)).toBe(500);
    expect(statusEffectElapsedMs(1300)).toBe(1000);
});

test("status openings advance 25% faster while their readable hold and end time remain intact", () => {
    expect(statusEffectElapsedMs(65 / OVERHEAD_EFFECT_PLAYBACK_SPEED)).toBeCloseTo(125);
    expect(statusEffectElapsedMs(175 / OVERHEAD_EFFECT_PLAYBACK_SPEED)).toBeCloseTo(1000 / 3);
    expect(statusEffectElapsedMs(195 / OVERHEAD_EFFECT_PLAYBACK_SPEED)).toBeCloseTo(1000 / 3);
    expect(statusEffectElapsedMs(325 / OVERHEAD_EFFECT_PLAYBACK_SPEED)).toBe(500);
    expect(statusEffectElapsedMs(585 / OVERHEAD_EFFECT_PLAYBACK_SPEED)).toBe(900);
    expect(statusEffectElapsedMs(650 / OVERHEAD_EFFECT_PLAYBACK_SPEED)).toBe(1000);
});

test("the faster opening never rewinds a frame or overshoots the original lifetime", () => {
    let previous = 0;
    for (let ms = 0; ms <= OVERHEAD_EFFECT_DURATION_MS; ms++) {
        const elapsed = statusEffectElapsedMs(ms);
        expect(elapsed).toBeGreaterThanOrEqual(previous);
        expect(elapsed).toBeLessThanOrEqual(1000);
        previous = elapsed;
    }
    expect(statusEffectAppearanceElapsedMs(-10)).toBe(0);
    expect(statusEffectAppearanceElapsedMs(80, 1500)).toBe(100);
    expect(statusEffectAppearanceElapsedMs(1350, 1500)).toBe(1350);
});
