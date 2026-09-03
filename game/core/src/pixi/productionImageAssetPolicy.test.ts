import { describe, expect, test } from "bun:test";
import {
    isProductionOmittedEnvironmentAssetKey,
    isProductionOmittedLegacyUiAssetKey,
} from "./productionImageAssetPolicy";

describe("production environment image policy", () => {
    test("keeps every environment atlas used by the live dungeon", () => {
        for (const key of [
            "lava_center_anim_atlas",
            "fire_pit_variant_1_low_front_fire_overlay_seamless_v2_64_atlas_half",
            "ambient_fire_video_torch_left_natural_v4_64_atlas",
            "ambient_fire_video_torch_right_natural_v4_64_atlas",
        ]) {
            expect(isProductionOmittedEnvironmentAssetKey(key)).toBe(false);
        }
    });

    test("omits superseded and disabled environment experiments", () => {
        for (const key of [
            "fire_pit_unified_front_wide_48_atlas",
            "fire_pit_high_fire_overlay_smooth_64_atlas",
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
        ]) {
            expect(isProductionOmittedLegacyUiAssetKey(key)).toBe(true);
        }
        for (const key of [
            "book_1024_clean_pages_v1",
            "ui_close_button_square_gothic_frame_v1",
            "ui_container_frame_1_9slice",
            "ui_container_frame_2_9slice",
            "ui_outer_frame_3_9slice",
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
        ]) {
            expect(isProductionOmittedLegacyUiAssetKey(key)).toBe(true);
        }
    });
});
