import { expect, test } from "bun:test";

import { battleSidebarWidth } from "../pixi/boardFit";
import { computeBattleSidebarMetrics } from "./LeftSideBar/sidebarMetrics";
import { resolveLeftSidebarPortraitArt } from "./leftSidebarPortraitArt";
import { resolveCreaturePortraitArtPlacement } from "./creaturePortraitVisual";
import { DEFAULT_PORTRAIT_FRAMING } from "./portraitFraming";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";

import {
    DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING,
    LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X,
    LEFT_SIDEBAR_PORTRAIT_TUNING,
    LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEY,
    LEFT_SIDEBAR_CARD_ASPECT,
    LEFT_SIDEBAR_STAT_PLATE_SHARE,
    LEFT_SIDEBAR_ART_OFFSET_MAX,
    LEFT_SIDEBAR_ART_SCALE_MAX,
    LEFT_SIDEBAR_ART_SCALE_MIN,
    LEFT_SIDEBAR_CONTAINER_OFFSET_MIN,
    LEFT_SIDEBAR_CONTAINER_WIDTH_MAX,
    leftSidebarPortraitTuningEquals,
    normalizeLeftSidebarPortraitTuning,
    committedLeftSidebarPortraitTuning,
} from "./leftSidebarPortraitTuning";

const committedPlacement = (creatureId: number) => {
    const art = resolveLeftSidebarPortraitArt(creatureId);
    const tuning = committedLeftSidebarPortraitTuning(creatureId);
    return resolveCreaturePortraitArtPlacement(DEFAULT_PORTRAIT_FRAMING, {
        independentSource: art.usesFraming === false,
        baseScale: art.baseScale,
        scale: tuning.artScale,
        offsetX: tuning.artOffsetX,
        offsetY: tuning.artOffsetY,
    });
};

test("left sidebar keeps pre-cropped test-server portraits neutral", () => {
    expect(LEFT_SIDEBAR_PORTRAIT_TUNING).toEqual({});

    for (const creatureId of Object.keys(UNIT_ID_TO_NAME).map(Number).filter(Boolean)) {
        expect(committedLeftSidebarPortraitTuning(creatureId)).toEqual(DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING);
        expect(committedPlacement(creatureId)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    }
});

test("left sidebar keeps the legacy editor checkpoint available but inactive", () => {
    expect(LEFT_SIDEBAR_PORTRAIT_TUNING).not.toBe(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X);
    expect(LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEY).toBe("hoc-dev-left-screen-portrait-tuning-v1");
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[13]).toEqual({
        artScale: 0.78,
        artOffsetX: 4,
        artOffsetY: -76,
        containerWidth: 99,
        containerOffsetX: 1,
    });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[15]).toMatchObject({
        artScale: 0.7,
        artOffsetX: -6,
        artOffsetY: -40,
    });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[24]).toMatchObject({
        artScale: 0.85,
        artOffsetX: -25,
        artOffsetY: 4,
    });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[35]).toMatchObject({
        artScale: 0.82,
        artOffsetX: -21,
        artOffsetY: 49,
    });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[36]).toMatchObject({
        artScale: 0.86,
        artOffsetX: -24,
        artOffsetY: 6,
    });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[55]).toMatchObject({
        artScale: 0.73,
        artOffsetX: -3,
        artOffsetY: 12,
    });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[3]).toMatchObject({ artScale: 0.97, artOffsetX: 18, artOffsetY: 2 });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[6]).toMatchObject({ artScale: 1.5, artOffsetX: -1, artOffsetY: 17 });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[23]).toMatchObject({ artScale: 1.05, artOffsetY: 27 });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[39]).toMatchObject({ artScale: 1.18, artOffsetX: 25, artOffsetY: 15 });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[43]).toMatchObject({ artScale: 0.78, artOffsetX: 38 });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[51]).toMatchObject({ artScale: 3, artOffsetX: -41, artOffsetY: 20 });
});

test("left sidebar uses the dedicated Valkyrie left-screen artwork without a legacy mirror", () => {
    expect(resolveLeftSidebarPortraitArt(34)).toMatchObject({
        source: expect.stringContaining("valkyrie_left_screen_x2.webp"),
        fit: "contain",
        baseScale: 1,
    });
    expect(resolveLeftSidebarPortraitArt(34).artScaleX).toBeUndefined();
});

test("every playable creature uses the test-server left-screen portrait set", () => {
    for (const [creatureId, name] of Object.entries(UNIT_ID_TO_NAME)) {
        if (Number(creatureId) === 0) continue;
        const sourceName = name.toLowerCase().replaceAll(" ", "_");
        expect(resolveLeftSidebarPortraitArt(Number(creatureId))).toMatchObject({
            source: expect.stringContaining(`${sourceName}_left_screen_x2.webp`),
            usesFraming: false,
            fit: "contain",
            baseScale: 1,
        });
    }
});

test("dedicated left-screen sources are rendered without the legacy transform", () => {
    expect(committedPlacement(3)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    expect(committedPlacement(13)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    expect(committedPlacement(51)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    expect(resolveLeftSidebarPortraitArt(51)).toMatchObject({
        source: expect.stringContaining("wyvern_left_screen_x2.webp"),
        fit: "contain",
        baseScale: 1,
    });
});

test("Troglodyte uses its test-server source at neutral placement", () => {
    expect(resolveLeftSidebarPortraitArt(3)).toMatchObject({
        source: expect.stringContaining("troglodyte_left_screen_x2.webp"),
    });
    expect(committedPlacement(3)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
});

test("Wolf Rider keeps its left-screen crop independent from pick-card framing", () => {
    expect(resolveLeftSidebarPortraitArt(13)).toMatchObject({
        source: expect.stringContaining("wolf_rider_left_screen_x2.webp"),
    });
    expect(resolveLeftSidebarPortraitArt(13).usesFraming).toBe(false);
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
    expect(LEFT_SIDEBAR_ART_SCALE_MAX).toBe(3);
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
