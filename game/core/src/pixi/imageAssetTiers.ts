import { isUnitAnimationAtlasKey, isUnitBoardImageKey, isUnitCardImageKey } from "./unitAtlasKeys";

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
    "army_icon",
    "board_icon",
    "book_1024",
    "book_1024_pre",
    "book_1024_previous",
    "chaos_512",
    "death_512",
    "damage_analytics_icon",
    "fight_log_scrollbar_thumb_gothic_v1",
    "flag_green_icon",
    "flag_red_icon",
    "life_512",
    "might_512",
    "nature_512",
    "order_512",
    "logo_hoc",
    "tr_up",
    "ui_banner_green_soft_wide",
    "ui_banner_red_soft_wide",
    "ui_close_button_square_gothic_frame_v1",
    "ui_container_frame_1_9slice",
    "ui_container_frame_2_9slice",
    "ui_outer_frame_3_9slice",
    "x_mark_2_512",
]);

export function isDeferredReactUiAssetKey(key: string): boolean {
    if (DEFERRED_REACT_OR_LEGACY_UI_ASSETS.has(key)) return true;
    return (
        key.startsWith("pick_ban_") ||
        key.startsWith("pick_phase_") ||
        key.startsWith("pick_bundle_") ||
        key.startsWith("pick_l2_legacy_") ||
        key.startsWith("fight_results_") ||
        key.startsWith("left_sidebar_") ||
        key.startsWith("ui_") ||
        key.startsWith("sidebar_") ||
        key.startsWith("stat_") ||
        key.startsWith("artifact_t1_") ||
        key.startsWith("artifact_t2_") ||
        key.startsWith("map_badge_") ||
        key.startsWith("combat_toolbar_") ||
        key.startsWith("league_") ||
        key.startsWith("wealth_") ||
        key.startsWith("doctrine_") ||
        key.endsWith("_augment_256") ||
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

const LIVE_ENVIRONMENT_ASSETS = new Set(["background_stone_tiles_sinister_16x16_original_restored"]);
const LAZY_MAP_TEXTURE_ASSETS = new Set([
    "cemetery_obstacles_9x_256",
    "cemetery_obstacles_9x_256_hp",
    "fire_pit_center_clean_fire_v2_512",
    "fire_pit_grate_foreground_static_v7_512",
    "lava_256",
    "lava_center_anim_atlas",
    "lava_frozen_256",
    "mountain_432_412",
    "water_256",
    "water_dry_256",
]);

/** Map-specific source sheets retained only while a scene actually uses that map. */
export function isLazyMapTextureAssetKey(key: string): boolean {
    return LAZY_MAP_TEXTURE_ASSETS.has(key);
}

export function isDeferredEnvironmentAssetKey(key: string): boolean {
    if (LIVE_ENVIRONMENT_ASSETS.has(key)) return false;
    if (isLazyMapTextureAssetKey(key)) return true;
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

/** Carpet/border variants the runtime selectors can still request. Everything else is authoring leftover. */
export function isLivePlacementAssetKey(key: string): boolean {
    return LIVE_PLACEMENT_CARPET.test(key) || LIVE_PLACEMENT_BORDER.test(key);
}

/** Placement art is never in the blocking core bundle; live variants load for the current grid then unload. */
export function isDeferredPlacementAssetKey(key: string): boolean {
    return key.startsWith("placement_");
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
    return key === "efreet_board_128" || key.endsWith("_battlefield_side_right_final_v1") || isUnitBoardImageKey(key);
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

const LAZY_COMBAT_EFFECT_ASSETS = new Set([
    "book_1024_clean_pages_v1",
    "craft_anvil",
    "craft_hammer",
    "range_target_arrow_v7_gold_wide_crisp",
    "shot_range_corner_aaa_v1",
    "shot_range_corner_aaa_v4_green",
    "shot_range_corner_aaa_v4_red",
    "vfx_dust_smoky_ash_atlas",
]);

/** Large optional battle art loaded and released by its owning surface only when first needed. */
export function isLazyCombatEffectAssetKey(key: string): boolean {
    return LAZY_COMBAT_EFFECT_ASSETS.has(key);
}

export function isLazyRosterAssetKey(key: string): boolean {
    return (
        key === "units_overlay_toggle_square_v1" || key.endsWith("_pick_sandbox_x2") || key.includes("_portrait_bg_")
    );
}

// Ability-only cards from common/configuration/abilities.json. The eleven names that also exist as
// castable spells deliberately stay out of this set because the synchronous Pixi spellbook uses them.
// A newly-added ability is safe by default: it remains in core until its icon is explicitly classified.
const LAZY_ABILITY_ASSETS = new Set([
    "double_punch_256",
    "backstab_256",
    "handyman_256",
    "double_shot_256",
    "double_throw_256",
    "crafted_double_shot_256",
    "crafted_double_punch_256",
    "crafted_frozen_bow_256",
    "crafted_frozen_sword_256",
    "blacksmith_tools_256",
    "enchants_256",
    "shadow_touch_256",
    "one_in_the_field_256",
    "endless_quiver_256",
    "sniper_256",
    "leather_armor_256",
    "limited_supply_256",
    "enchanted_skin_256",
    "undead_256",
    "lightning_spin_256",
    "fire_breath_256",
    "fire_element_256",
    "fire_shield_256",
    "water_element_256",
    "earth_element_256",
    "piercing_spear_256",
    "boost_health_256",
    "stun_256",
    "blindness_256",
    "heavy_armor_256",
    "no_melee_256",
    "sharpened_weapons_aura_256",
    "range_null_field_aura_256",
    "luck_aura_256",
    "arrows_wingshield_aura_256",
    "rallying_volley_aura_256",
    "angelic_host_256",
    "ai_driven_256",
    "magic_shield_256",
    "boar_saliva_256",
    "dodge_256",
    "small_specie_256",
    "bitter_experience_256",
    "absorb_penalties_aura_256",
    "spit_ball_256",
    "sylvan_focus_aura_256",
    "guiding_winds_aura_256",
    "venom_cloud_aura_256",
    "hamstring_256",
    "petrifying_gaze_256",
    "wardguard_256",
    "large_caliber_256",
    "area_throw_256",
    "chakram_256",
    "through_shot_256",
    "sky_runner_256",
    "lucky_strike_256",
    "in_its_own_world_256",
    "basic_tome_of_battle_magic_256",
    "forest_spellbook_256",
    "tome_of_might_256",
    "book_of_healing_256",
    "book_of_chaos_256",
    "book_of_nightmares_256",
    "time_denial_256",
    "tome_of_elements_256",
    "magic_reflection_256",
    "unyielding_power_256",
    "shatter_armor_256",
    "rapid_charge_256",
    "wolf_trail_aura_256",
    "penetrating_bite_256",
    "pegasus_might_aura_256",
    "pegasus_light_256",
    "paralysis_256",
    "deep_wounds_level_0_256",
    "deep_wounds_level_1_256",
    "deep_wounds_level_2_256",
    "deep_wounds_level_3_256",
    "madness_256",
    "blind_fury_256",
    "mechanism_256",
    "aggr_256",
    "skewer_strike_256",
    "war_anger_aura_256",
    "chain_lightning_256",
    "wind_element_256",
    "tie_up_the_horses_aura_256",
    "crusade_256",
    "disguise_aura_256",
    "devour_essence_256",
    "dense_flesh_256",
    "flesh_shield_aura_256",
    "stun_aura_256",
    "web_aura_256",
    "infest_256",
    "predatory_assimilation_256",
    "warding_mane_aura_256",
    "terrifying_gaze_256",
    "borrowed_grace_256",
    "absolving_arrow_256",
]);

/** Passive ability cards are URL-driven in React; Pixi needs one only for the rare matching combat VFX. */
export function isLazyAbilityAssetKey(key: string): boolean {
    return LAZY_ABILITY_ASSETS.has(key);
}

// Spell/status cards from common/configuration/spells.json. React surfaces already render these from
// their URLs; Pixi asks for only the spells owned by units in the current scene and refreshes an open
// spellbook when each requested icon arrives. Keep this explicit so new spells remain core by default.
const LAZY_SPELL_ASSETS = new Set([
    "morale_256",
    "dismorale_256",
    "dulling_defense_256",
    "miner_256",
    "wild_regeneration_256",
    "wind_flow_256",
    "vine_throw_256",
    "battle_roar_256",
    "castling_256",
    "resurrection_256",
    "armor_augment_256",
    "might_augment_256",
    "empower_augment_256",
    "sniper_augment_256",
    "movement_augment_256",
    "veteran_helm_256",
    "keen_blade_256",
    "iron_plate_256",
    "swift_boots_256",
    "winged_boots_256",
    "angelic_host_blessing_256",
    "arcane_ward_blessing_256",
    "arrows_wingshield_blessing_256",
    "warding_mane_blessing_256",
    "cursed_ward_256",
    "hunters_longbow_256",
    "helm_of_focus_256",
    "amulet_of_resolve_256",
    "warlords_edge_256",
    "titan_plate_256",
    "clover_of_fortune_256",
    "crown_of_command_256",
    "pendant_of_vitality_256",
    "berserkers_bond_256",
    "dual_strike_charm_256",
    "wounding_charm_256",
    "broken_aegis_256",
    "holy_cross_256",
    "giants_maul_256",
    "farsight_quiver_256",
    "tome_of_amplification_256",
    "rime_charm_256",
    "lava_striders_256",
    "craft_256",
    "armor_rune_256",
    "weapon_rune_256",
    "made_of_fire_256",
    "water_shield_256",
    "visible_256",
    "hidden_256",
    "mages_ring_256",
    "archmages_ring_256",
    "heal_256",
    "spiritual_armor_256",
    "blessing_256",
    "helping_hand_256",
    "courage_256",
    "mass_heal_256",
    "summon_wolves_256",
    "whirlpool_256",
    "lightning_strike_256",
    "ring_of_fire_256",
    "meteor_shower_256",
    "riot_256",
    "empower_256",
    "mass_riot_256",
    "magic_mirror_256",
    "mass_magic_mirror_256",
    "smoke_256",
    "fireforged_sword_256",
    "misfortune_256",
    "fire_wall_256",
    "fire_strike_256",
    "meteorite_256",
    "curse_256",
    "sadness_256",
    "quagmire_256",
    "hamstrung_256",
    "weakening_beam_256",
    "weakness_256",
    "rangebane_256",
    "cowardice_256",
    // Chaos variants selected directly instead of SpellHelper's generic key in the authored spellbook.
    "fire_strike_chaos_256_v1",
    "meteorite_chaos_256_v1",
]);

/** Spell and status cards are decoded only when a unit or combat effect requests the exact icon. */
export function isLazySpellAssetKey(key: string): boolean {
    return LAZY_SPELL_ASSETS.has(key);
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
        !isLazyCombatEffectAssetKey(key) &&
        !isLazyRosterAssetKey(key) &&
        !isLazyAbilityAssetKey(key) &&
        !isLazySpellAssetKey(key)
    );
}

/** Authoring/superseded exports that no production path can request, even lazily. */
export function isProductionOmittedAssetKey(key: string): boolean {
    return (
        isRedundantFullResolutionUnitAtlasKey(key) ||
        (isDeferredPlacementAssetKey(key) && !isLivePlacementAssetKey(key)) ||
        isDeferredLegacyCreatureAssetKey(key)
    );
}
