import { describe, expect, test } from "bun:test";

import { images } from "../imageAssets";
import { getSplitBundles, isIdleAtlasKey, isRedundantFullResolutionUnitAtlasKey } from "./PixiTextureLoader";
import { isUnitAnimationAtlasKey } from "./unitAtlasKeys";

// The board renders every creature's PERMANENT art from its idle/default atlas. If those keys ride
// in the big Tier-2b animation bundle, a fresh-cache load shows the old static tokens until hundreds
// of MB finish downloading — the "old squared images on initial load" bug. These tests pin the
// three-way split so the idle bundle stays small and first.
describe("pixi texture bundle split", () => {
    test("classifies the board idle/default atlases and nothing else", () => {
        expect(isIdleAtlasKey("wolf_idle_atlas_quarter")).toBe(true);
        expect(isIdleAtlasKey("behemoth_default_atlas_half")).toBe(true);
        // Named idle specials (Orc's twirl, Scavenger's flourish) are part of the permanent loop too.
        expect(isIdleAtlasKey("orc_idle_axe_twirl_atlas_quarter")).toBe(true);

        // Action states stay in the background bundle, while full unit sources are excluded.
        expect(isIdleAtlasKey("wolf_walk_atlas_quarter")).toBe(false);
        expect(isIdleAtlasKey("wolf_idle_atlas")).toBe(false);
        expect(isRedundantFullResolutionUnitAtlasKey("wolf_idle_atlas")).toBe(true);
        // Non-unit VFX atlases are core, not idle unit art.
        expect(isIdleAtlasKey("active_turn_blue_fire_atlas")).toBe(false);
        expect(isRedundantFullResolutionUnitAtlasKey("active_turn_blue_fire_atlas")).toBe(false);
        // Non-atlas art never belongs here.
        expect(isIdleAtlasKey("wolf_512")).toBe(false);
    });

    test("classifies every manifest key into one loaded bundle or the excluded source sheets", () => {
        const { core, idleAtlases, animations, deferredUnitAtlases, excludedFullResolutionUnitAtlases } =
            getSplitBundles();
        const allKeys = Object.keys(images);
        const split = [
            ...Object.keys(core),
            ...Object.keys(idleAtlases),
            ...Object.keys(animations),
            ...Object.keys(deferredUnitAtlases),
            ...Object.keys(excludedFullResolutionUnitAtlases),
        ];

        expect(split.length).toBe(allKeys.length);
        expect(new Set(split).size).toBe(allKeys.length);

        for (const key of Object.keys(idleAtlases)) {
            expect(`${key}: ${isIdleAtlasKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(animations)) {
            expect(`${key}: ${isUnitAnimationAtlasKey(key) && !isIdleAtlasKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(core)) {
            expect(`${key}: ${isUnitAnimationAtlasKey(key)}`).toBe(`${key}: false`);
        }
        for (const key of Object.keys(deferredUnitAtlases)) {
            expect(`${key}: ${isUnitAnimationAtlasKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(excludedFullResolutionUnitAtlases)) {
            expect(`${key}: ${isRedundantFullResolutionUnitAtlasKey(key)}`).toBe(`${key}: true`);
        }
    });

    test("keeps board atlases but never loads full-resolution unit source sheets", () => {
        const { core, animations, excludedFullResolutionUnitAtlases } = getSplitBundles({
            animationsEnabled: true,
        });

        expect(core.lava_center_anim_atlas).toBeDefined();
        expect(animations.wolf_walk_atlas_quarter).toBeDefined();
        expect(excludedFullResolutionUnitAtlases.wolf_walk_atlas).toBeDefined();
        expect(core.wolf_walk_atlas).toBeUndefined();
        expect(animations.wolf_walk_atlas).toBeUndefined();
    });

    test("the idle bundle is present and stays a small fraction of the atlas payload", () => {
        // The CI stub manifest only carries keys the source references LITERALLY (`images.foo`);
        // idle atlas keys are derived (`${unit}_${state}_atlas_quarter`), so under the stub the idle
        // bundle is legitimately empty and this census only means something against real generation.
        const keys = Object.keys(images) as Array<keyof typeof images>;
        const isStubManifest = keys.length > 0 && images[keys[0]].endsWith("#ci-stub");
        if (isStubManifest) return;
        const { idleAtlases, animations } = getSplitBundles({ animationsEnabled: true });
        const idleCount = Object.keys(idleAtlases).length;
        const animationCount = Object.keys(animations).length;
        // Every enabled creature ships an idle or default atlas, so this can never be empty; and if
        // it ever grows to rival the background bundle, the "load the board art first" split has
        // silently stopped doing its job.
        expect(idleCount).toBeGreaterThan(0);
        expect(idleCount).toBeLessThan(animationCount);
    });

    test("defers frozen creature animations while preserving the approved Peasant walk", () => {
        const { idleAtlases, animations, deferredUnitAtlases } = getSplitBundles({ animationsEnabled: false });

        expect(Object.keys(idleAtlases)).toHaveLength(0);
        expect(Object.keys(animations)).toEqual(["peasant_walk_atlas_quarter"]);
        expect(deferredUnitAtlases.wolf_idle_atlas_quarter).toBeDefined();
        expect(deferredUnitAtlases.wolf_attack_atlas_quarter).toBeDefined();
    });
});
