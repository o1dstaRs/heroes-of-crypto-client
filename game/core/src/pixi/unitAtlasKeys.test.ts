import { describe, expect, test } from "bun:test";

import { animationAtlases } from "../generated/animation_atlases";
import { buildUnitAnimationAtlasKeyClassifier, isUnitAnimationAtlasKey } from "./unitAtlasKeys";

/**
 * Pins the core-vs-supplementary texture split: every UNIT atlas (all size variants) is
 * supplementary; terrain atlases and ordinary images are core. The split feeds
 * PixiTextureLoader.getSplitBundles, so a wrong answer here either puts ~89 MB of unit atlases back
 * behind the loading screen or starves the board of terrain it draws at first paint.
 */
describe("unit animation atlas key split", () => {
    test("unit/state keys map to supplementary in all three size variants without generated art", () => {
        const classify = buildUnitAnimationAtlasKeyClassifier({
            Abomination: { attack: {} },
            "Wolf Rider": { idle: {}, walk: {} },
        });

        for (const key of ["abomination_attack_atlas", "wolf_rider_idle_atlas", "wolf_rider_walk_atlas"]) {
            expect(classify(key)).toBe(true);
            expect(classify(`${key}_half`)).toBe(true);
            expect(classify(`${key}_quarter`)).toBe(true);
        }
    });

    test("every generated creature state maps to supplementary in all three size variants", () => {
        const units = Object.entries(animationAtlases);
        for (const [unitName, states] of units) {
            if (unitName === "Pick Ban Slash") continue;
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

    test("keeps the generated pick/ban slash classified as UI instead of a unit source sheet", () => {
        expect(isUnitAnimationAtlasKey("pick_ban_slash_variant2_atlas")).toBe(false);
    });

    test("hand-authored creature strips stay with generated unit atlases", () => {
        expect(isUnitAnimationAtlasKey("orc_idle_axe_twirl_atlas_quarter")).toBe(true);
        expect(isUnitAnimationAtlasKey("thief_idle_battle_cry_atlas_quarter")).toBe(true);
        expect(isUnitAnimationAtlasKey("ash_moth_walk_left_atlas")).toBe(true);
        expect(isUnitAnimationAtlasKey("ash_moth_walk_left_atlas_quarter")).toBe(true);
    });

    test("ordinary image keys stay core", () => {
        expect(isUnitAnimationAtlasKey("abomination_128")).toBe(false);
        expect(isUnitAnimationAtlasKey("ui_banner_green_soft_wide")).toBe(false);
        expect(isUnitAnimationAtlasKey("frame_black_512")).toBe(false);
    });
});
