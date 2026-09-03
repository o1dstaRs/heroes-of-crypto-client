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

export function isProductionOmittedEnvironmentAssetKey(key: string): boolean {
    return isDeferredEnvironmentAssetKey(key) && !LIVE_PRODUCTION_ENVIRONMENT_ASSETS.has(key);
}

/** Retired UI exports with no runtime consumer; their current replacements use distinct keys. */
export function isProductionOmittedLegacyUiAssetKey(key: string): boolean {
    return UNUSED_PRODUCTION_LEGACY_UI_ASSETS.has(key);
}
