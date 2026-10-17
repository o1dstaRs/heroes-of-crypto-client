import { expect, test } from "bun:test";
import { nomadIdleWindOffset, NOMAD_HAIR_PERIOD_MS, NOMAD_TAIL_PERIOD_MS } from "./NomadIdleWind";

test("Nomad wind keeps hoof contacts, horse body, arm and sword grip planted", () => {
    for (const time of [0, 120, 700, 1500, 5600, 7340, 10000]) {
        for (const [x, y] of [
            [150, 720],
            [256, 701],
            [450, 735],
            [516, 713],
            [195, 375],
            [340, 120],
            [305, 195],
            [292, 350],
            [420, 440],
        ]) {
            const [dx, dy] = nomadIdleWindOffset(x, y, time);
            expect(Math.abs(dx) + Math.abs(dy)).toBe(0);
        }
    }
});

test("Nomad tail and hair animate during the neutral hold and remain continuous across its end", () => {
    for (const [x, y, period] of [
        [88, 574, NOMAD_TAIL_PERIOD_MS],
        [241, 219, NOMAD_HAIR_PERIOD_MS],
    ]) {
        const start = nomadIdleWindOffset(x, y, 250);
        const later = nomadIdleWindOffset(x, y, 650);
        expect(Math.hypot(later[0] - start[0], later[1] - start[1])).toBeGreaterThan(1);
        const repeated = nomadIdleWindOffset(x, y, 250 + period);
        expect(repeated[0]).toBeCloseTo(start[0]);
        expect(repeated[1]).toBeCloseTo(start[1]);
        const before = nomadIdleWindOffset(x, y, 5599.99);
        const after = nomadIdleWindOffset(x, y, 5600.01);
        expect(Math.hypot(after[0] - before[0], after[1] - before[1])).toBeLessThan(0.002);
    }
});
