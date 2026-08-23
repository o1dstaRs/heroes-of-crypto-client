import {
    creaturePortraitBackgroundOpacity,
    creaturePortraitBackgroundShadeAlpha,
    resolveCreaturePortraitBackground,
} from "./creaturePortraitBackground";
import { resolvePortraitFraming, type PortraitFraming } from "./portraitFraming";
import { fullBodyCreatureImage, UNIT_ID_TO_IMAGE } from "./unit_ui_constants";

export interface CreaturePortraitVisual {
    source: string;
    background?: string;
    backgroundOpacity: number;
    backgroundShadeAlpha: number;
    framing: PortraitFraming;
}

/** The approved draft/pick-card portrait frame: 190 px wide by 256 px tall. */
export const CREATURE_PORTRAIT_ASPECT = 190 / 256;

/**
 * Shared portrait recipe for every non-battlefield creature surface. React cards and the Pixi sandbox roster
 * both consume this exact source/background/framing tuple, preserving the individually reviewed crop, scale
 * and offsets from the portrait-framing editor.
 */
export const resolveCreaturePortraitVisual = (creatureId: number): CreaturePortraitVisual | undefined => {
    const portraitSource = UNIT_ID_TO_IMAGE[creatureId];
    const framing = resolvePortraitFraming(creatureId);
    const source = framing.source === "full" ? (fullBodyCreatureImage(creatureId) ?? portraitSource) : portraitSource;
    if (!source) return undefined;

    return {
        source,
        background: resolveCreaturePortraitBackground(creatureId),
        backgroundOpacity: creaturePortraitBackgroundOpacity(creatureId),
        backgroundShadeAlpha: creaturePortraitBackgroundShadeAlpha(creatureId),
        framing,
    };
};
