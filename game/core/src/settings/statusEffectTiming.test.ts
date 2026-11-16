import { expect, test } from "bun:test";

import { statusEffectAppearanceElapsedMs, statusEffectElapsedMs } from "./statusEffectTiming";

test("status openings advance 25% faster while their readable hold and end time remain intact", () => {
    expect(statusEffectElapsedMs(65)).toBeCloseTo(125);
    expect(statusEffectElapsedMs(175)).toBeCloseTo(1000 / 3);
    expect(statusEffectElapsedMs(195)).toBeCloseTo(1000 / 3);
    expect(statusEffectElapsedMs(325)).toBe(500);
    expect(statusEffectElapsedMs(585)).toBe(900);
    expect(statusEffectElapsedMs(650)).toBe(1000);
});

test("the faster opening never rewinds a frame or overshoots the original lifetime", () => {
    let previous = 0;
    for (let ms = 0; ms <= 650; ms++) {
        const elapsed = statusEffectElapsedMs(ms);
        expect(elapsed).toBeGreaterThanOrEqual(previous);
        expect(elapsed).toBeLessThanOrEqual(1000);
        previous = elapsed;
    }
    expect(statusEffectAppearanceElapsedMs(-10)).toBe(0);
    expect(statusEffectAppearanceElapsedMs(80, 1500)).toBe(100);
    expect(statusEffectAppearanceElapsedMs(1350, 1500)).toBe(1350);
});
