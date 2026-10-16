import { describe, expect, test } from "bun:test";

import { isCoreTextureAssetKey } from "./imageAssetTiers";
import { getSplitBundles } from "./PixiTextureLoader";
import { isNamedUnitStateSheetKey } from "./unitStateSheetKeys";

// Sheets an art source carried before this build's atlas metadata knew them; each once landed in the core bundle.
const UNLISTED_SHEETS = [
    "ash_moth_melee_attack_atlas",
    "berserker_sword_idle_atlas",
    "centaur_lab_walk_atlas",
    "dryad_lab_attack_up_atlas_quarter",
    "mermaid_melee_attack_down_atlas",
    "scavenger_homm_idle_atlas_quarter",
    "scavenger_combat_hit_atlas_quarter",
    "arbalester_idle_page_01_atlas",
    "squire_default_atlas_quarter",
    "wolf_rider_attack_atlas_half",
];

// Board art that happens to be an atlas, some of it starting with a creature name.
const BOARD_ATLASES = [
    "peasant_footstep_dust_low_sweep_atlas",
    "squire_footstep_dust_compact_atlas",
    "peasant_left_screen_idle_atlas",
    "magic_aim_dual_helix_default_atlas",
    "lava_center_anim_atlas",
    "tombstone_tiles_64_atlas",
    "active_turn_blue_fire_atlas",
    "pick_ban_slash_variant2_atlas",
    "vfx_dust_smoky_ash_atlas",
    "ambient_fire_video_torch_left_natural_v4_64_atlas",
    "cemetery_obstacles_9x_256_atlas",
    "fire_pit_unified_front_wide_48_atlas",
];

describe("creature animation sheets never block the board", () => {
    test("a sheet named <creature>_[variant_]<state>_atlas is recognised whether or not the atlas index lists it", () => {
        for (const key of UNLISTED_SHEETS) {
            expect(isNamedUnitStateSheetKey(key), key).toBe(true);
        }
        for (const key of BOARD_ATLASES) {
            expect(isNamedUnitStateSheetKey(key), key).toBe(false);
        }
    });

    test("none of them is core art", () => {
        for (const key of UNLISTED_SHEETS) {
            expect(isCoreTextureAssetKey(key), key).toBe(false);
        }
    });

    test("the blocking core bundle holds no creature animation sheet", () => {
        const { core } = getSplitBundles({ animationsEnabled: false });
        expect(Object.keys(core).filter(isNamedUnitStateSheetKey)).toEqual([]);
    });
});
