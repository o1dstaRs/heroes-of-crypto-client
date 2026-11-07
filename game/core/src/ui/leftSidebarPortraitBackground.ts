import { CreatureFactionsMap, FactionVals } from "@heroesofcrypto/common";

import { images } from "../imageAssets";
import { compositeBlackShadeAlpha, PORTRAIT_ADDITIONAL_BACKGROUND_SHADE_ALPHA } from "./creaturePortraitBackground";

/** Empty plates recovered from the approved frontal cards; sidebar cutouts stay independent. */
export const resolveLeftSidebarPortraitBackground = (creatureId: number): string | undefined => {
    switch (CreatureFactionsMap[creatureId]) {
        case FactionVals.LIFE:
            return images.life_portrait_bg_frontal_sky_v2;
        case FactionVals.CHAOS:
            return images.chaos_portrait_bg_frontal_volcano_v2;
        case FactionVals.MIGHT:
            return images.might_portrait_bg_frontal_crimson_v2;
        case FactionVals.NATURE:
            return images.nature_portrait_bg_emerald_forest_v1;
        default:
            return undefined;
    }
};

/** Grade only the background, including the faction's additional sidebar dimming. */
export const leftSidebarPortraitBackgroundShadeAlpha = (creatureId: number): number => {
    const faction = CreatureFactionsMap[creatureId];
    const previous = compositeBlackShadeAlpha(
        faction === FactionVals.NATURE ? 0.05 : 0,
        PORTRAIT_ADDITIONAL_BACKGROUND_SHADE_ALPHA,
    );
    return compositeBlackShadeAlpha(
        previous,
        faction === FactionVals.CHAOS ? 0.15 : faction === FactionVals.LIFE ? 0.09 : 0,
    );
};
