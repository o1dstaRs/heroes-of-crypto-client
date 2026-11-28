import type { ImageKey } from "../../generated/image_imports";

export const RANGED_FLIGHT_SPEED = 64;
export const ORC_AXE_FLIGHT_SPEED = 52.2;
export const CHAKRAM_FLIGHT_SPEED = 42;
export const ARBALESTER_BOLT_SPEED_MULTIPLIER = 1.2;
export const CANNON_PIERCING_FLIGHT_MULTIPLIER = 1.2;

export const RANGED_PROJECTILE_TEXTURE_KEYS = {
    bolt: "armor_piercing_bolt",
    arbalester: "arbalester_cyan_bolt",
    beholder: "beholder_purple_eye_orb",
    centaur: "centaur_spear_variant_4",
    cyclops: "cyclops_lab_boulder",
    dryadArrow: "dryad_lab_arrow",
    gargantuan: "gargantuan_held_stone_v4",
    medusa: "medusa_lab_projectile_atlas",
    monk: "monk_solar_orb",
    orc: "orc_throwing_axe",
    tsarCannon: "vfx_tsar_cannon_flight_v21_atlas",
    zena: "zena_chakram_sparks_v16",
} as const satisfies Record<string, ImageKey>;

export const ORC_AXE_RELEASE_FRAME = 4;
export const BEHOLDER_SHOT_RELEASE_FRAME = 2;
export const CENTAUR_SPEAR_RELEASE_FRAME = 3;
