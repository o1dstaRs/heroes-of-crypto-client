import { describe, expect, test } from "bun:test";

import {
    DEFAULT_LAVA_ANIMATION_TUNING,
    LAVA_ANIMATION_FRAME_COUNT,
    lavaAnimationFrameAtTime,
    lavaFireLightEnvelopeAtTime,
    lavaPitLightIntensityAtTime,
    normalizeLavaAnimationTuning,
} from "./lavaAnimationTuning";

describe("lava animation tuning", () => {
    test("normalizes unsafe editor input", () => {
        const tuning = normalizeLavaAnimationTuning({
            widthCells: 99,
            heightCells: -1,
            fireScaleX: 99,
            fireScaleY: -1,
            fireShiftXCells: 99,
            fireShiftYCells: -99,
            fireAlpha: 99,
            fireBrightness: 99,
            fireSaturation: -1,
            fireContrast: 99,
            fire2ScaleX: 99,
            fire2Speed: 99,
            fire2FrameOffset: 999,
            fireMaskShape: "hexagon" as never,
            fireMaskWidthCells: 99,
            fireMaskHeightCells: -1,
            fireMaskRotationDeg: 999,
            pitLightIntensity: 99,
            pitLightRadius: -1,
            pitLightPulseAmount: 99,
            pitLightWarmth: -1,
            fps: 0,
            firstFrame: 22,
            lastFrame: 2,
            scrubFrame: 999,
            splashCount: 99,
        });

        expect(tuning.widthCells).toBe(8);
        expect(tuning.heightCells).toBe(0.5);
        expect(tuning.fireScaleX).toBe(2);
        expect(tuning.fireScaleY).toBe(0.25);
        expect(tuning.fireShiftXCells).toBe(2);
        expect(tuning.fireShiftYCells).toBe(-2);
        expect(tuning.fireAlpha).toBe(1.5);
        expect(tuning.fireBrightness).toBe(2.5);
        expect(tuning.fireSaturation).toBe(0);
        expect(tuning.fireContrast).toBe(2.5);
        expect(tuning.fire2ScaleX).toBe(2);
        expect(tuning.fire2Speed).toBe(3);
        expect(tuning.fire2FrameOffset).toBe(63);
        expect(tuning.fireMaskShape).toBe("ellipse");
        expect(tuning.fireMaskWidthCells).toBe(6);
        expect(tuning.fireMaskHeightCells).toBe(0.25);
        expect(tuning.fireMaskRotationDeg).toBe(180);
        expect(tuning.pitLightIntensity).toBe(2);
        expect(tuning.pitLightRadius).toBe(0.15);
        expect(tuning.pitLightPulseAmount).toBe(1);
        expect(tuning.pitLightWarmth).toBe(0);
        expect(tuning.fps).toBe(0.25);
        expect(tuning.firstFrame).toBe(22);
        expect(tuning.lastFrame).toBe(22);
        expect(tuning.scrubFrame).toBe(22);
        expect(tuning.splashCount).toBe(24);
    });

    test("plays only the selected frame range", () => {
        const tuning = normalizeLavaAnimationTuning({ fps: 10, firstFrame: 12, lastFrame: 21 });
        expect(lavaAnimationFrameAtTime(tuning, 0)).toBe(12);
        expect(lavaAnimationFrameAtTime(tuning, 0.9)).toBe(21);
        expect(lavaAnimationFrameAtTime(tuning, 1)).toBe(12);
    });

    test("supports paused scrubbing and reverse playback", () => {
        const paused = normalizeLavaAnimationTuning({ paused: true, firstFrame: 10, lastFrame: 20, scrubFrame: 14 });
        expect(lavaAnimationFrameAtTime(paused, 999)).toBe(14);

        const reversed = normalizeLavaAnimationTuning({ fps: 10, firstFrame: 10, lastFrame: 20, reverse: true });
        expect(lavaAnimationFrameAtTime(reversed, 0)).toBe(20);
        expect(lavaAnimationFrameAtTime(reversed, 0.1)).toBe(19);
    });

    test("ships the complete smooth 64-frame fire-pit range", () => {
        expect(DEFAULT_LAVA_ANIMATION_TUNING.firstFrame).toBe(0);
        expect(DEFAULT_LAVA_ANIMATION_TUNING.lastFrame).toBe(LAVA_ANIMATION_FRAME_COUNT - 1);
    });

    test("starts exactly on the central four-by-four cell footprint", () => {
        expect(DEFAULT_LAVA_ANIMATION_TUNING.widthCells).toBe(4);
        expect(DEFAULT_LAVA_ANIMATION_TUNING.heightCells).toBe(4);
        expect(DEFAULT_LAVA_ANIMATION_TUNING.shiftXCells).toBe(0);
        expect(DEFAULT_LAVA_ANIMATION_TUNING.shiftYCells).toBe(0);
        expect(DEFAULT_LAVA_ANIMATION_TUNING.fireScaleX).toBe(0.96);
        expect(DEFAULT_LAVA_ANIMATION_TUNING.fireScaleY).toBe(1.325);
        expect(DEFAULT_LAVA_ANIMATION_TUNING.fireShiftXCells).toBe(-0.065);
        expect(DEFAULT_LAVA_ANIMATION_TUNING.fireShiftYCells).toBe(0.5);
    });

    test("keeps the approved Lava editor tuning as the shipped default", () => {
        expect(DEFAULT_LAVA_ANIMATION_TUNING).toMatchObject({
            fireScaleX: 0.96,
            fireScaleY: 1.325,
            fireBrightness: 1.69,
            fireSaturation: 0.88,
            fireContrast: 1.05,
            fire2Enabled: true,
            fire2ScaleX: 0.755,
            fire2ScaleY: 1.145,
            fire2ShiftYCells: 1.32,
            fire2Alpha: 0.56,
            fire2Brightness: 1.83,
            fire2Saturation: 0.82,
            fire2FrameOffset: 21,
            fireMaskShape: "ellipse",
            fireMaskWidthCells: 3.55,
            fireMaskHeightCells: 3.25,
            alpha: 1,
            brightness: 1,
            saturation: 1,
            contrast: 1,
            fps: 16.25,
            firstFrame: 0,
            lastFrame: 63,
            lightIntensity: 0,
            lightRadius: 0.79,
            lightPulseAmount: 0.27,
            lightPulseSpeed: 0.62,
            edgeFlicker: 0.64,
            lightShiftXCells: -0.22,
            lightShiftYCells: 1.31,
            pitLightIntensity: 1.58,
            pitLightRadius: 1,
            pitLightPulseAmount: 0.87,
            pitLightWarmth: 0.76,
            splashRate: 1.8,
            splashCount: 4,
            splashHeightCells: 0.2,
            splashSizeCells: 0.021,
            splashSpreadCells: 0.91,
            splashGlow: 0.53,
        });
    });

    test("normalizes independent light positioning", () => {
        const tuning = normalizeLavaAnimationTuning({ lightShiftXCells: 99, lightShiftYCells: -99 });
        expect(tuning.lightShiftXCells).toBe(4);
        expect(tuning.lightShiftYCells).toBe(-4);
    });

    test("light intensity is applied once and pulse controls are visibly responsive", () => {
        const dark = normalizeLavaAnimationTuning({ lightIntensity: 0 });
        expect(lavaFireLightEnvelopeAtTime(dark, 0).rootAlpha).toBe(0);

        const staticLight = normalizeLavaAnimationTuning({ lightPulseAmount: 0, edgeFlicker: 0 });
        const staticA = lavaFireLightEnvelopeAtTime(staticLight, 0);
        const staticB = lavaFireLightEnvelopeAtTime(staticLight, 10);
        expect(staticA.baseAlpha).toBe(staticB.baseAlpha);
        expect(staticA.edgeAlphas).toEqual(staticB.edgeAlphas);

        const active = normalizeLavaAnimationTuning({ lightPulseAmount: 1, edgeFlicker: 2 });
        const activeA = lavaFireLightEnvelopeAtTime(active, 0);
        const activeB = lavaFireLightEnvelopeAtTime(active, 1);
        expect(Math.abs(activeA.baseAlpha - activeB.baseAlpha)).toBeGreaterThan(0.05);
        expect(activeA.edgeAlphas).not.toEqual(activeB.edgeAlphas);
    });

    test("lights the pit independently and supports a pulsing inner glow", () => {
        const disabled = normalizeLavaAnimationTuning({ pitLightEnabled: false, pitLightIntensity: 2 });
        expect(lavaPitLightIntensityAtTime(disabled, 1)).toBe(0);

        const staticLight = normalizeLavaAnimationTuning({ pitLightIntensity: 0.8, pitLightPulseAmount: 0 });
        expect(lavaPitLightIntensityAtTime(staticLight, 0)).toBe(lavaPitLightIntensityAtTime(staticLight, 10));

        const pulsing = normalizeLavaAnimationTuning({ pitLightIntensity: 0.8, pitLightPulseAmount: 1 });
        expect(
            Math.abs(lavaPitLightIntensityAtTime(pulsing, 0) - lavaPitLightIntensityAtTime(pulsing, 1)),
        ).toBeGreaterThan(0.05);
    });
});
