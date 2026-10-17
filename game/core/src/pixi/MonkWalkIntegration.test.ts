import { expect, test } from "bun:test";

import { animationAtlases } from "../generated/animation_atlases";
import { creatureWalkAnimationEnabledForUnit } from "../scenes/RenderableUnit";
import { shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "./imageAssetTiers";
import { getSplitBundles } from "./PixiTextureLoader";

test("Monk approved walk is enabled in combat and the lab and its eight native frames load while legacy motion is frozen", () => {
    expect(creatureWalkAnimationEnabledForUnit("Monk", true)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Monk", false)).toBe(true);
    expect(animationAtlases["Monk Lab"].walk.frameCount).toBe(8);
    expect(animationAtlases["Monk Lab"].walk.frameWidth).toBe(768);
    expect(shouldPreloadUnitAnimationAtlas("monk_lab_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("monk_lab_walk_atlas")).toBe(false);
    expect(getSplitBundles({ animationsEnabled: false }).animations.monk_lab_walk_atlas).toBeDefined();
    expect(shouldPreloadUnitAnimationAtlas("monk_lab_idle_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("monk_lab_idle_atlas")).toBe(false);
    expect(getSplitBundles({ animationsEnabled: false }).idleAtlases.monk_lab_idle_atlas).toBeDefined();
    expect(animationAtlases["Monk Lab"].idle.frameCount).toBe(24);
    for (const state of ["hit", "death"]) {
        const key = `monk_lab_${state}_atlas`;
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(getSplitBundles({ animationsEnabled: false }).animations[key]).toBeDefined();
    }
});
