import { describe, expect, it } from "bun:test";
import { wolfAttackReachPixels } from "./WolfAttackReachVisuals";

describe("Wolf attack reach", () => {
    it("preserves the opening and final idle frames and every other action", () => {
        for (const state of ["attack", "attack_down"]) {
            for (const time of [0, 15, 30, 365, 400, 470, NaN, Infinity]) {
                expect(wolfAttackReachPixels(state, time)).toBe(0);
            }
        }
        for (const state of [undefined, "idle", "walk", "attack_up", "hit", "death"]) {
            for (const time of [80, 185, 205, 300]) expect(wolfAttackReachPixels(state, time)).toBe(0);
        }
    });

    it("adds bounded anticipation and reaches farther at the authored contact", () => {
        for (const [state, back, peak] of [
            ["attack", -6, 28],
            ["attack_down", -4, 24],
        ] as const) {
            expect(wolfAttackReachPixels(state, 100)).toBe(back);
            expect(wolfAttackReachPixels(state, 185)).toBe(peak);
            expect(wolfAttackReachPixels(state, 235)).toBe(peak);
            for (let time = 0; time <= 470; time++) {
                const reach = wolfAttackReachPixels(state, time);
                expect(reach).toBeGreaterThanOrEqual(back);
                expect(reach).toBeLessThanOrEqual(peak);
                expect(Math.abs(reach - wolfAttackReachPixels(state, time + 1))).toBeLessThan(0.61);
            }
        }
    });
});
