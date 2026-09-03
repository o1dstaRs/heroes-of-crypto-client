import { animationAtlases } from "../generated/animation_atlases";

type AnimationAtlasIndex = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

// The generated atlas metadata also carries a small draft UI animation. It shares the same file
// shape as creature atlases but must remain a normal React-owned asset, including in production.
const NON_UNIT_ATLAS_NAMES = new Set(["Pick Ban Slash"]);

/**
 * Every per-unit animation atlas image key BASE (`<unit>_<state>_atlas`), derived from the generated
 * atlas index so a new unit or state is classified correctly without touching this file.
 */
export function buildUnitAnimationAtlasKeyClassifier(atlases: AnimationAtlasIndex): (key: string) => boolean {
    const bases = new Set<string>();
    for (const [unitName, states] of Object.entries(atlases)) {
        if (NON_UNIT_ATLAS_NAMES.has(unitName)) continue;
        const unitBase = unitName.toLowerCase().replace(/\s+/g, "_");
        for (const state of Object.keys(states)) {
            bases.add(`${unitBase}_${state.toLowerCase()}_atlas`);
        }
    }

    return (key: string): boolean => bases.has(key.replace(/_(?:quarter|half)$/, ""));
}

/**
 * True for a UNIT animation atlas image key in any size variant (`_atlas`, `_atlas_half`,
 * `_atlas_quarter`). These are supplementary: the fight is fully playable without them — units fall
 * back to their circular chips (and today unit atlas animation is owner-disabled outright), and any
 * late consumer lazily resolves through the raw image URL (texAny's fallback path).
 *
 * Deliberately FALSE for terrain atlases (`lava_center_anim_atlas` and anything else that merely ends
 * in `_atlas`): live board atlases can still be needed at first paint, so suffix alone cannot classify them
 * as unit animation. The old suffix-based split got this exactly backwards — it shipped
 * every `_atlas_quarter`/`_atlas_half` (~89 MB) in the BLOCKING bundle while pushing the terrain the
 * board actually needs into the background.
 */
const generatedUnitAnimationAtlasKey = buildUnitAnimationAtlasKeyClassifier(animationAtlases);

const generatedUnitCardImageKeys = new Set(
    Object.keys(animationAtlases).map((unitName) => `${unitName.toLowerCase().replace(/\s+/g, "_")}_512`),
);
const generatedUnitBoardImageKeys = new Set(
    Object.keys(animationAtlases)
        .filter((unitName) => !NON_UNIT_ATLAS_NAMES.has(unitName))
        .flatMap((unitName) => {
            const slug = unitName.toLowerCase().replace(/\s+/g, "_");
            return [`${slug}_128`, `${slug}_256`];
        }),
);
const specialUnitBoardImageKeys = new Set([
    // Runtime fallbacks/summons without a matching generated animation family.
    "dark_champion_256",
    "faerie_dragon_256",
    "imp_128",
    "phoenix_256",
    "skeleton_128",
    "spider_128",
    "spider_256",
    "zombie_128",
    // Historical board-specific crops retained for editor and compatibility paths.
    "arachna_queen_board_256",
    "thief_board_128",
    "thunderbird_256_v2",
    "troll_board_128",
    "wandering_mage_board_128",
]);
const specialUnitCardImageKeys = new Set([
    // Summons and legacy units without authored animation metadata still use their 512px card in React UI.
    "dark_champion_512",
    "faerie_dragon_512",
    "imp_512",
    "phoenix_512",
    "skeleton_512",
    "unknown_creature_512",
    "wandering_mage_512",
    "thief_model_full",
    "thunderbird_512_v2",
    "zombie_512",
]);

/** Card/sidebar portraits are URL-driven UI art, not permanent Pixi board textures. */
export const isUnitCardImageKey = (key: string): boolean =>
    generatedUnitCardImageKeys.has(key) || specialUnitCardImageKeys.has(key);

/** Old board chips remain valid fallbacks, but the live roster normally uses approved full-body cutouts. */
export const isUnitBoardImageKey = (key: string): boolean =>
    generatedUnitBoardImageKeys.has(key) || specialUnitBoardImageKeys.has(key);

// Hand-authored unit strips that intentionally live outside generated/animation_atlases.ts. Keep this
// list beside the generated classifier so bundle routing does not mistake them for terrain/VFX.
const specialUnitAnimationAtlasBases = new Set([
    "ash_moth_walk_left_atlas",
    "orc_idle_axe_twirl_atlas",
    "orc_idle_battle_cry_atlas",
    "thief_idle_blade_twirl_atlas",
    "thief_idle_battle_cry_atlas",
]);

export const isUnitAnimationAtlasKey = (key: string): boolean =>
    generatedUnitAnimationAtlasKey(key) || specialUnitAnimationAtlasBases.has(key.replace(/_(?:quarter|half)$/, ""));
