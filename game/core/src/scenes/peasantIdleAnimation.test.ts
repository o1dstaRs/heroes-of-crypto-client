import { expect, test } from "bun:test";
import { PEASANT_APPROVED_IDLE_META, peasantIdleFrameForElapsed } from "./peasantIdleAnimation";

test("the 15% speed increase preserves a 700ms upright-only pause", () => {
    const d = 1000 / PEASANT_APPROVED_IDLE_META.fps / 0.77;
    expect(PEASANT_APPROVED_IDLE_META.fps / 6).toBeCloseTo(1.15);
    expect(peasantIdleFrameForElapsed(d + 0.01, d)).toBe(1);
    expect(peasantIdleFrameForElapsed(d * 6 - 0.01, d)).toBe(5);
    expect(peasantIdleFrameForElapsed(d * 6 + 699.99, d)).toBe(5);
    expect(peasantIdleFrameForElapsed(d * 6 + 700.01, d)).toBe(6);
    const cycle = d * 12 + 700;
    expect(peasantIdleFrameForElapsed(cycle + 0.01, d)).toBe(0);
    expect(peasantIdleFrameForElapsed(-0.01, d)).toBe(11);
    expect(peasantIdleFrameForElapsed(cycle / 2 + 0.01, d, 0.5)).toBe(0);
});
