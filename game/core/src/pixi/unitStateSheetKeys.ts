import { FINAL_STATIC_BATTLEFIELD_TEXTURES } from "./battlefieldTextureKeys";

/**
 * A creature animation sheet recognised by its NAME: `<creature>_[variant_]<state>[_up|_down][_page_NN]_atlas`
 * in any size variant (`berserker_sword_idle_atlas`, `dryad_lab_attack_up_atlas_quarter`, `arbalester_idle_page_01_atlas`).
 *
 * The generated atlas index (unitAtlasKeys) only knows the sheets whose metadata this build carries, but the art
 * source gains new sheets before that metadata arrives. An unrecognised sheet used to fall through to the blocking
 * core bundle, so a player could wait behind a hundred megabytes of animation before the board showed a single unit.
 * Animation is never needed to play, so these always stay out of core. Effects that merely start with a creature
 * name (`peasant_footstep_dust_low_sweep_atlas`) do not end in a state and remain board art.
 */
const CREATURE_SLUGS = [...Object.keys(FINAL_STATIC_BATTLEFIELD_TEXTURES), "ash_moth", "thief"];

const UNIT_STATE_SHEET = new RegExp(
    `^(?:${CREATURE_SLUGS.join("|")})_(?:[a-z0-9]+_)*?` +
        "(?:idle|walk|hit|death|cast|attack|melee_attack|default)(?:_up|_down)?(?:_page_\\d{2})?_atlas(?:_half|_quarter)?$",
);

// The React left-sidebar portrait strip: named like a state sheet, but a normal UI asset.
const NOT_UNIT_STATE_SHEETS = new Set(["peasant_left_screen_idle_atlas"]);

export const isNamedUnitStateSheetKey = (key: string): boolean =>
    !NOT_UNIT_STATE_SHEETS.has(key) && UNIT_STATE_SHEET.test(key);
