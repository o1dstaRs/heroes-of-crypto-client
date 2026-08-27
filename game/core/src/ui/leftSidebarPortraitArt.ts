import { CreatureVals } from "@heroesofcrypto/common";
import type React from "react";

import { images } from "../imageAssets";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";

export interface LeftSidebarPortraitArt {
    source?: string;
    fit?: React.CSSProperties["objectFit"];
    baseScale?: number;
    /** Negative values mirror only the creature artwork on the left battle card. */
    artScaleX?: number;
}

const runtimeImages = images as Readonly<Record<string, string>>;

/** User-approved, screen-specific sources uploaded in the shared left-screen portrait folder. */
export const LEFT_SIDEBAR_PORTRAIT_ART_CHECKPOINT_X: Readonly<Partial<Record<number, string>>> = Object.freeze(
    Object.fromEntries(
        Object.entries(UNIT_ID_TO_NAME)
            .filter(([creatureId]) => Number(creatureId) !== CreatureVals.NO_CREATURE)
            .map(([creatureId, name]) => [
                Number(creatureId),
                runtimeImages[`${name.toLowerCase().replaceAll(" ", "_")}_left_screen_x2`],
            ]),
    ),
);

/**
 * Left-card-only art substitutions. Draft cards, roster cards, battlefield figures and every other portrait
 * surface keep the shared approved assets and framing.
 */
export const resolveLeftSidebarPortraitArt = (creatureId: number): LeftSidebarPortraitArt => {
    const correctedSource = LEFT_SIDEBAR_PORTRAIT_ART_CHECKPOINT_X[creatureId];
    return correctedSource ? { source: correctedSource, fit: "contain", baseScale: 1 } : {};
};
