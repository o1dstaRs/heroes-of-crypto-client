import { describe, expect, test } from "bun:test";
import { Assets } from "pixi.js";

import { images } from "../imageAssets";
import {
    getSplitBundles,
    isDeferredEnvironmentAssetKey,
    isDeferredLegacyCreatureAssetKey,
    isDeferredPlacementAssetKey,
    isDeferredReactUiAssetKey,
    isDeferredUnitCardAssetKey,
    isIdleAtlasKey,
    isLazyAbilityAssetKey,
    isLazyBattlefieldCreatureAssetKey,
    isLazyCombatEffectAssetKey,
    isLazyProjectileAssetKey,
    isLazyRosterAssetKey,
    isLazySpellAssetKey,
    isLivePlacementAssetKey,
    isRedundantFullResolutionUnitAtlasKey,
    isProductionOmittedAssetKey,
    isTransientLoadingScreenAssetKey,
    unloadRosterAssets,
} from "./PixiTextureLoader";
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
        const {
            core,
            idleAtlases,
            animations,
            deferredUnitAtlases,
            deferredReactUiAssets,
            deferredEnvironmentAssets,
            deferredPlacementAssets,
            deferredLegacyCreatureAssets,
            deferredUnitCardAssets,
            transientLoadingScreenAssets,
            lazyBattlefieldCreatureAssets,
            lazyCombatEffectAssets,
            lazyProjectileAssets,
            lazyRosterAssets,
            lazyAbilityAssets,
            lazySpellAssets,
            excludedFullResolutionUnitAtlases,
        } = getSplitBundles();
        const allKeys = Object.keys(images);
        const split = [
            ...Object.keys(core),
            ...Object.keys(idleAtlases),
            ...Object.keys(animations),
            ...Object.keys(deferredUnitAtlases),
            ...Object.keys(deferredReactUiAssets),
            ...Object.keys(deferredEnvironmentAssets),
            ...Object.keys(deferredPlacementAssets),
            ...Object.keys(deferredLegacyCreatureAssets),
            ...Object.keys(deferredUnitCardAssets),
            ...Object.keys(transientLoadingScreenAssets),
            ...Object.keys(lazyBattlefieldCreatureAssets),
            ...Object.keys(lazyCombatEffectAssets),
            ...Object.keys(lazyProjectileAssets),
            ...Object.keys(lazyRosterAssets),
            ...Object.keys(lazyAbilityAssets),
            ...Object.keys(lazySpellAssets),
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
        for (const key of Object.keys(deferredReactUiAssets)) {
            expect(`${key}: ${isDeferredReactUiAssetKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(deferredEnvironmentAssets)) {
            expect(`${key}: ${isDeferredEnvironmentAssetKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(deferredPlacementAssets)) {
            expect(`${key}: ${isDeferredPlacementAssetKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(deferredLegacyCreatureAssets)) {
            expect(`${key}: ${isDeferredLegacyCreatureAssetKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(deferredUnitCardAssets)) {
            expect(`${key}: ${isDeferredUnitCardAssetKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(transientLoadingScreenAssets)) {
            expect(`${key}: ${isTransientLoadingScreenAssetKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(lazyBattlefieldCreatureAssets)) {
            expect(`${key}: ${isLazyBattlefieldCreatureAssetKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(lazyCombatEffectAssets)) {
            expect(`${key}: ${isLazyCombatEffectAssetKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(lazyProjectileAssets)) {
            expect(`${key}: ${isLazyProjectileAssetKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(lazyRosterAssets)) {
            expect(`${key}: ${isLazyRosterAssetKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(lazyAbilityAssets)) {
            expect(`${key}: ${isLazyAbilityAssetKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(lazySpellAssets)) {
            expect(`${key}: ${isLazySpellAssetKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(excludedFullResolutionUnitAtlases)) {
            expect(`${key}: ${isRedundantFullResolutionUnitAtlasKey(key)}`).toBe(`${key}: true`);
        }
    });

    test("keeps live board atlases but never loads full-resolution unit source sheets", () => {
        const { core, animations, deferredEnvironmentAssets, excludedFullResolutionUnitAtlases } = getSplitBundles({
            animationsEnabled: true,
        });

        // The current fire-pit still always wins before this legacy lava fallback is consulted.
        expect(deferredEnvironmentAssets.lava_center_anim_atlas).toBeDefined();
        expect(core.lava_center_anim_atlas).toBeUndefined();
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

    test("leaves React-only draft and portrait art out of Pixi's texture cache", () => {
        const { core } = getSplitBundles({ animationsEnabled: false });

        for (const key of [
            "army_icon",
            "board_icon",
            "pick_ban_slash_variant2_atlas",
            "wolf_left_screen_x2",
            "black_dragon_portrait_full",
            "pick_phase_heroic_hearth_tavern_background_v10",
            "pick_phase_floor_fog_atlas",
            "pick_bundle_background_guardians_v1",
            "pick_l2_legacy_beholder_512",
            "fight_results_moonlit_fire_overlay_v9",
            "left_sidebar_arachna_queen",
            "ui_sidebar_bg_left_smoked_bronze_inner_v11",
            "ui_up_next_smoky_chains_bg_wide_73pct_v4",
            "sidebar_overlay",
            "stat_health_gold_v2",
            "stat_ranged_attack_gold_v2",
            "ui_start_button_plate_trimmed",
            "artifact_t1_swift_boots_256",
            "artifact_t2_crown_of_command_256",
            "map_badge_normal_4x4_actual_style_v4",
            "combat_toolbar_ember_sword",
            "damage_analytics_icon",
            "league_demigod_512",
            "wealth_demigod_whale_512",
            "doctrine_spymaster",
            "board_augment_256",
            "movement_augment_256",
            "chaos_512",
            "death_512",
            "flag_green_icon",
            "flag_red_icon",
            "fight_log_scrollbar_thumb_gothic_v1",
            "life_512",
            "might_512",
            "nature_512",
            "order_512",
            "logo_hoc",
            "tr_up",
            "x_mark_2_512",
        ]) {
            expect(isDeferredReactUiAssetKey(key)).toBe(true);
            expect(core[key]).toBeUndefined();
        }

        expect(isDeferredReactUiAssetKey("wolf_final")).toBe(false);
        expect(isDeferredReactUiAssetKey("wolf_pick_sandbox_x2")).toBe(false);
        expect(isDeferredReactUiAssetKey("pick_attack_melee_silver")).toBe(false);
        expect(isDeferredReactUiAssetKey("pick_movement_walk_silver")).toBe(false);
        expect(isDeferredReactUiAssetKey("background_stone_tiles_sinister")).toBe(false);
    });

    test("keeps only live environment variants in core and lets the fire pit load on demand", () => {
        const { core } = getSplitBundles({ animationsEnabled: false });
        const deferred = [
            "fire_pit_variant_1_low_front_fire_overlay_seamless_v2_64_atlas",
            "fire_pit_variant_1_low_front_fire_overlay_seamless_v2_64_atlas_half",
            "fire_pit_high_fire_overlay_smooth_64_atlas",
            "ambient_fire_video_torch_left_64_atlas",
            "background_test_abyss_underlay_v4",
            "background_stone_tiles_sinister_16x16_curbfix_v6",
            "active_turn_blue_fire_atlas",
            "cemetery_obstacles_9x_256_atlas",
            "dungeon_god_rays_v2",
            "dungeon_volumetric_fog_v2",
            "lava_center_anim_atlas",
            "ambient_fire_video_torch_left_natural_v4_64_atlas",
            "ambient_fire_video_torch_right_natural_v4_64_atlas",
            "cemetery_obstacles_9x_256",
            "cemetery_obstacles_9x_256_hp",
            "fire_pit_center_clean_fire_v2_512",
            "fire_pit_grate_foreground_static_v7_512",
            "lava_256",
            "lava_frozen_256",
            "mountain_432_412",
            "water_256",
            "water_dry_256",
        ];

        for (const key of deferred) {
            expect(isDeferredEnvironmentAssetKey(key)).toBe(true);
            expect(core[key]).toBeUndefined();
        }

        expect(isDeferredEnvironmentAssetKey("background_stone_tiles_sinister_16x16_original_restored")).toBe(false);
        expect(core.background_stone_tiles_sinister_16x16_original_restored).toBeDefined();
        expect(isDeferredEnvironmentAssetKey("background_new")).toBe(false);
    });

    test("loads the matching placement carpet/border on demand instead of preloading every size", () => {
        const { core, deferredPlacementAssets } = getSplitBundles({ animationsEnabled: false });

        for (const key of [
            "placement_carpet_green_worn_grid_5col_v9",
            "placement_gold_outer_border_gapped_5col_16row_v19",
            "placement_gold_outer_border_green_gapped_6col_14row_v22",
            "placement_red_flag_folds_v1",
        ]) {
            expect(isDeferredPlacementAssetKey(key)).toBe(true);
            expect(isLivePlacementAssetKey(key)).toBe(false);
            expect(core[key]).toBeUndefined();
        }

        for (const key of [
            "placement_carpet_green_uniform_gold_aaa_3col_v16",
            "placement_carpet_green_uniform_gold_aaa_4col_v16",
            "placement_carpet_green_uniform_gold_aaa_5col_v16",
            "placement_gold_outer_border_green_continuous_3col_14row_v23",
            "placement_gold_outer_border_green_continuous_6col_16row_v23",
        ]) {
            expect(isDeferredPlacementAssetKey(key)).toBe(true);
            expect(isLivePlacementAssetKey(key)).toBe(true);
            expect(isProductionOmittedAssetKey(key)).toBe(false);
            expect(deferredPlacementAssets[key]).toBeDefined();
            expect(core[key]).toBeUndefined();
        }
    });

    test("keeps approved battlefield figures and defers their superseded exports", () => {
        const { core, deferredLegacyCreatureAssets, lazyBattlefieldCreatureAssets } = getSplitBundles({
            animationsEnabled: false,
        });

        for (const key of [
            "zena_final",
            "zena_battlefield_side_right_v3",
            "efreet_battlefield_side_right_v7",
            "thunderbird_portrait_full_v2",
        ]) {
            expect(isDeferredLegacyCreatureAssetKey(key)).toBe(true);
            expect(deferredLegacyCreatureAssets[key]).toBeDefined();
            expect(core[key]).toBeUndefined();
        }

        for (const key of [
            "zena_battlefield_side_right_final_v1",
            "efreet_battlefield_side_right_final_v1",
            "thunderbird_battlefield_side_right_final_v1",
            "efreet_board_128",
            "orc_128",
            "angel_256",
            "phoenix_256",
            "arachna_queen_board_256",
        ]) {
            expect(isDeferredLegacyCreatureAssetKey(key)).toBe(false);
            expect(isLazyBattlefieldCreatureAssetKey(key)).toBe(true);
            expect(lazyBattlefieldCreatureAssets[key]).toBeDefined();
            expect(core[key]).toBeUndefined();
        }
    });

    test("loads large projectile art only when its matching shot is fired", () => {
        const { core, lazyProjectileAssets } = getSplitBundles({ animationsEnabled: false });

        for (const key of [
            "armor_piercing_bolt",
            "orc_throwing_axe",
            "arbalester_cyan_bolt",
            "centaur_spear_variant_4",
            "dryad_thorn_dart",
            "beholder_purple_eye_orb",
            "elf_emerald_arrow",
            "medusa_spectral_serpent",
            "cyclops_heavy_boulder",
            "monk_solar_orb",
            "tsar_cannon_molten_ball",
            "gargantuan_root_boulder",
        ]) {
            expect(isLazyProjectileAssetKey(key)).toBe(true);
            expect(lazyProjectileAssets[key]).toBeDefined();
            expect(core[key]).toBeUndefined();
        }
    });

    test("loads large optional fight art only when its surface first appears", () => {
        const { core, lazyCombatEffectAssets } = getSplitBundles({ animationsEnabled: false });

        for (const key of [
            "book_1024_clean_pages_v1",
            "craft_anvil",
            "craft_hammer",
            "range_target_arrow_v7_gold_wide_crisp",
            "shot_range_corner_aaa_v1",
            "shot_range_corner_aaa_v4_green",
            "shot_range_corner_aaa_v4_red",
            "vfx_dust_smoky_ash_atlas",
        ]) {
            expect(isLazyCombatEffectAssetKey(key)).toBe(true);
            expect(lazyCombatEffectAssets[key]).toBeDefined();
            expect(core[key]).toBeUndefined();
        }
    });

    test("loads passive ability cards only when their Pixi combat effect appears", () => {
        const { core, lazyAbilityAssets } = getSplitBundles({ animationsEnabled: false });

        for (const key of [
            "double_punch_256",
            "fire_breath_256",
            "predatory_assimilation_256",
            "crafted_frozen_sword_256",
        ]) {
            expect(isLazyAbilityAssetKey(key)).toBe(true);
            expect(lazyAbilityAssets[key]).toBeDefined();
            expect(core[key]).toBeUndefined();
        }

        // These abilities are also castable spells and therefore belong to the spell-specific lazy bucket.
        for (const key of ["wild_regeneration_256", "resurrection_256", "water_shield_256"]) {
            expect(isLazyAbilityAssetKey(key)).toBe(false);
            expect(isLazySpellAssetKey(key)).toBe(true);
            expect(lazyAbilityAssets[key]).toBeUndefined();
            expect(core[key]).toBeUndefined();
        }
        expect(Object.keys(lazyAbilityAssets)).toHaveLength(101);
    });

    test("loads spell and status cards only when the current scene requests them", () => {
        const { core, lazySpellAssets } = getSplitBundles({ animationsEnabled: false });

        for (const key of ["morale_256", "wild_regeneration_256", "fire_wall_256", "meteorite_chaos_256_v1"]) {
            expect(isLazySpellAssetKey(key)).toBe(true);
            expect(lazySpellAssets[key]).toBeDefined();
            expect(core[key]).toBeUndefined();
        }
        expect(Object.keys(lazySpellAssets)).toHaveLength(60);
    });

    test("loads sandbox roster art only while the pre-fight overlay exists", () => {
        const { core, lazyRosterAssets } = getSplitBundles({ animationsEnabled: false });

        for (const key of [
            "wolf_pick_sandbox_x2",
            "life_portrait_bg_golden_dawn_four_corner_haze_v1",
            "nature_portrait_bg_tier_1_2",
            "units_overlay_toggle_square_v1",
        ]) {
            expect(isLazyRosterAssetKey(key)).toBe(true);
            expect(lazyRosterAssets[key]).toBeDefined();
            expect(core[key]).toBeUndefined();
        }
    });

    test("coalesces concurrent releases of the same pre-fight texture", async () => {
        const { lazyRosterAssets } = getSplitBundles({ animationsEnabled: false });
        const target = lazyRosterAssets.units_overlay_toggle_square_v1?.src;
        if (!target) return; // The compact CI manifest may omit non-literal generated keys.

        const mutableCache = Assets.cache as unknown as { has: (url: string) => boolean };
        const mutableAssets = Assets as unknown as { unload: (url: string) => Promise<void> };
        const originalHas = mutableCache.has;
        const originalUnload = mutableAssets.unload;
        const unloaded: string[] = [];
        let finishUnload: (() => void) | undefined;

        mutableCache.has = (url) => url === target;
        mutableAssets.unload = async (url) => {
            unloaded.push(url);
            await new Promise<void>((resolve) => {
                finishUnload = resolve;
            });
        };

        try {
            const first = unloadRosterAssets();
            const second = unloadRosterAssets();
            await Promise.resolve();
            expect(unloaded).toEqual([target]);
            finishUnload?.();
            await Promise.all([first, second]);
        } finally {
            mutableCache.has = originalHas;
            mutableAssets.unload = originalUnload;
            finishUnload?.();
        }
    });

    test("keeps unit card portraits out of the permanent board texture cache", () => {
        const { core, deferredUnitCardAssets } = getSplitBundles({ animationsEnabled: false });

        for (const key of [
            "dark_champion_512",
            "faerie_dragon_512",
            "imp_512",
            "peasant_512",
            "phoenix_512",
            "scavenger_512",
            "skeleton_512",
            "thief_model_full",
            "thunderbird_512_v2",
            "unknown_creature_512",
            "zombie_512",
        ]) {
            expect(isDeferredUnitCardAssetKey(key)).toBe(true);
            expect(deferredUnitCardAssets[key]).toBeDefined();
            expect(core[key]).toBeUndefined();
        }

        expect(isDeferredUnitCardAssetKey("fire_pit_center_512")).toBe(false);
    });

    test("does not retain loading-screen-only art for the lifetime of the fight", () => {
        const { core, transientLoadingScreenAssets } = getSplitBundles({ animationsEnabled: false });

        for (const key of [
            "ambient_fire_left_brazier_atlas",
            "loading_screen_dragon_medallion",
            "loading_screen_forging_base",
            "loading_screen_forging_exact_overlay",
            "loading_screen_forging_lava_strip",
        ]) {
            expect(isTransientLoadingScreenAssetKey(key)).toBe(true);
            expect(transientLoadingScreenAssets[key]).toBeDefined();
            expect(core[key]).toBeUndefined();
        }

        // The battlefield reuses the furnace atlas, so it remains a core texture.
        expect(isTransientLoadingScreenAssetKey("ambient_fire_left_furnace_atlas")).toBe(false);
        expect(core.ambient_fire_left_furnace_atlas).toBeDefined();
    });

    test("omits only authoring and superseded exports from production", () => {
        for (const key of [
            "wolf_walk_atlas",
            "placement_carpet_green_worn_grid_5col_v9",
            "zena_battlefield_side_right_v3",
        ]) {
            expect(isProductionOmittedAssetKey(key)).toBe(true);
        }

        for (const key of [
            "wolf_walk_atlas_quarter",
            "zena_battlefield_side_right_final_v1",
            "fire_pit_variant_1_low_front_fire_overlay_seamless_v2_64_atlas_half",
            "pick_ban_slash_variant2_atlas",
            "wolf_pick_sandbox_x2",
            "placement_carpet_green_uniform_gold_aaa_3col_v16",
            "ambient_fire_video_torch_left_natural_v4_64_atlas",
        ]) {
            expect(isProductionOmittedAssetKey(key)).toBe(false);
        }
    });

    test("loads effect icons and spellbook furniture only when requested", () => {
        const { core, lazySpellAssets } = getSplitBundles({ animationsEnabled: false });

        for (const key of [
            "break_256",
            "deep_wounds_256",
            "freeze_256",
            "poison_256",
            "spell_cell_260",
            "spell_cast_wax_seal_blank_v1",
            "spell_inner_frame_linework_v2",
            "spell_stack_fill_green_variant2",
            "spell_stack_fill_red_variant2",
            "spell_stack_rail_variant2",
        ]) {
            expect(isLazySpellAssetKey(key)).toBe(true);
            expect(lazySpellAssets[key]).toBeDefined();
            expect(core[key]).toBeUndefined();
        }
    });
});
