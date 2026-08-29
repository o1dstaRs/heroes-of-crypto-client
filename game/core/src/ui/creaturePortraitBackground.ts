import { CreatureFactionsMap, FactionVals } from "@heroesofcrypto/common";

import { images } from "../imageAssets";

const PREVIOUS_PORTRAIT_BACKGROUND_SHADE_ALPHA = 0.08;
const ALL_BACKGROUNDS_ADDITIONAL_SHADE_ALPHA = 0.05;
const LIFE_CHAOS_ADDITIONAL_SHADE_ALPHA = 0.1;

const compositeBlackShadeAlpha = (baseAlpha: number, additionalAlpha: number): number =>
    1 - (1 - baseAlpha) * (1 - additionalAlpha);

/** The previous eight-percent background veil with the requested additional five-percent layer. */
export const CREATURE_PORTRAIT_BACKGROUND_SHADE_ALPHA = compositeBlackShadeAlpha(
    PREVIOUS_PORTRAIT_BACKGROUND_SHADE_ALPHA,
    ALL_BACKGROUNDS_ADDITIONAL_SHADE_ALPHA,
);

/** Life and Chaos receive another ten-percent layer; creature artwork is never shaded. */
export const creaturePortraitBackgroundShadeAlpha = (creatureId: number): number => {
    const faction = CreatureFactionsMap[creatureId];
    return faction === FactionVals.LIFE || faction === FactionVals.CHAOS
        ? compositeBlackShadeAlpha(CREATURE_PORTRAIT_BACKGROUND_SHADE_ALPHA, LIFE_CHAOS_ADDITIONAL_SHADE_ALPHA)
        : CREATURE_PORTRAIT_BACKGROUND_SHADE_ALPHA;
};

/** Background opacity remains neutral; darkening is handled by explicit overlay layers. */
export const creaturePortraitBackgroundOpacity = (creatureId: number): number => {
    void creatureId;
    return 1;
};

export type CreaturePortraitBackgroundKey =
    | "chaos_portrait_bg_obsidian_fissure_corner_fire_v1"
    | "life_portrait_bg_golden_dawn_four_corner_haze_v1"
    | "might_portrait_bg_blood_claw_strong_red_corners_v1"
    | "nature_portrait_bg_xray_leaf_corner_glow_v2_soft";

/** Resolve the shared race environment used behind a creature's approved full-body portrait. */
export const creaturePortraitBackgroundKey = (creatureId: number): CreaturePortraitBackgroundKey | undefined => {
    const faction = CreatureFactionsMap[creatureId];
    if (faction === FactionVals.LIFE) return "life_portrait_bg_golden_dawn_four_corner_haze_v1";
    if (faction === FactionVals.NATURE) return "nature_portrait_bg_xray_leaf_corner_glow_v2_soft";
    if (faction === FactionVals.CHAOS) return "chaos_portrait_bg_obsidian_fissure_corner_fire_v1";
    if (faction === FactionVals.MIGHT) return "might_portrait_bg_blood_claw_strong_red_corners_v1";
    return undefined;
};

export const resolveCreaturePortraitBackground = (creatureId: number): string | undefined => {
    const key = creaturePortraitBackgroundKey(creatureId);
    return key ? images[key] : undefined;
};
