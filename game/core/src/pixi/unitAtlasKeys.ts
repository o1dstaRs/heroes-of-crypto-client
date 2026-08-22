import { animationAtlases } from "../generated/animation_atlases";

/**
 * Every per-unit animation atlas image key BASE (`<unit>_<state>_atlas`), derived from the generated
 * atlas index so a new unit or state is classified correctly without touching this file.
 */
const unitAtlasBaseKeys: ReadonlySet<string> = (() => {
    const bases = new Set<string>();
    for (const [unitName, states] of Object.entries(animationAtlases)) {
        const unitBase = unitName.toLowerCase().replace(/\s+/g, "_");
        for (const state of Object.keys(states)) {
            bases.add(`${unitBase}_${state.toLowerCase()}_atlas`);
        }
    }
    return bases;
})();

/**
 * True for a UNIT animation atlas image key in any size variant (`_atlas`, `_atlas_half`,
 * `_atlas_quarter`). These are supplementary: the fight is fully playable without them — units fall
 * back to their circular chips (and today unit atlas animation is owner-disabled outright), and any
 * late consumer lazily resolves through the raw image URL (texAny's fallback path).
 *
 * Deliberately FALSE for terrain atlases (`lava_center_anim_atlas`, `tombstone_tiles_256_atlas`,
 * anything else that merely ends in `_atlas`): the board draws those at first paint, so they belong
 * in the blocking core bundle. The old suffix-based split got this exactly backwards — it shipped
 * every `_atlas_quarter`/`_atlas_half` (~89 MB) in the BLOCKING bundle while pushing the terrain the
 * board actually needs into the background.
 */
export function isUnitAnimationAtlasKey(key: string): boolean {
    return unitAtlasBaseKeys.has(key.replace(/_(?:quarter|half)$/, ""));
}
