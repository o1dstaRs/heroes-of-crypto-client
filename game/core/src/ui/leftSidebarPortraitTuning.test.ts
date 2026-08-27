import { getCreaturesByLevel } from "@heroesofcrypto/common";
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
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";

test("uses every uploaded left-screen portrait directly", () => {
    const creatureIds = [1, 2, 3, 4].flatMap((level) => [...getCreaturesByLevel(level)]);
    for (const creatureId of creatureIds) {
        const slug = UNIT_ID_TO_NAME[creatureId].toLowerCase().replaceAll(" ", "_");
        expect(resolveLeftSidebarPortraitArt(creatureId)).toEqual({
            source: expect.stringContaining(`${slug}_left_screen_x2.webp`),
            fit: "contain",
            baseScale: 1,
        });
    }
});

test("uses neutral production tuning while retaining the previous editor checkpoint", () => {
    expect(LEFT_SIDEBAR_PORTRAIT_TUNING).toEqual({});
    expect(Object.keys(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X).length).toBeGreaterThan(50);
    expect(LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEY).toBe("hoc-dev-left-sidebar-portrait-tuning-v1");
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
    const barSize = battleSidebarWidth(2560, 1080);
    const metrics = computeBattleSidebarMetrics(barSize, 2560, 1080, 1042);
    expect(metrics.barSize).toBe(barSize);
});

test("normalizes incomplete and out-of-range editor values", () => {
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
    expect(
        leftSidebarPortraitTuningEquals(DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING, {
            ...DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING,
        }),
    ).toBe(true);
});
