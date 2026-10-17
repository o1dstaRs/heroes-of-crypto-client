import { expect, test } from "bun:test";

import { animationAtlases } from "../generated/animation_atlases";
import { images } from "../imageAssets";
import { CREATURE_WALK_CYCLE_DISTANCE_CELLS, creatureWalkAnimationEnabledForUnit } from "../scenes/RenderableUnit";
import { shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "./imageAssetTiers";
import { getSplitBundles } from "./PixiTextureLoader";

test("Nightmare lab loads the eight source poses at full resolution while combat remains frozen", () => {
    const meta = animationAtlases.Nightmare.walk;
    expect(meta.frameCount).toBe(8);
    expect(meta.frameWidth).toBe(768);
    expect(meta.frameHeight).toBe(768);
    expect(meta.layout).toEqual({ cols: 5, rows: 2 });
    expect(creatureWalkAnimationEnabledForUnit("Nightmare", true)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Nightmare", false)).toBe(true);
    expect(CREATURE_WALK_CYCLE_DISTANCE_CELLS).toBe(1.3);
    expect(isRedundantFullResolutionUnitAtlasKey("nightmare_walk_atlas")).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("nightmare_walk_atlas", false)).toBe(true);
    expect(images.nightmare_walk_atlas).toContain("nightmare_walk_atlas.webp?v=");
    expect(getSplitBundles({ animationsEnabled: false }).animations.nightmare_walk_atlas).toBeDefined();
});
