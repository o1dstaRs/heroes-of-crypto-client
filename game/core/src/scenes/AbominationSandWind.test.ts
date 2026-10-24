import { expect, test } from "bun:test";
import { abominationWindParticle, SAND_WIND_PARTICLE_COUNT } from "./AbominationSandWind";
import { ABOMINATION_STORM_REVOLUTION_MS, type AbominationSandVariant } from "./AbominationSandShader";

test("all alternatives close their full GIF cycle without a particle jump", () => {
    for (const variant of [0, 1, 2, 3, 4] as AbominationSandVariant[]) {
        for (const index of [0, 1, 11, 100, 383]) {
            for (const time of [0, 1234, 7999]) {
                const a = abominationWindParticle(index, time, variant);
                const b = abominationWindParticle(index, time + ABOMINATION_STORM_REVOLUTION_MS, variant);
                expect(a.head.x).toBeCloseTo(b.head.x, 10);
                expect(a.head.y).toBeCloseTo(b.head.y, 10);
                expect(a.alpha).toBeCloseTo(b.alpha, 10);
            }
        }
    }
});

test("native wind grains remain bounded, continuous and clockwise", () => {
    for (let i = 0; i < SAND_WIND_PARTICLE_COUNT; i++) {
        for (const time of [0, 999, 3400, 7999, 8000, 16000]) {
            const a = abominationWindParticle(i, time);
            const b = abominationWindParticle(i, time + 1);
            expect(Math.abs(a.head.x)).toBeLessThan(0.96);
            expect(Math.abs(a.head.y)).toBeLessThan(0.96);
            expect(a.alpha).toBeGreaterThanOrEqual(0);
            expect(a.alpha).toBeLessThanOrEqual(0.6);
            if (a.alpha > 0.0001 || b.alpha > 0.0001) {
                expect(Math.hypot(a.head.x - b.head.x, a.head.y - b.head.y)).toBeLessThan(0.003);
                expect(a.head.x * b.head.y - a.head.y * b.head.x).toBeLessThan(0);
                expect(Math.hypot(b.head.x, b.head.y)).toBeLessThan(Math.hypot(a.head.x, a.head.y));
            }
        }
    }
});

test("square wind fills the corners while staying inside the aura and moving continuously", () => {
    let cornerGrains = 0;
    for (let i = 0; i < SAND_WIND_PARTICLE_COUNT; i++) {
        for (const time of [0, 999, 3400, 7999, 8000, 16000]) {
            const a = abominationWindParticle(i, time, 4);
            const b = abominationWindParticle(i, time + 1, 4);
            expect(Math.max(Math.abs(a.head.x), Math.abs(a.head.y))).toBeLessThan(0.95);
            if (Math.min(Math.abs(a.head.x), Math.abs(a.head.y)) > 0.72) cornerGrains++;
            if (a.alpha > 0.0001 || b.alpha > 0.0001) {
                expect(Math.hypot(a.head.x - b.head.x, a.head.y - b.head.y)).toBeLessThan(0.003);
                expect(a.head.x * b.head.y - a.head.y * b.head.x).toBeLessThan(0);
                const norm = (p: { x: number; y: number }) => (p.x ** 8 + p.y ** 8) ** (1 / 8);
                expect(norm(b.head)).toBeLessThan(norm(a.head));
            }
        }
    }
    expect(cornerGrains).toBeGreaterThan(20);
});
