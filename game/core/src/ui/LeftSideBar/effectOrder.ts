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

/** Just enough of IVisibleImpact to rank it; keeps this module free of the UI types. */
export interface IOrderableEffect {
    name: string;
    description: string;
}

/**
 * Army-wide and whole-fight first when read in ARRIVAL order: augments, then artifacts, then the per-turn
 * traffic. Grouping rather than a pure arrival sort is deliberate — it stops an effect jumping groups the
 * moment another expires.
 */
const buffRank = (buff: IOrderableEffect): number => {
    if (buff.name.endsWith(" Augment")) return 0;
    if (buff.description.startsWith("Artifact.")) return 1;
    return 2;
};

/**
 * Buffs as the sidebar shows them: MOST RECENT FIRST (owner call — the newest effect reads leftmost).
 *
 * The grouping above still decides the blocks; this reverses the finished order, so the per-turn traffic —
 * the part that actually changes from turn to turn — leads, newest first, and the permanent army-wide
 * augments settle at the far end where they need the least attention. Reversing the FINISHED list rather
 * than flipping the rank keeps each group contiguous, so an effect still cannot jump groups when a
 * neighbour expires.
 */
export const orderSidebarBuffs = <T extends IOrderableEffect>(buffs: readonly T[]): T[] =>
    buffs
        .map((buff, index) => ({ buff, index }))
        .sort((a, b) => buffRank(a.buff) - buffRank(b.buff) || a.index - b.index)
        .map((entry) => entry.buff)
        .reverse();

/**
 * Debuffs as the sidebar shows them: MOST RECENT FIRST.
 *
 * Debuffs carry no grouping — they are all per-turn traffic — so recency is the whole rule. Copies rather
 * than reversing in place: the array belongs to the caller's props.
 */
export const orderSidebarDebuffs = <T extends IOrderableEffect>(debuffs: readonly T[]): T[] => [...debuffs].reverse();
