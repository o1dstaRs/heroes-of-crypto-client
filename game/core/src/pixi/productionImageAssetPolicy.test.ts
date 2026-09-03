import { describe, expect, test } from "bun:test";
import {
    isProductionOmittedDisabledUnitAnimationAssetKey,
    isProductionOmittedEnvironmentAssetKey,
    isProductionOmittedLegacyUiAssetKey,
    isProductionOmittedUnreferencedAssetKey,
} from "./productionImageAssetPolicy";

describe("production creature animation policy", () => {
    test("omits disabled creature sheets while keeping the two live exceptions", () => {
        expect(isProductionOmittedDisabledUnitAnimationAssetKey("wolf_idle_atlas_quarter")).toBe(true);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey("behemoth_default_atlas_half")).toBe(true);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey("orc_attack_atlas_quarter")).toBe(true);

        expect(isProductionOmittedDisabledUnitAnimationAssetKey("peasant_walk_atlas_quarter")).toBe(false);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey("orc_idle_atlas_quarter")).toBe(false);
    });

    test("does not classify terrain and UI atlases as creature animation", () => {
        expect(isProductionOmittedDisabledUnitAnimationAssetKey("lava_center_anim_atlas")).toBe(false);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey("pick_ban_slash_variant2_atlas")).toBe(false);
    });
});

describe("production environment image policy", () => {
    test("keeps every environment atlas used by the live dungeon", () => {
        for (const key of [
            "cemetery_obstacles_9x_256",
            "cemetery_obstacles_9x_256_hp",
            "lava_center_anim_atlas",
            "fire_pit_center_clean_fire_v2_512",
            "fire_pit_grate_foreground_static_v7_512",
            "fire_pit_variant_1_low_front_fire_overlay_seamless_v2_64_atlas_half",
            "ambient_fire_video_torch_left_natural_v4_64_atlas",
            "ambient_fire_video_torch_right_natural_v4_64_atlas",
            "lava_256",
            "lava_frozen_256",
            "mountain_432_412",
            "water_256",
            "water_dry_256",
        ]) {
            expect(isProductionOmittedEnvironmentAssetKey(key)).toBe(false);
        }
    });

    test("omits superseded and disabled environment experiments", () => {
        for (const key of [
            "fire_pit_unified_front_wide_48_atlas",
            "fire_pit_high_fire_overlay_smooth_64_atlas",
            "fire_pit_dark_bowl_v1_512",
            "fire_pit_extinguished_bronze_curb_v4_512",
            "fire_pit_grate_overlay_v1_512",
            "ambient_fire_video_torch_left_seamless_v2_64_atlas",
            "background_stone_tiles_sinister_16x16_curbfix_v6",
            "background_test_abyss_underlay_v4",
            "active_turn_blue_fire_atlas",
            "cemetery_obstacles_9x_256_atlas",
            "dungeon_god_rays_v2",
            "dungeon_volumetric_fog_v2",
        ]) {
            expect(isProductionOmittedEnvironmentAssetKey(key)).toBe(true);
        }
    });

    test("does not classify unrelated images", () => {
        expect(isProductionOmittedEnvironmentAssetKey("background_new")).toBe(false);
        expect(isProductionOmittedEnvironmentAssetKey("wolf_512")).toBe(false);
        expect(isProductionOmittedEnvironmentAssetKey("ui_banner_green_soft_wide")).toBe(false);
    });

    test("omits only replaced legacy UI exports", () => {
        for (const key of [
            "book_1024",
            "book_1024_pre",
            "book_1024_previous",
            "ui_banner_green_soft_wide",
            "ui_banner_red_soft_wide",
            "ui_sidebar_bg_left_emberstone_mirrored",
            "ui_start_button_plate_gray_50",
            "deployment_perimeter_spectral_fire",
            "combat_toolbar_button",
            "stat_health_gold_v1",
            "stat_health_silver_v1",
            "black_dragon_portrait_full",
            "magic_dragon_portrait_full",
        ]) {
            expect(isProductionOmittedLegacyUiAssetKey(key)).toBe(true);
        }
        for (const key of [
            "book_1024_clean_pages_v1",
            "ui_close_button_square_gothic_frame_v1",
            "ui_container_frame_1_9slice",
            "ui_container_frame_2_9slice",
            "ui_outer_frame_3_9slice",
            "ui_start_button_plate_trimmed",
            "combat_toolbar_ember_sword",
            "stat_health_gold_v2",
            "black_dragon_pick_sandbox_x2",
            "black_dragon_left_screen_x2",
        ]) {
            expect(isProductionOmittedLegacyUiAssetKey(key)).toBe(false);
        }
    });

    test("keeps the exact UI versions used by current player surfaces", () => {
        for (const key of [
            "fight_results_moonlit_castle_background",
            "fight_results_moonlit_fire_overlay_v9",
            "fight_results_burnished_bronze_panel_background_v1",
            "fight_results_trophy_v1",
            "pick_phase_heroic_hearth_tavern_background_v10",
            "pick_phase_ember_background_v2",
            "pick_phase_obsidian_background",
            "pick_phase_watched_eye",
            "range_target_arrow_v7_gold_wide_crisp",
            "shot_range_corner_aaa_v1",
            "shot_range_corner_aaa_v4_green",
            "shot_range_corner_aaa_v4_red",
            "shot_trajectory_hammered_bronze_casing_sprite_v4",
            "ui_social_system_menu_redrawn_complete_frame_v3",
            "ui_social_predictions_redrawn_complete_frame_v2",
            "ui_social_friends_redrawn_complete_frame_v2",
            "ui_social_notifications_redrawn_complete_frame_v2",
            "ui_up_next_smoky_chains_bg_85pct_v5",
            "ui_up_next_smoky_chains_bg_wide_73pct_v4",
            "life_portrait_bg_golden_dawn_four_corner_haze_v1",
            "nature_portrait_bg_xray_leaf_corner_glow_v2_soft",
            "chaos_portrait_bg_obsidian_fissure_corner_fire_v1",
            "might_portrait_bg_blood_claw_strong_red_corners_v1",
            "map_badge_normal_4x4_actual_style_v4",
            "map_badge_lava_frameless_v2",
            "map_badge_barrels_frameless_v2",
        ]) {
            expect(isProductionOmittedLegacyUiAssetKey(key)).toBe(false);
        }
    });

    test("omits superseded iterations from versioned player-facing families", () => {
        for (const key of [
            "fight_results_chart_frame_v4",
            "fight_results_moonlit_fire_overlay_v8",
            "pick_phase_heroic_hearth_tavern_background_v9",
            "pick_phase_floor_fog_atlas",
            "pick_bundle_background_guardians_v1",
            "pick_l2_legacy_beholder_512",
            "left_sidebar_wyvern_legacy_full_hd",
            "range_target_arrow_v6_gold_hq",
            "shot_range_corner_aaa_v3_green",
            "shot_trajectory_dark_iron_bands_casing_sprite_v5",
            "ui_social_friends_forged_bronze_v1",
            "ui_up_next_smoky_chains_bg_wide_80pct_v3",
            "ui_up_next_turn_order_bottom_chain_redrawn_crisp_v6",
            "life_portrait_bg_crowned_shield_v1",
            "nature_portrait_bg_claw_scratch_v1",
            "chaos_portrait_bg_obsidian_fissure_v1",
            "might_portrait_bg_shattered_fortress_v1",
            "map_badge_normal_medallion_v1",
            "map_badge_lava_medallion_v1",
        ]) {
            expect(isProductionOmittedLegacyUiAssetKey(key)).toBe(true);
        }
    });
});

