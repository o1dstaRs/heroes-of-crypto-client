import { describe, expect, test } from "bun:test";

import { DEFAULT_LOADING_SCREEN_FIRE_TUNING, normalizeLoadingScreenFireTuning } from "./loadingScreenFireTuning";

describe("loadingScreenFireTuning", () => {
    test("ships the approved visible slider between both end slots", () => {
        expect(DEFAULT_LOADING_SCREEN_FIRE_TUNING.medallionVisible).toBe(true);
        expect(DEFAULT_LOADING_SCREEN_FIRE_TUNING.medallionSize).toBe(82);
        expect(DEFAULT_LOADING_SCREEN_FIRE_TUNING.medallionStartOffsetX).toBe(-6.5);
        expect(DEFAULT_LOADING_SCREEN_FIRE_TUNING.medallionStartOffsetY).toBe(5.5);
        expect(DEFAULT_LOADING_SCREEN_FIRE_TUNING.medallionEndOffsetX).toBe(6);
        expect(DEFAULT_LOADING_SCREEN_FIRE_TUNING.medallionEndOffsetY).toBe(4.5);
        expect(DEFAULT_LOADING_SCREEN_FIRE_TUNING.sectionCount).toBe(1);
        expect(DEFAULT_LOADING_SCREEN_FIRE_TUNING.sectionAlpha).toBe(0);
        expect(DEFAULT_LOADING_SCREEN_FIRE_TUNING.secondary.enabled).toBe(true);
    });

    test("returns an independent normalized unified fire zone", () => {
        const first = normalizeLoadingScreenFireTuning(undefined);
        const second = normalizeLoadingScreenFireTuning(undefined);

        expect(first).toEqual(DEFAULT_LOADING_SCREEN_FIRE_TUNING);
        expect(second).toEqual(DEFAULT_LOADING_SCREEN_FIRE_TUNING);
        expect(first.overall).not.toBe(second.overall);
        expect(first.secondary).not.toBe(second.secondary);
    });

    test("clamps numeric fields and rejects unknown enum values", () => {
        const tuning = normalizeLoadingScreenFireTuning({
            baseLavaAlpha: 9,
            progressGlowAlpha: -4,
            medallionVisible: false,
            medallionSize: 999,
            medallionStartOffsetX: -9999,
            medallionStartOffsetY: 999,
            medallionEndOffsetX: 999,
            medallionEndOffsetY: -999,
            sectionCount: 99,
            sectionAlpha: -3,
            overall: {
                ...DEFAULT_LOADING_SCREEN_FIRE_TUNING.overall,
                fireType: "unknown" as never,
                blendMode: "multiply" as never,
                width: 0,
                height: -20,
                overflowBottom: 999,
                tiles: 99,
                frameOffset: -4,
                tint: 0x1ffffff,
            },
            secondary: {
                ...DEFAULT_LOADING_SCREEN_FIRE_TUNING.secondary,
                enabled: true,
                offsetX: 9999,
                height: 999,
                alpha: -1,
            },
        });

        expect(tuning.baseLavaAlpha).toBe(1.5);
        expect(tuning.progressGlowAlpha).toBe(0);
        expect(tuning.medallionVisible).toBe(false);
        expect(tuning.medallionSize).toBe(200);
        expect(tuning.medallionStartOffsetX).toBe(-1600);
        expect(tuning.medallionStartOffsetY).toBe(250);
        expect(tuning.medallionEndOffsetX).toBe(250);
        expect(tuning.medallionEndOffsetY).toBe(-250);
        expect(tuning.sectionCount).toBe(12);
        expect(tuning.sectionAlpha).toBe(0);
        expect(tuning.overall.fireType).toBe(DEFAULT_LOADING_SCREEN_FIRE_TUNING.overall.fireType);
        expect(tuning.overall.blendMode).toBe(DEFAULT_LOADING_SCREEN_FIRE_TUNING.overall.blendMode);
        expect(tuning.overall.width).toBe(1);
        expect(tuning.overall.height).toBe(1);
        expect(tuning.overall.overflowBottom).toBe(140);
        expect(tuning.overall.tiles).toBe(32);
        expect(tuning.overall.frameOffset).toBe(0);
        expect(tuning.overall.tint).toBe(0xffffff);
        expect(tuning.secondary.enabled).toBe(true);
        expect(tuning.secondary.offsetX).toBe(1600);
        expect(tuning.secondary.height).toBe(400);
        expect(tuning.secondary.alpha).toBe(0);
    });

    test("migrates the three-zone editor to one exact unified contour", () => {
        const tuning = normalizeLoadingScreenFireTuning({
            medallionSize: 78,
            center: {
                ...DEFAULT_LOADING_SCREEN_FIRE_TUNING.overall,
                offsetX: -44,
                offsetY: 10.5,
                width: 674,
                height: 266.6,
                overflowBottom: 34,
                alpha: 1.1,
            },
        });

        expect(tuning.medallionSize).toBe(78);
        expect(tuning.overall.offsetX).toBe(0);
        expect(tuning.overall.offsetY).toBe(0);
        expect(tuning.overall.width).toBe(652);
        expect(tuning.overall.height).toBe(266.6);
        expect(tuning.overall.overflowBottom).toBe(0);
        expect(tuning.overall.alpha).toBe(1.1);
    });
});
