import { describe, expect, it } from "bun:test";
import {
    wolfAttackReachPixels,
    wolfAttackReachPoint,
    wolfAttackReachSourcePoint,
    wolfAttackReachSourceUv,
} from "./WolfAttackReachVisuals";

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

    it("keeps all paw contacts fixed throughout anticipation and recovery", () => {
        for (const reach of [-6, -4, 8, 24, 28]) {
            for (const x of [0, 180, 300, 535, 610, 768]) {
                for (const y of [655, 680, 700, 730, 768]) {
                    expect(wolfAttackReachPoint(x, y, reach)).toEqual({ x, y });
                }
            }
        }
    });

    it("translates the torso and low-biting head without changing their proportions", () => {
        for (const reach of [-6, 24, 28]) {
            for (const [x, y] of [
                [200, 300],
                [540, 400],
                [650, 550],
                [700, 630],
            ]) {
                expect(wolfAttackReachPoint(x, y, reach)).toEqual({ x: x + reach, y });
            }
        }
    });

    it("inverse sampling recovers the same source across the flexible leg and neck regions", () => {
        for (const reach of [-6, -4, 13, 24, 28]) {
            for (let x = 490; x <= 680; x += 10) {
                for (let y = 460; y <= 670; y += 10) {
                    const destination = wolfAttackReachPoint(x, y, reach);
                    const source = wolfAttackReachSourcePoint(destination.x, destination.y, reach);
                    expect(source.x).toBeCloseTo(x, 8);
                    expect(source.y).toBe(y);
                }
            }
        }
    });

    it("samples identical texels on both sides of each segmented shadow seam", () => {
        for (const reach of [-6, 24, 28]) {
            for (let seam = 1; seam < 4; seam++) {
                for (const y of [0.3, 0.5, 0.7, 0.8]) {
                    const left = wolfAttackReachSourceUv(1, y, reach, seam - 1, 4);
                    const right = wolfAttackReachSourceUv(0, y, reach, seam, 4);
                    const whole = wolfAttackReachSourceUv(seam / 4, y, reach);
                    expect(left).toEqual(right);
                    expect(left).toEqual(whole);
                }
            }
        }
    });
});
