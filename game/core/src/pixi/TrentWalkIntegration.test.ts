import { expect, test } from "bun:test";

import { animationAtlases } from "../generated/animation_atlases";
import { images } from "../imageAssets";
import {
    resolveAnimationAtlasState,
    trentActionCanvasScale,
    creatureIdleAnimationEnabledForUnit,
    creatureWalkAnimationEnabledForUnit,
    creatureOneShotAnimationEnabledForUnit,
} from "../scenes/RenderableUnit";
import { shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import { isIdleAtlasKey, isRedundantFullResolutionUnitAtlasKey } from "./imageAssetTiers";
import { getSplitBundles } from "./PixiTextureLoader";

test("Trent uses the approved eight-frame HD walk in combat and the animation lab", () => {
    const meta = animationAtlases.Trent?.walk;
    expect(meta?.frameCount).toBe(8);
    expect(meta?.layout).toEqual({ cols: 5, rows: 2 });
    expect(meta?.frameWidth).toBe(768);
    expect(creatureWalkAnimationEnabledForUnit("Trent", false)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Trent", true)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("trent_walk_atlas")).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("trent_walk_atlas", false)).toBe(true);
    expect(images.trent_walk_atlas).toContain("trent_walk_atlas.webp?v=");
    expect(getSplitBundles({ animationsEnabled: false }).animations.trent_walk_atlas).toBeDefined();
});

test("Trent plays the restored battlefield-matched idle atlas while the global animation switch is off", () => {
    const meta = animationAtlases.Trent?.idle;
    expect(meta?.frameCount).toBe(21);
    expect(meta?.layout).toEqual({ cols: 5, rows: 5 });
    expect(meta?.frameDurationsMs).toHaveLength(21);
    expect(meta?.frameDurationsMs?.reduce((sum, duration) => sum + duration, 0)).toBe(11770);
    expect(meta?.footAnchorY).toBe(730 / 768);
    expect(creatureIdleAnimationEnabledForUnit("Trent")).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("trent_idle_atlas")).toBe(false);
    expect(isIdleAtlasKey("trent_idle_atlas")).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("trent_idle_atlas", false)).toBe(true);
    expect(images.trent_idle_atlas).toContain("trent_idle_atlas.webp?v=");
    expect(getSplitBundles({ animationsEnabled: false }).idleAtlases.trent_idle_atlas).toBeDefined();
});

test("Trent hit and death retain authored timing and idle registration with global animations disabled", () => {
    const bundles = getSplitBundles({ animationsEnabled: false });
    for (const state of ["hit", "death"] as const) {
        const meta = animationAtlases.Trent[state];
        const key = `trent_${state}_atlas` as const;
        expect(creatureOneShotAnimationEnabledForUnit("Trent", state)).toBe(true);
        expect(meta.frameCount).toBe(state === "hit" ? 4 : 7);
        expect(meta.frameWidth).toBe(768);
        expect(meta.frameHeight).toBe(768);
        expect(meta.footAnchorY).toBe(animationAtlases.Trent.idle.footAnchorY);
        expect(meta.frameDurationsMs).toHaveLength(meta.frameCount);
        expect(meta.frameDurationsMs?.reduce((sum, duration) => sum + duration, 0)).toBeCloseTo(
            state === "hit" ? 500 : 1170 / 1.15,
            8,
        );
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(bundles.animations[key]).toBeDefined();
        expect(images[key]).toContain(`${key}.webp?v=`);
    }
});

test("Trent directional attacks preserve physical scale, ground registration and authored timing", () => {
    const bundles = getSplitBundles({ animationsEnabled: false });
    for (const state of ["attack", "attack_up", "attack_down"] as const) {
        const meta = animationAtlases.Trent[state];
        const key = `trent_${state}_atlas` as const;
        expect(resolveAnimationAtlasState("Trent", `melee_${state}`)).toBe(state);
        expect(creatureOneShotAnimationEnabledForUnit("Trent", state)).toBe(true);
        expect(creatureOneShotAnimationEnabledForUnit("Trent", `melee_${state}`)).toBe(true);
        expect(meta.frameCount).toBe(7);
        expect(meta.frameWidth).toBe(1024);
        expect(meta.frameHeight).toBe(1024);
        expect(meta.frameDurationsMs).toHaveLength(7);
        expect(meta.frameDurationsMs?.reduce((sum, duration) => sum + duration, 0)).toBe(750);
        expect((meta.footAnchorY ?? 0) * 1024 - 128).toBe(730);
        expect(trentActionCanvasScale("Trent", state) / 1024).toBeCloseTo(1 / 768, 12);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(bundles.animations[key]).toBeDefined();
        expect(images[key]).toContain(`${key}.webp?v=`);
    }
});

test("Trent cast has a two-handed slam, authored timing and padded-canvas compensation", () => {
    const meta = animationAtlases.Trent.cast;
    expect(meta.frameCount).toBe(7);
    expect(meta.frameWidth).toBe(1280);
    expect(meta.frameDurationsMs?.reduce((sum, value) => sum + value, 0)).toBe(1200);
    expect(meta.frameDurationsMs?.slice(0, 3).reduce((sum, value) => sum + value, 0)).toBe(470);
    expect((meta.footAnchorY ?? 0) * 1280 - 256).toBe(730);
    expect(trentActionCanvasScale("Trent", "cast") / 1280).toBeCloseTo(1 / 768, 12);
    expect(creatureOneShotAnimationEnabledForUnit("Trent", "cast")).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("trent_cast_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("trent_cast_atlas")).toBe(false);
    expect(images.trent_cast_atlas).toContain("trent_cast_atlas.webp?v=");
});
