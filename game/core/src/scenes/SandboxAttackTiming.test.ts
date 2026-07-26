import { describe, expect, test } from "bun:test";

import { ATTACK_HIT_STAGGER_MS, getAttackFinalImpactDelayMs } from "./Sandbox";

describe("attack impact timing", () => {
    test("single-hit deaths tear down on impact without a readability hold", () => {
        expect(getAttackFinalImpactDelayMs(0)).toBe(0);
        expect(getAttackFinalImpactDelayMs(1)).toBe(0);
    });

    test("multi-hit deaths follow the same cadence as their visible hit numbers", () => {
        expect(getAttackFinalImpactDelayMs(2)).toBe(ATTACK_HIT_STAGGER_MS);
        expect(getAttackFinalImpactDelayMs(3)).toBe(ATTACK_HIT_STAGGER_MS * 2);
    });
});
