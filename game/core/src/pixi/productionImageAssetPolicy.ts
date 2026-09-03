import { isDeferredEnvironmentAssetKey } from "./imageAssetTiers";

/**
 * Environment atlases that production requests lazily. Other deferred environment files are editor
 * experiments or superseded variants: keeping URL entries for them makes Vite copy every multi-megabyte
 * source into a release even though no production path can request one.
 */
const LIVE_PRODUCTION_ENVIRONMENT_ASSETS = new Set([
    "lava_center_anim_atlas",
    "fire_pit_variant_1_low_front_fire_overlay_seamless_v2_64_atlas_half",
    "ambient_fire_video_torch_left_natural_v4_64_atlas",
    "ambient_fire_video_torch_right_natural_v4_64_atlas",
]);

const UNUSED_PRODUCTION_LEGACY_UI_ASSETS = new Set([
    "book_1024",
    "book_1024_pre",
    "book_1024_previous",
    "ui_banner_green_soft_wide",
    "ui_banner_red_soft_wide",
]);

const LIVE_PRODUCTION_VERSIONED_UI_ASSETS = new Set([
    // Ranked/sandbox battle results.
    "fight_results_burnished_bronze_panel_background_v1",
    "fight_results_moonlit_castle_background",
    "fight_results_moonlit_fire_overlay_v9",
    "fight_results_trophy_v1",
    // Current draft room plus the two portrait-editor backdrops.
    "pick_phase_ember_background_v2",
    "pick_phase_heroic_hearth_tavern_background_v10",
    "pick_phase_obsidian_background",
    "pick_phase_watched_eye",
    // Current battlefield range/trajectory treatment.
    "range_target_arrow_v7_gold_wide_crisp",
    "shot_range_corner_aaa_v1",
    "shot_range_corner_aaa_v4_green",
    "shot_range_corner_aaa_v4_red",
    "shot_trajectory_hammered_bronze_casing_sprite_v4",
    // Current social dock and both responsive Up Next surfaces.
    "ui_social_friends_redrawn_complete_frame_v2",
    "ui_social_notifications_redrawn_complete_frame_v2",
    "ui_social_predictions_redrawn_complete_frame_v2",
    "ui_social_system_menu_redrawn_complete_frame_v3",
    "ui_up_next_smoky_chains_bg_85pct_v5",
    "ui_up_next_smoky_chains_bg_wide_73pct_v4",
]);

const RETIRED_VERSIONED_UI_PREFIXES = [
    "fight_results_",
    "pick_phase_",
    "range_target_",
    "shot_range_",
    "shot_trajectory_",
    "ui_social_",
    "ui_up_next_",
];

export function isProductionOmittedEnvironmentAssetKey(key: string): boolean {
    return isDeferredEnvironmentAssetKey(key) && !LIVE_PRODUCTION_ENVIRONMENT_ASSETS.has(key);
}

/** Retired UI exports with no runtime consumer; their current replacements use distinct keys. */
export function isProductionOmittedLegacyUiAssetKey(key: string): boolean {
    if (UNUSED_PRODUCTION_LEGACY_UI_ASSETS.has(key)) return true;
    // Both families were superseded by the generated `*_left_screen_x2` portraits used by every
    // creature surface. They remain in Drive for comparison/editing but have no production selector.
    if (key.startsWith("left_sidebar_") || key.startsWith("pick_l2_legacy_") || key.startsWith("pick_bundle_")) {
        return true;
    }
    return (
        RETIRED_VERSIONED_UI_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
        !LIVE_PRODUCTION_VERSIONED_UI_ASSETS.has(key)
    );
}
