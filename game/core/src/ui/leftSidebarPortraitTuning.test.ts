import { expect, test } from "bun:test";

import { battleSidebarWidth } from "../pixi/boardFit";
import { computeBattleSidebarMetrics } from "./LeftSideBar/sidebarMetrics";
import { resolveLeftSidebarPortraitArt } from "./leftSidebarPortraitArt";

import {
    DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING,
    LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X,
    LEFT_SIDEBAR_PORTRAIT_TUNING,
    LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEY,
    LEFT_SIDEBAR_CARD_ASPECT,
    LEFT_SIDEBAR_STAT_PLATE_SHARE,
    LEFT_SIDEBAR_ART_OFFSET_MAX,
    LEFT_SIDEBAR_ART_SCALE_MIN,
    LEFT_SIDEBAR_CONTAINER_OFFSET_MIN,
    LEFT_SIDEBAR_CONTAINER_WIDTH_MAX,
    leftSidebarPortraitTuningEquals,
    normalizeLeftSidebarPortraitTuning,
} from "./leftSidebarPortraitTuning";

test("left sidebar keeps prepared left-screen portraits neutral", () => {
    expect(LEFT_SIDEBAR_PORTRAIT_TUNING).toEqual({});
});

test("legacy editor checkpoint stays available but inactive", () => {
    expect(LEFT_SIDEBAR_PORTRAIT_TUNING).not.toBe(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X);
    expect(LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEY).toBe("hoc-dev-left-screen-portrait-tuning-v1");
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[13]).toMatchObject({ artScale: 0.78, artOffsetY: -76 });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[51]).toMatchObject({ artScale: 3, artOffsetX: -41, artOffsetY: 20 });
});

test("left sidebar uses the dedicated Centaur source without legacy framing", () => {
    expect(resolveLeftSidebarPortraitArt(11)).toMatchObject({
        source: expect.stringContaining("centaur_left_screen_x2.webp"),
        usesFraming: false,
        fit: "contain",
        baseScale: 1,
    });
});

test("requested left-sidebar creatures use the project-owned left-screen set", () => {
    const expectedSources: Record<number, string> = {
        3: "troglodyte_left_screen_x2.webp",
        11: "centaur_left_screen_x2.webp",
        13: "wolf_rider_left_screen_x2.webp",
        34: "valkyrie_left_screen_x2.webp",
        51: "wyvern_left_screen_x2.webp",
    };

    for (const [creatureId, sourceName] of Object.entries(expectedSources)) {
        expect(resolveLeftSidebarPortraitArt(Number(creatureId))).toMatchObject({
            source: expect.stringContaining(sourceName),
            usesFraming: false,
        });
    }
});

test("left sidebar portrait tuning keeps the approved global baseline", () => {
    expect(DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING).toEqual({
        artScale: 1,
        artOffsetX: 0,
        artOffsetY: 0,
        containerWidth: 99,
        containerOffsetX: 1,
    });
});

test("left sidebar portrait editor matches the complete battle and sandbox card zone", () => {
    expect(LEFT_SIDEBAR_CARD_ASPECT).toBeCloseTo(190 / 256, 8);
    expect(LEFT_SIDEBAR_STAT_PLATE_SHARE).toBe(0.32);
});

test("portrait editor ultrawide preset resolves through the live battle sidebar metrics", () => {
    const barSize = battleSidebarWidth(2560, 1080);
    const metrics = computeBattleSidebarMetrics(barSize, 2560, 1080, 1042);

    expect(barSize).toBe(629);
    expect(metrics.contentWidth).toBe(612);
    expect(metrics.barSize).toBe(barSize);
});

test("left sidebar portrait tuning normalizes incomplete and out-of-range editor values", () => {
    expect(
        normalizeLeftSidebarPortraitTuning({
            artScale: -5,
            artOffsetX: 900,
            containerWidth: 900,
            containerOffsetX: -900,
        }),
    ).toEqual({
        artScale: LEFT_SIDEBAR_ART_SCALE_MIN,
        artOffsetX: LEFT_SIDEBAR_ART_OFFSET_MAX,
        artOffsetY: 0,
        containerWidth: LEFT_SIDEBAR_CONTAINER_WIDTH_MAX,
        containerOffsetX: LEFT_SIDEBAR_CONTAINER_OFFSET_MIN,
    });
});

test("left sidebar portrait equality covers creature art and linked container geometry", () => {
    const baseline = normalizeLeftSidebarPortraitTuning();
    expect(leftSidebarPortraitTuningEquals(baseline, { ...baseline })).toBe(true);
    expect(leftSidebarPortraitTuningEquals(baseline, { ...baseline, containerWidth: 98 })).toBe(false);
    expect(leftSidebarPortraitTuningEquals(baseline, { ...baseline, artOffsetY: 1 })).toBe(false);
});
