/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

export interface ISpriteHitCandidate<T> {
    unit: T;
    unitId: string;
    /** Draw depth; higher is drawn in front. Board units use `4000 - position.y`, so a creature standing
     *  LEFT on screen has the higher depth. */
    depth: number;
}

/**
 * The frontmost creature whose sprite box contains a board point — never the one doing the clicking.
 *
 * `excludeUnitId` is what stops a unit from stealing a click aimed past itself. Board sprites are tall:
 * a creature is drawn from its foot line upward across roughly one and a half cells, and up to ~1.7 cells
 * wide for the wide-art creatures, so an attacker's sprite box covers most of the cell ABOVE it and part of
 * the cells beside it. Depth is `4000 - position.y`, so the attacker — lower on screen — outranks the very
 * target it is trying to hit. Picking it makes the click resolve to your own unit, the "is this an enemy"
 * test fails, and the attack is silently abandoned.
 *
 * The acting unit can never be its own melee or ranged target, so removing it from this pick costs nothing:
 * clicking your OWN cell still resolves to you through the caller's grid-occupancy fallback.
 */
export const pickFrontmostSpriteHit = <T>(
    candidates: readonly ISpriteHitCandidate<T>[],
    excludeUnitId?: string,
): T | undefined => {
    let best: ISpriteHitCandidate<T> | undefined;
    for (const candidate of candidates) {
        if (excludeUnitId !== undefined && candidate.unitId === excludeUnitId) {
            continue;
        }
        if (!best || candidate.depth > best.depth) {
            best = candidate;
        }
    }

    return best?.unit;
};
