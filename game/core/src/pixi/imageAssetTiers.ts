import { isUnitAnimationAtlasKey } from "./unitAtlasKeys";

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

export function isDeferredReactUiAssetKey(key: string): boolean {
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
        !isLazyBattlefieldCreatureAssetKey(key) &&
        !isLazyProjectileAssetKey(key) &&
        !isLazyRosterAssetKey(key)
    );
}
