import { describe, expect, test } from "bun:test";

import { animationAtlases } from "../generated/animation_atlases";
import imageKeys from "../generated/image_keys.json";
import {
    isDeferredReactUiAssetKey,
    isLazyCombatEffectAssetKey,
    isLazyProjectileAssetKey,
    isProductionOmittedAssetKey,
} from "./imageAssetTiers";
import {
    isProductionOmittedDisabledUnitAnimationAssetKey,
    isProductionOmittedEnvironmentAssetKey,
    isProductionOmittedLegacyUiAssetKey,
    isProductionOmittedUnreferencedAssetKey,
} from "./productionImageAssetPolicy";
import { buildUnitAnimationAtlasKeyClassifier, isUnitAnimationAtlasKey } from "./unitAtlasKeys";

const omitted = (key: string): boolean =>
    [
        isProductionOmittedAssetKey,
        isProductionOmittedDisabledUnitAnimationAssetKey,
        isProductionOmittedEnvironmentAssetKey,
        isProductionOmittedLegacyUiAssetKey,
        isProductionOmittedUnreferencedAssetKey,
    ].some((policy) => policy(key));

const liveEffects = [
    "vfx_champion_arrow_aura_atlas",
    "vfx_champion_crusade_pop_atlas",
    "vfx_common_absorb_pop_atlas",
    "vfx_common_heal_pop_atlas",
    "vfx_common_lucky_pop_atlas",
    "vfx_common_miss_pop_atlas",
    "vfx_common_resist_pop_atlas",
    "vfx_made_of_fire_pop_atlas",
    "vfx_ogre_magic_mirror_pop_atlas",
    "vfx_ogre_riot_pop_atlas",
    "vfx_tsar_cannon_flight_v21_atlas",
    "vfx_tsar_cannon_impact_v19_atlas",
];

describe("production spell targeting and combat effects", () => {
    test.each(liveEffects)("ships %s without preloading it as a creature animation", (key) => {
        expect(imageKeys).toContain(key);
        for (const variant of imageKeys.filter((candidate) => candidate === key || candidate.startsWith(`${key}_`))) {
            expect(omitted(variant), variant).toBe(false);
            expect(isUnitAnimationAtlasKey(variant), variant).toBe(false);
            expect(isLazyCombatEffectAssetKey(variant) || isLazyProjectileAssetKey(variant), variant).toBe(true);
        }
    });

    test("keeps retired Unyielding Power sheets and the inactive Thunderbird sprite alternative out of production", () => {
        for (const key of [
            "vfx_unyielding_power_long_atlas",
            "vfx_unyielding_power_short_atlas",
            "vfx_thunderbird_chain_arc_atlas",
            "vfx_thunderbird_chain_impact_atlas",
        ]) {
            expect(omitted(key), key).toBe(true);
            expect(omitted(`${key}_quarter`), key).toBe(true);
        }
    });

    test("keeps the directed magic aim atlas in the production catalog", () => {
        const key = "magic_aim_dual_helix_default_atlas";
        expect(animationAtlases["Magic Aim Dual Helix"].default.frameCount).toBe(16);
        expect(imageKeys).toContain(key);
        expect(isUnitAnimationAtlasKey(key)).toBe(false);
        expect(omitted(key)).toBe(false);
    });

    test("leaves Peasant's portrait owned by the React sidebar", () => {
        const key = "peasant_left_screen_idle_atlas";
        expect(isUnitAnimationAtlasKey(key)).toBe(false);
        expect(isDeferredReactUiAssetKey(key)).toBe(true);
        expect(omitted(key)).toBe(false);
    });

    test("classifies new effect and environment families independently of creature animation", () => {
        const classify = buildUnitAnimationAtlasKeyClassifier({
            "Vfx Future Spell": { pop: {} },
            "Fire Pit Future": { loop: {} },
            "Lava Chasm Future": { loop: {} },
            "Magic Aim Dual Helix": { default: {} },
            "Peasant Left Screen": { idle: {} },
            "Wandering Mage": { cast: {} },
        });
        for (const key of [
            "vfx_future_spell_pop_atlas",
            "fire_pit_future_loop_atlas",
            "lava_chasm_future_loop_atlas",
            "magic_aim_dual_helix_default_atlas",
            "peasant_left_screen_idle_atlas",
        ]) {
            for (const suffix of ["", "_half", "_quarter"]) expect(classify(`${key}${suffix}`)).toBe(false);
        }
        expect(classify("wandering_mage_cast_atlas")).toBe(true);
    });
});