describe("production unreferenced image policy", () => {
    test("omits exact orphaned exports while preserving their live replacements", () => {
        for (const key of [
            "ambient_fire_right_brazier_atlas",
            "banner_green",
            "banner_border_round_c",
            "banner_red",
            "banner_riveted_ornaments",
            "deployment_frame_reference_green",
            "deployment_frame_reference_red",
            "deployment_grid_glow_master_16x6",
            "combat_damage_magic_icon_v1",
            "combat_damage_melee_icon_v1",
            "combat_damage_ranged_icon_v1",
            "combat_heart_arrow_icon_v1",
            "combat_heart_icon_v1",
            "fight_log_scrollbar_rail_gothic_v1",
            "healer_512_head_turn_v2",
            "nature_mage_male_1_128",
            "nature_mage_male_1_512",
            "nature_mage_male_2_128",
            "nature_mage_male_2_512",
            "nature_mage_male_3_128",
            "nature_mage_male_3_512",
            "orc_model_full",
            "panel_toggle_medallion",
            "perk_blind_fury",
            "perk_scout",
            "perk_spymaster",
            "spell_cast_scroll_plain_v1",
            "spell_cast_scroll_variant2",
            "spell_corner_chaos_a",
            "spell_corner_life_b",
            "spell_corner_nature_b",
            "spider_512",
            "stun_status_gold",
            "tombstone_tiles_256_atlas",
            "x_mark_1_512",
        ]) {
            expect(isProductionOmittedUnreferencedAssetKey(key)).toBe(true);
        }

        for (const key of [
            "combat_kills_skull_icon_v1",
            "combat_range_full_arrow_icon_v1",
            "orc_128",
            "orc_512",
            "orc_battlefield_side_right_final_v1",
            "thief_model_full",
            "cemetery_obstacles_9x_256",
            "cemetery_obstacles_9x_256_hp",
            "fight_log_scrollbar_thumb_gothic_v1",
            "stop",
            "units_overlay_toggle_square_v1",
            "x_mark_2_512",
        ]) {
            expect(isProductionOmittedUnreferencedAssetKey(key)).toBe(false);
        }
    });
});
