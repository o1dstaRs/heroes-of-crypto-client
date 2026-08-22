import { describe, expect, test } from "bun:test";

import { animationAtlases } from "../generated/animation_atlases";
import { isUnitAnimationAtlasKey } from "./unitAtlasKeys";

/**
 * Pins the core-vs-supplementary texture split: every UNIT atlas (all size variants) is
 * supplementary; terrain atlases and ordinary images are core. The split feeds
 * PixiTextureLoader.getSplitBundles, so a wrong answer here either puts ~89 MB of unit atlases back
 * behind the loading screen or starves the board of terrain it draws at first paint.
 */
describe("unit animation atlas key split", () => {
    test("every generated unit/state maps to supplementary in all three size variants", () => {
        const units = Object.entries(animationAtlases);
        expect(units.length).toBeGreaterThan(0);
        for (const [unitName, states] of units) {
            const base = unitName.toLowerCase().replace(/\s+/g, "_");
            for (const state of Object.keys(states)) {
                const key = `${base}_${state.toLowerCase()}_atlas`;
                expect(isUnitAnimationAtlasKey(key)).toBe(true);
                expect(isUnitAnimationAtlasKey(`${key}_half`)).toBe(true);
                expect(isUnitAnimationAtlasKey(`${key}_quarter`)).toBe(true);
            }
        }
    });

    test("terrain atlases the board draws at first paint stay core", () => {
        expect(isUnitAnimationAtlasKey("lava_center_anim_atlas")).toBe(false);
        expect(isUnitAnimationAtlasKey("tombstone_tiles_256_atlas")).toBe(false);
    });

    test("ordinary image keys stay core", () => {
        expect(isUnitAnimationAtlasKey("abomination_128")).toBe(false);
        expect(isUnitAnimationAtlasKey("ui_banner_green_soft_wide")).toBe(false);
        expect(isUnitAnimationAtlasKey("frame_black_512")).toBe(false);
    });
});
