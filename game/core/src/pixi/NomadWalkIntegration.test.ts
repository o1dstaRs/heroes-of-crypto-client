import { expect, test } from "bun:test";

import { animationAtlases } from "../generated/animation_atlases";
import { images } from "../imageAssets";
import {
    CREATURE_WALK_CYCLE_DISTANCE_CELLS,
    creatureWalkAnimationEnabledForUnit,
    creatureIdleAnimationEnabledForUnit,
    authoredIdleFrameForElapsed,
    creatureOneShotAnimationEnabledForUnit,
    nomadReactionCanvasScale,
    resolveAnimationAtlasState,
} from "../scenes/RenderableUnit";
import { shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "./imageAssetTiers";
import { getSplitBundles } from "./PixiTextureLoader";

test("Nomad uses the exact eight-frame source walk in combat and the animation lab", () => {
    const meta = animationAtlases.Nomad?.walk;
    expect(meta?.frameCount).toBe(8);
    expect(meta?.frameWidth).toBe(768);
    expect(meta?.frameHeight).toBe(768);
    expect(meta?.layout).toEqual({ cols: 5, rows: 2 });
    expect(creatureWalkAnimationEnabledForUnit("Nomad", false)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Nomad", true)).toBe(true);
    expect(CREATURE_WALK_CYCLE_DISTANCE_CELLS).toBe(1.3);
    expect(isRedundantFullResolutionUnitAtlasKey("nomad_walk_atlas")).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("nomad_walk_atlas", false)).toBe(true);
    expect(images.nomad_walk_atlas).toContain("nomad_walk_atlas.webp?v=");
    expect(getSplitBundles({ animationsEnabled: false }).animations.nomad_walk_atlas).toBeDefined();
});

test("Nomad authored hit and death load at full resolution with animations globally disabled", () => {
    const bundles = getSplitBundles({ animationsEnabled: false });
    for (const state of ["hit", "death"] as const) {
        const meta = animationAtlases.Nomad[state];
        const key = `nomad_${state}_atlas` as const;
        expect(creatureOneShotAnimationEnabledForUnit("Nomad", state)).toBe(true);
        expect(meta.frameCount).toBe(state === "hit" ? 7 : 8);
        const canvas = state === "death" ? 1024 : 768;
        const padding = state === "death" ? 128 : 0;
        expect(meta.frameWidth).toBe(canvas);
        expect(meta.frameHeight).toBe(canvas);
        expect(meta.footAnchorY! * canvas - padding).toBe(742);
        expect(nomadReactionCanvasScale("Nomad", state) / canvas).toBeCloseTo(1 / 768, 12);
        expect(meta.frameDurationsMs).toHaveLength(meta.frameCount);
        expect(meta.frameDurationsMs!.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
            state === "hit" ? 400 : 825 / 1.22,
            8,
        );
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(bundles.animations[key]).toBeDefined();
        expect(images[key]).toContain(`${key}.webp?v=`);
    }
});

test("Nomad holds its canonical idle before inspecting the blade and returns to it after the gesture", () => {
    const idle = animationAtlases.Nomad.idle;
    expect(creatureIdleAnimationEnabledForUnit("Nomad")).toBe(true);
    expect(idle.footAnchorY).toBe(animationAtlases.Nomad.walk.footAnchorY);
    const durations = idle.frameDurationsMs!;
    expect(durations).toHaveLength(idle.frameCount);
    expect(authoredIdleFrameForElapsed(5500, durations)).toBe(0);
    expect(authoredIdleFrameForElapsed(6300, durations)).toBe(4);
    expect(
        authoredIdleFrameForElapsed(
            durations.reduce((sum, value) => sum + value, 0),
            durations,
        ),
    ).toBe(0);
    expect(isRedundantFullResolutionUnitAtlasKey("nomad_idle_atlas")).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("nomad_idle_atlas", false)).toBe(true);
    expect(getSplitBundles({ animationsEnabled: false }).idleAtlases.nomad_idle_atlas).toBeDefined();
});

test("Nomad selects three distinct authored sword attacks with constant pixel scale and floor", () => {
    const bundles = getSplitBundles({ animationsEnabled: false });
    for (const suffix of ["", "_up", "_down"] as const) {
        const state = `melee_attack${suffix}` as const;
        const key = `nomad_${state}_atlas` as const;
        const meta = animationAtlases.Nomad[state];
        expect(resolveAnimationAtlasState("Nomad", `attack${suffix}`)).toBe(state);
        expect(creatureOneShotAnimationEnabledForUnit("Nomad", state)).toBe(true);
        expect(meta.frameCount).toBe(8);
        expect(meta.frameWidth).toBe(1024);
        expect(meta.footAnchorY! * 1024 - 128).toBe(742);
        expect(nomadReactionCanvasScale("Nomad", state) / 1024).toBeCloseTo(1 / 768, 12);
        expect(meta.frameDurationsMs!.reduce((sum, n) => sum + n, 0)).toBeCloseTo(suffix === "" ? 500 : 600, 8);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(bundles.animations[key]).toBeDefined();
    }
});
