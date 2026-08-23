import { expect, test } from "bun:test";

import { battleSidebarWidth } from "../pixi/boardFit";
import { computeBattleSidebarMetrics } from "./LeftSideBar/sidebarMetrics";
import { resolveLeftSidebarPortraitArt } from "./leftSidebarPortraitArt";

import {
    DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING,
    LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X,
    LEFT_SIDEBAR_PORTRAIT_TUNING,
    LEFT_SIDEBAR_CARD_ASPECT,
    LEFT_SIDEBAR_STAT_PLATE_SHARE,
    LEFT_SIDEBAR_ART_OFFSET_MAX,
    LEFT_SIDEBAR_ART_SCALE_MIN,
    LEFT_SIDEBAR_CONTAINER_OFFSET_MIN,
    LEFT_SIDEBAR_CONTAINER_WIDTH_MAX,
    leftSidebarPortraitTuningEquals,
    normalizeLeftSidebarPortraitTuning,
} from "./leftSidebarPortraitTuning";

test("left sidebar portrait tuning contains the exported per-creature settings", () => {
    expect(Object.keys(LEFT_SIDEBAR_PORTRAIT_TUNING)).toHaveLength(56);
    expect(LEFT_SIDEBAR_PORTRAIT_TUNING[6]).toEqual({
        artScale: 1.5,
        artOffsetX: -1,
        artOffsetY: 17,
        containerWidth: 99,
        containerOffsetX: 1,
    });
    expect(LEFT_SIDEBAR_PORTRAIT_TUNING[39]?.artOffsetX).toBe(25);
    expect(LEFT_SIDEBAR_PORTRAIT_TUNING[34]).toMatchObject({ artScale: 0.8, artOffsetX: 38, artOffsetY: 59 });
    expect(LEFT_SIDEBAR_PORTRAIT_TUNING[49]?.artScale).toBe(0.77);
    expect(LEFT_SIDEBAR_PORTRAIT_TUNING[51]?.artScale).toBe(1.48);
});

test("left sidebar portrait checkpoint X is the active production set", () => {
    expect(LEFT_SIDEBAR_PORTRAIT_TUNING).toBe(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X);
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[6]).toMatchObject({ artScale: 1.5, artOffsetX: -1, artOffsetY: 17 });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[23]).toMatchObject({ artScale: 1.05, artOffsetY: 27 });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[39]).toMatchObject({ artScale: 1.18, artOffsetX: 25, artOffsetY: 15 });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[43]).toMatchObject({ artScale: 0.78, artOffsetX: 38 });
    expect(LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X[51]).toMatchObject({ artScale: 1.48, artOffsetX: 5, artOffsetY: 39 });
});

test("left sidebar mirrors only the Valkyrie artwork", () => {
    expect(resolveLeftSidebarPortraitArt(34)).toMatchObject({
        artScaleX: -1,
        source: expect.stringContaining("left_sidebar_valkyrie_hd.webp"),
    });
    expect(resolveLeftSidebarPortraitArt(33).artScaleX).toBeUndefined();
});

test("requested left-sidebar creatures use project-owned HD crops", () => {
    const expectedHdSources: Record<number, string> = {
        3: "troglodyte",
        11: "centaur",
        12: "berserker",
        13: "wolf_rider",
        15: "nomad",
        22: "fairy",
        24: "elf",
        31: "peasant",
        32: "squire",
        33: "arbalester",
        34: "valkyrie",
        35: "pikeman",
        36: "healer",
        46: "mermaid",
        47: "dryad",
        48: "blacksmith",
        49: "wandering_mage",
        55: "battle_mage",
    };

    for (const [creatureId, sourceName] of Object.entries(expectedHdSources)) {
        expect(resolveLeftSidebarPortraitArt(Number(creatureId)).source).toContain(
            `left_sidebar_${sourceName}_hd.webp`,
        );
    }
});

test("left sidebar portrait tuning keeps the approved global baseline", () => {
    expect(DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING).toEqual({
        artScale: 0.93,
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
