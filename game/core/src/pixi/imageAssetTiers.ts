import { isUnitAnimationAtlasKey, isUnitCardImageKey } from "./unitAtlasKeys";

// Keep asset routing free of Pixi imports so non-renderer surfaces (notably the ranked draft) can
// reuse the exact runtime split without pulling Pixi into their entry bundle.

export function isIdleAtlasKey(key: string): boolean {
    return (
        isUnitAnimationAtlasKey(key) &&
        (key.includes("_idle") || key.includes("_default")) &&
        (key.endsWith("_atlas_quarter") || key.endsWith("_atlas_half"))
    );
}

export function isRedundantFullResolutionUnitAtlasKey(key: string): boolean {
    return isUnitAnimationAtlasKey(key) && key.endsWith("_atlas");
}

const DEFERRED_REACT_OR_LEGACY_UI_ASSETS = new Set([
    "book_1024",
    "book_1024_pre",
    "book_1024_previous",
    "ui_banner_green_soft_wide",
    "ui_banner_red_soft_wide",
    "ui_close_button_square_gothic_frame_v1",
    "ui_container_frame_1_9slice",
    "ui_container_frame_2_9slice",
    "ui_outer_frame_3_9slice",
]);

export function isDeferredReactUiAssetKey(key: string): boolean {
    if (DEFERRED_REACT_OR_LEGACY_UI_ASSETS.has(key)) return true;
    return (
        key.startsWith("pick_phase_") ||
        key.startsWith("pick_bundle_") ||
        key.startsWith("pick_l2_legacy_") ||
        key.startsWith("fight_results_") ||
        key.startsWith("left_sidebar_") ||
        key.startsWith("ui_sidebar_") ||
        key.startsWith("ui_up_next_") ||
        key.startsWith("sidebar_") ||
        key.endsWith("_left_screen_x2") ||
        key.endsWith("_portrait_full")
    );
}

const TRANSIENT_LOADING_SCREEN_ASSETS = new Set([
    "ambient_fire_left_brazier_atlas",
    "loading_screen_dragon_medallion",
    "loading_screen_forging_base",
    "loading_screen_forging_exact_overlay",
    "loading_screen_forging_lava_strip",
]);

/** Assets owned only by the blocking loading screen and released before the game scene starts. */
export function isTransientLoadingScreenAssetKey(key: string): boolean {
    return TRANSIENT_LOADING_SCREEN_ASSETS.has(key);
}

const LIVE_ENVIRONMENT_ASSETS = new Set([
    "ambient_fire_video_torch_left_natural_v4_64_atlas",
    "ambient_fire_video_torch_right_natural_v4_64_atlas",
    "background_stone_tiles_sinister_16x16_original_restored",
]);

export function isDeferredEnvironmentAssetKey(key: string): boolean {
    if (LIVE_ENVIRONMENT_ASSETS.has(key)) return false;
    if (
        key === "active_turn_blue_fire_atlas" ||
        key === "cemetery_obstacles_9x_256_atlas" ||
        key === "dungeon_god_rays_v2" ||
        key === "dungeon_volumetric_fog_v2" ||
        key === "lava_center_anim_atlas"
    ) {
        return true;
    }
    if (key.startsWith("fire_pit_") && (key.endsWith("_atlas") || key.endsWith("_atlas_half"))) return true;
    if (key.startsWith("ambient_fire_video_torch_") && key.endsWith("_atlas")) return true;
    if (key.startsWith("background_test_abyss_")) return true;
    return key.startsWith("background_stone_tiles") && key !== "background_new";
}

const LIVE_PLACEMENT_CARPET = /^placement_carpet_green_uniform_gold_aaa_[345]col_v16$/;
const LIVE_PLACEMENT_BORDER = /^placement_gold_outer_border_green_continuous_[3456]col_(?:14|16)row_v23$/;

export function isDeferredPlacementAssetKey(key: string): boolean {
    return key.startsWith("placement_") && !LIVE_PLACEMENT_CARPET.test(key) && !LIVE_PLACEMENT_BORDER.test(key);
}

export function isDeferredLegacyCreatureAssetKey(key: string): boolean {
    if (key.endsWith("_final")) return true;
    if (/_portrait_full_v\d+$/.test(key)) return true;
    return key.includes("_battlefield_side_right_") && !key.endsWith("_battlefield_side_right_final_v1");
}

export function isDeferredUnitCardAssetKey(key: string): boolean {
    return isUnitCardImageKey(key);
}

export function isLazyBattlefieldCreatureAssetKey(key: string): boolean {
    return key.endsWith("_battlefield_side_right_final_v1");
}

const LAZY_PROJECTILE_ASSETS = new Set([
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
]);

export function isLazyProjectileAssetKey(key: string): boolean {
    return LAZY_PROJECTILE_ASSETS.has(key);
}

export function isLazyRosterAssetKey(key: string): boolean {
    return key.endsWith("_pick_sandbox_x2") || key.includes("_portrait_bg_");
}

/** True only for assets that PixiTextureLoader places in its blocking core bundle. */
export function isCoreTextureAssetKey(key: string): boolean {
    return (
        !isUnitAnimationAtlasKey(key) &&
        !isDeferredReactUiAssetKey(key) &&
        !isDeferredEnvironmentAssetKey(key) &&
        !isDeferredPlacementAssetKey(key) &&
        !isDeferredLegacyCreatureAssetKey(key) &&
        !isDeferredUnitCardAssetKey(key) &&
        !isTransientLoadingScreenAssetKey(key) &&
        !isLazyBattlefieldCreatureAssetKey(key) &&
        !isLazyProjectileAssetKey(key) &&
        !isLazyRosterAssetKey(key)
    );
}

/** Authoring/superseded exports that no production path can request, even lazily. */
export function isProductionOmittedAssetKey(key: string): boolean {
    return (
        isRedundantFullResolutionUnitAtlasKey(key) ||
        isDeferredPlacementAssetKey(key) ||
        isDeferredLegacyCreatureAssetKey(key)
    );
}
