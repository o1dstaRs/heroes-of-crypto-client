import { type ColorMatrix, ColorMatrixFilter } from "pixi.js";

/**
 * How far a paralysed creature is lifted toward white (owner, 2026-11-26: "just make a unit look a little
 * whiter" instead of the electric floor ring). Every colour keeps (1 - k) of itself and gains k of white.
 */
export const PARALYSIS_WASH_STRENGTH = 0.3;

/** The colour matrix for a lift of `k` toward white. Alpha is untouched, so transparent edges stay clear. */
export const paralysisWashMatrix = (k = PARALYSIS_WASH_STRENGTH): ColorMatrix => [
    1 - k,
    0,
    0,
    0,
    k,
    0,
    1 - k,
    0,
    0,
    k,
    0,
    0,
    1 - k,
    0,
    k,
    0,
    0,
    0,
    1,
    0,
];

let sharedFilter: ColorMatrixFilter | null | undefined;

/** One immutable filter shared by every paralysed sprite; a renderer that cannot build it leaves units unwashed. */
export const getParalysisWashFilter = (): ColorMatrixFilter | undefined => {
    if (sharedFilter) return sharedFilter;
    try {
        const filter = new ColorMatrixFilter();
        filter.matrix = paralysisWashMatrix();
        // Match the renderer's capped resolution rather than allocating a 2x surface per washed creature.
        filter.resolution = "inherit";
        sharedFilter = filter;
    } catch {
        sharedFilter = null;
    }
    return sharedFilter ?? undefined;
};

/** The shared filter if it was ever built, so a unit that recovers can drop it without creating one. */
export const existingParalysisWashFilter = (): ColorMatrixFilter | undefined => sharedFilter ?? undefined;
