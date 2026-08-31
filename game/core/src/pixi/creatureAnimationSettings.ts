// Temporary art-direction switch: keep every creature on the first authored frame. Board interpolation,
// facing and gameplay VFX remain active, but no creature sprite-sheet frames (idle, walk, action or special)
// advance until this is switched back on.
export const CREATURE_SPRITE_ANIMATION_SETTINGS = { enabled: false };

// Peasant's walk is separately approved and remains active while the global creature-animation freeze
// is in place. These are the only unit atlases worth decoding in that mode.
const UNIT_ATLASES_USED_WHILE_ANIMATIONS_DISABLED = new Set(["peasant_walk_atlas_quarter"]);

export const shouldPreloadUnitAnimationAtlas = (key: string, animationsEnabled: boolean): boolean =>
    animationsEnabled || UNIT_ATLASES_USED_WHILE_ANIMATIONS_DISABLED.has(key);
