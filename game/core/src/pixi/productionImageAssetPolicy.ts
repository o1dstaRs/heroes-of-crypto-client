import { isDeferredEnvironmentAssetKey } from "./imageAssetTiers";
import { CREATURE_SPRITE_ANIMATION_SETTINGS, shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import { isUnitAnimationAtlasKey } from "./unitAtlasKeys";

/**
 * Environment atlases that production requests lazily. Other deferred environment files are editor
 * experiments or superseded variants: keeping URL entries for them makes Vite copy every multi-megabyte
 * source into a release even though no production path can request one.
 */
const LIVE_PRODUCTION_ENVIRONMENT_ASSETS = new Set([
    "lava_center_anim_atlas",
    "fire_pit_center_clean_fire_v2_512",
    "fire_pit_grate_foreground_static_v7_512",
    "fire_pit_variant_1_low_front_fire_overlay_seamless_v2_64_atlas_half",
    "ambient_fire_video_torch_left_natural_v4_64_atlas",
    "ambient_fire_video_torch_right_natural_v4_64_atlas",
]);

const UNUSED_PRODUCTION_LEGACY_UI_ASSETS = new Set([
    "combat_toolbar_button",
    "combat_toolbar_hourglass",
    "combat_toolbar_panel",
    "deployment_perimeter_spectral_fire",
    "deployment_perimeter_spectral_fire_red",
    "book_1024",
    "book_1024_pre",
    "book_1024_previous",
    "ui_banner_green_soft_wide",
    "ui_banner_red_soft_wide",
    "ui_more_time_button_forged_exact",
    "ui_selected_creature_frame_1_9slice_v1",
    "ui_sidebar_bg_left_emberstone",
    "ui_sidebar_bg_left_emberstone_mirrored",
    "ui_sidebar_bg_right_runic",
    "ui_start_button_plate_gray_50",
    "stat_shot_range_gold_v2",
]);

/** Exact orphaned/source exports with no selector or direct runtime consumer. */
const UNUSED_PRODUCTION_ASSETS = new Set([
    "banner_green",
    "banner_border_round_c",
    "banner_red",
    "banner_riveted_ornaments",
    "deployment_frame_reference_green",
    "deployment_frame_reference_red",
    "deployment_grid_glow_master_16x6",
    "fight_log_scrollbar_rail_gothic_v1",
    "nature_mage_male_1_128",
    "nature_mage_male_1_512",
    "nature_mage_male_2_128",
    "nature_mage_male_2_512",
    "nature_mage_male_3_128",
    "nature_mage_male_3_512",
    "orc_model_full",
    "perk_blind_fury",
    "perk_scout",
    "perk_spymaster",
    "spell_cast_scroll_plain_v1",
    "spell_cast_scroll_variant2",
    "spell_corner_chaos_a",
    "spell_corner_life_b",
    "spell_corner_nature_b",
    "spider_512",
    "tombstone_tiles_256_atlas",
    "x_mark_1_512",
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
    // Current creature-card environments.
    "chaos_portrait_bg_obsidian_fissure_corner_fire_v1",
    "life_portrait_bg_golden_dawn_four_corner_haze_v1",
    "might_portrait_bg_blood_claw_strong_red_corners_v1",
    "nature_portrait_bg_xray_leaf_corner_glow_v2_soft",
    // Current map-selection thumbnails.
    "map_badge_barrels_frameless_v2",
    "map_badge_lava_frameless_v2",
    "map_badge_normal_4x4_actual_style_v4",
]);

const RETIRED_VERSIONED_UI_PREFIXES = [
    "fight_results_",
    "pick_phase_",
    "range_target_",
    "shot_range_",
    "shot_trajectory_",
    "ui_social_",
    "ui_up_next_",
    "chaos_portrait_bg_",
    "life_portrait_bg_",
    "might_portrait_bg_",
    "nature_portrait_bg_",
    "map_badge_",
];

// Creature animation is an explicit compile-time art-direction switch. While it is off, the battlefield
// resolves approved static cutouts and the loader permits only Peasant's separately approved walk. Orc's
// idle quarter-sheet remains live in the React sidebar (Orc is the one legacy portrait that still uses it).
const LIVE_UNIT_ATLASES_WHILE_ANIMATION_IS_DISABLED = new Set(["orc_idle_atlas_quarter", "peasant_walk_atlas_quarter"]);

/** Animation sheets that no compiled production path can request under the current art-direction switch. */
export function isProductionOmittedDisabledUnitAnimationAssetKey(key: string): boolean {
    if (CREATURE_SPRITE_ANIMATION_SETTINGS.enabled || !isUnitAnimationAtlasKey(key)) return false;
    return !shouldPreloadUnitAnimationAtlas(key, false) && !LIVE_UNIT_ATLASES_WHILE_ANIMATION_IS_DISABLED.has(key);
}

export function isProductionOmittedEnvironmentAssetKey(key: string): boolean {
    if (key.startsWith("fire_pit_")) return !LIVE_PRODUCTION_ENVIRONMENT_ASSETS.has(key);
    return isDeferredEnvironmentAssetKey(key) && !LIVE_PRODUCTION_ENVIRONMENT_ASSETS.has(key);
}

export function isProductionOmittedUnreferencedAssetKey(key: string): boolean {
    return UNUSED_PRODUCTION_ASSETS.has(key);
}

/** Retired UI exports with no runtime consumer; their current replacements use distinct keys. */
export function isProductionOmittedLegacyUiAssetKey(key: string): boolean {
    if (UNUSED_PRODUCTION_LEGACY_UI_ASSETS.has(key)) return true;
    // The old full-body exports were superseded by the approved `*_pick_sandbox_x2` portraits. The
    // current fullBodyCreatureImage() selector deliberately aliases that same approved source, so no
    // live surface can request an unversioned `*_portrait_full` file anymore. Keep those authoring
    // references in Drive without copying ~20 MiB of compressed (and much more decoded) art into each
    // release.
    if (key.endsWith("_portrait_full")) return true;
    // These named UI families were superseded by the generated `*_left_screen_x2` portraits or other
    // current replacements. They remain in Drive for comparison/editing but have no production selector.
    if (
        key.startsWith("left_sidebar_") ||
        key.startsWith("pick_l2_legacy_") ||
        key.startsWith("pick_bundle_") ||
        key.startsWith("sidebar_") ||
        /^stat_.*_(?:gold_v1|silver_v1)$/.test(key)
    ) {
        return true;
    }
    return (
        RETIRED_VERSIONED_UI_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
        !LIVE_PRODUCTION_VERSIONED_UI_ASSETS.has(key)
    );
}
