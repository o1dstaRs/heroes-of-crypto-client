import { afterEach, expect, test } from "bun:test";

import {
    animationAtlasPrewarmKeys,
    approvedAnimationAssetKeysForUnit,
    CREATURE_SPRITE_ANIMATION_SETTINGS,
} from "./creatureAnimationSettings";

const previousApproved = CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled;
afterEach(() => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = previousApproved;
});

test("caller edits and extra resting sheets cannot contaminate cached loading or prewarm order", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    const loading = approvedAnimationAssetKeysForUnit("Black Dragon");
    const prewarm = animationAtlasPrewarmKeys("Black Dragon");
    const expectedLoading = [...loading];
    const expectedPrewarm = [...prewarm];
    loading.reverse().push("caller-only-atlas");
    prewarm.splice(0, 2, "caller-only-atlas");

    expect(approvedAnimationAssetKeysForUnit("Black Dragon")).toEqual(expectedLoading);
    expect(animationAtlasPrewarmKeys("Black Dragon")).toEqual(expectedPrewarm);
    expect(animationAtlasPrewarmKeys("Black Dragon", "first-resting-atlas")).toEqual([
        ...expectedPrewarm,
        "first-resting-atlas",
    ]);
    expect(animationAtlasPrewarmKeys("Black Dragon", "second-resting-atlas")).toEqual([
        ...expectedPrewarm,
        "second-resting-atlas",
    ]);
    expect(animationAtlasPrewarmKeys("Black Dragon", expectedPrewarm[0])).toEqual(expectedPrewarm);
    expect(animationAtlasPrewarmKeys("Black Dragon", "arbalester_idle_page_01_atlas")).toEqual(expectedPrewarm);
    expect(animationAtlasPrewarmKeys("Black Dragon")).toEqual(expectedPrewarm);
});

test("a warmed cache follows animation switches immediately and retains the explicit resting fallback", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    const loading = approvedAnimationAssetKeysForUnit("Angel");
    const prewarm = animationAtlasPrewarmKeys("Angel");
    expect(loading.length).toBeGreaterThan(0);
    expect(prewarm.length).toBeGreaterThan(0);

    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = false;
    expect(approvedAnimationAssetKeysForUnit("Angel")).toEqual([]);
    expect(animationAtlasPrewarmKeys("Angel")).toEqual([]);
    expect(animationAtlasPrewarmKeys("Angel", "resting-atlas")).toEqual(["resting-atlas"]);
    expect(animationAtlasPrewarmKeys("Angel", "arbalester_idle_page_01_atlas")).toEqual([]);

    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    expect(approvedAnimationAssetKeysForUnit("Angel")).toEqual(loading);
    expect(animationAtlasPrewarmKeys("Angel")).toEqual(prewarm);
    expect(approvedAnimationAssetKeysForUnit("Unknown Creature")).toEqual([]);
    expect(animationAtlasPrewarmKeys("Unknown Creature", "resting-atlas")).toEqual(["resting-atlas"]);
});
