import { describe, expect, test } from "bun:test";
import { WOLF_HEAD_PALETTE, wolfHeadPaletteColor } from "./WolfIdleHeadPalette";

describe("Wolf moving head palette", () => {
    test("all authored poses keep the original black nose, open mouth and eye colors", () => {
        for (let pose = 0; pose < WOLF_HEAD_PALETTE.length; pose++) {
            const { eye, nose } = WOLF_HEAD_PALETTE[pose];
            for (const raw of [
                [0, 0, 0],
                [0.02, 0.018, 0.015],
                [0.3, 0.05, 0.04],
            ] as const) {
                const result = wolfHeadPaletteColor(raw, nose[0], nose[1], pose);
                expect(result.weight).toBe(1);
                expect(result.color).toEqual([...raw]);
            }
            const eyeColor = [0.72, 0.46, 0.21] as const;
            expect(wolfHeadPaletteColor(eyeColor, eye[0], eye[1], pose).color).toEqual([...eyeColor]);
        }
    });

    test("correction follows raised head fur and does not recolor armor or the rear body", () => {
        for (let pose = 0; pose < WOLF_HEAD_PALETTE.length; pose++) {
            const { centers } = WOLF_HEAD_PALETTE[pose];
            const raw = [0.45, 0.35, 0.28] as const;
            for (const [x, y] of centers.slice(0, 4)) {
                const result = wolfHeadPaletteColor(raw, x, y, pose);
                expect(result.weight).toBeGreaterThan(0.95);
                expect(result.color.every(Number.isFinite)).toBe(true);
                expect(result.color).not.toEqual([...raw]);
            }
            expect(wolfHeadPaletteColor(raw, 400, 330, pose).weight).toBe(0);
            expect(wolfHeadPaletteColor(raw, 280, 360, pose).weight).toBe(0);
            expect(wolfHeadPaletteColor(raw, 443, 685, pose).weight).toBe(0);
        }
    });
});
