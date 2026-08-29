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

export interface CreaturePortraitArtPlacementOverrides {
    /** A dedicated surface-specific source owns its own crop instead of inheriting the pick-card crop. */
    independentSource?: boolean;
    baseScale?: number;
    scale?: number;
    offsetX?: number;
    offsetY?: number;
}

/**
 * Resolve the creature-art transform without leaking pick-card framing into a dedicated sidebar image.
 * Left-screen HD cutouts were authored and tuned around their own neutral (1x, 0/0) canvas; multiplying
 * them by the pick-card's often 3-4x crop produces oversized and vertically displaced portraits.
 */
export const resolveCreaturePortraitArtPlacement = (
    framing: PortraitFraming,
    overrides: CreaturePortraitArtPlacementOverrides = {},
): Readonly<{ scale: number; offsetX: number; offsetY: number }> => {
    const inheritedScale = overrides.independentSource ? 1 : framing.scale;
    const inheritedOffsetX = overrides.independentSource ? 0 : framing.offsetX;
    const inheritedOffsetY = overrides.independentSource ? 0 : framing.offsetY;

    return {
        scale: (overrides.baseScale ?? inheritedScale) * (overrides.scale ?? 1),
        offsetX: inheritedOffsetX + (overrides.offsetX ?? 0),
        offsetY: inheritedOffsetY + (overrides.offsetY ?? 0),
    };
};

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
