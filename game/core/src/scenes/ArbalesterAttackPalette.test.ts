import { describe, expect, it } from "bun:test";
import { arbalesterAttackPaletteFrame } from "./ArbalesterAttackPalette";
import { ARBALESTER_IDLE_BODY_TONE } from "./ArbalesterAttackToneData";

const states = ["attack", "attack_up", "attack_down", "melee_attack", "melee_attack_up", "melee_attack_down"];

describe("Arbalester attack material palette", () => {
    it("restores idle shadow depth through monotone curves in every attack frame", () => {
        for (const state of states) {
            for (let frame = 1; frame <= 10; frame++) {
                const source = arbalesterAttackPaletteFrame(state, frame)!.bodyTone;
                expect(source.length).toBe(ARBALESTER_IDLE_BODY_TONE.length);
                expect(source[0]).toBe(0);
                expect(source[source.length - 1]).toBe(1);
                for (let i = 1; i < source.length; i++) {
                    expect(source[i]).toBeGreaterThan(source[i - 1]);
                    expect(ARBALESTER_IDLE_BODY_TONE[i]).toBeGreaterThan(ARBALESTER_IDLE_BODY_TONE[i - 1]);
                }
            }
        }
        // The reported raised shot had a 15/255 shadow floor versus idle's 6/255.
        const raised = arbalesterAttackPaletteFrame("attack_up", 5)!.bodyTone;
        expect(raised[2]).toBeGreaterThan(0.055);
        expect(ARBALESTER_IDLE_BODY_TONE[2]).toBeLessThan(0.027);
        expect(ARBALESTER_IDLE_BODY_TONE[4]).toBeCloseTo(0.15245, 4);
    });

    it("removes the measured blue cast from raised/lowered strikes without changing luminance", () => {
        // Opaque body-interior chromaticity measured in the offending frame 5,
        // after material grading. Idle reference R/G=1.24490, B/G=0.90769.
        const samples = [
            ["melee_attack_up", 1.09090909, 0.96629213],
            ["melee_attack_down", 1.13888889, 0.95652174],
            ["attack_down", 1.09615385, 0.97916667],
        ] as const;
        const luma = [0.2126, 0.7152, 0.0722];
        for (const [state, redRatio, blueRatio] of samples) {
            const gain = arbalesterAttackPaletteFrame(state, 5)!.bodyBalance;
            for (const exposure of [0.03, 0.12, 0.4]) {
                const original = [redRatio * exposure, exposure, blueRatio * exposure];
                const balanced = original.map((v, i) => v * gain[i]);
                const before = original.reduce((sum, v, i) => sum + v * luma[i], 0);
                const after = balanced.reduce((sum, v, i) => sum + v * luma[i], 0);
                const output = balanced.map((v) => (v * before) / after);
                expect(output[0] / output[1]).toBeCloseTo(1.244898, 5);
                expect(output[2] / output[1]).toBeCloseTo(0.907692, 5);
                expect(output.reduce((sum, v, i) => sum + v * luma[i], 0)).toBeCloseTo(before, 10);
            }
        }
    });

    it("keeps warm cuirass shadows warm across exposure and all sixty attack frames", () => {
        for (const state of states) {
            for (let frame = 1; frame <= 10; frame++) {
                const palette = arbalesterAttackPaletteFrame(state, frame)!;
                // The source cuirass has median R/G near 1.52. Independent RGB
                // exponents previously made its dark brown shadows cyan.
                for (const brightness of [0.02, 0.04, 0.08, 0.16, 0.32, 0.5]) {
                    const red = Math.min(1, palette.gains[0] * (1.52 * brightness) ** palette.gammas[0]);
                    const green = Math.min(1, palette.gains[1] * brightness ** palette.gammas[1]);
                    expect(red / green).toBeGreaterThan(1);
                }
                for (let material = 0; material < 5; material++) {
                    const index = material * 3;
                    expect(palette.gammas[index]).toBe(palette.gammas[index + 1]);
                    expect(palette.gammas[index]).toBe(palette.gammas[index + 2]);
                }
            }
        }
    });

    it("bypasses exact idle endpoints and has finite positive transfers for authored attack frames", () => {
        for (const state of states) {
            expect(arbalesterAttackPaletteFrame(state, 0)).toBeUndefined();
            expect(arbalesterAttackPaletteFrame(state, 11)).toBeUndefined();
            for (let frame = 1; frame <= 10; frame++) {
                const palette = arbalesterAttackPaletteFrame(state, frame)!;
                expect(palette.gains.length).toBe(15);
                expect(palette.gammas.length).toBe(15);
                for (const value of [
                    ...palette.gains,
                    ...palette.gammas,
                    ...palette.handGain,
                    ...palette.bodyBalance,
                ]) {
                    expect(Number.isFinite(value)).toBe(true);
                    expect(value).toBeGreaterThan(0);
                }
            }
        }
    });
});
