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

import { HoCConstants } from "@heroesofcrypto/common";

/** Just enough of IVisibleImpact to rank it; keeps this module free of the UI types. */
export interface IOrderableEffect {
    name: string;
    description: string;
    laps?: number;
    appliedOrder?: number;
}

const isTemporary = (effect: IOrderableEffect): boolean =>
    effect.laps !== undefined &&
    effect.laps > 0 &&
    effect.laps !== Number.MAX_SAFE_INTEGER &&
    effect.laps !== HoCConstants.NUMBER_OF_LAPS_TOTAL;

/** Temporary effects lead; permanent buffs, artifacts and augments follow in their own blocks. */
const buffRank = (buff: IOrderableEffect): number => {
    if (isTemporary(buff)) return 0;
    if (buff.name.endsWith(" Augment")) return 3;
    if (buff.description.startsWith("Artifact.")) return 2;
    return 1;
};

/**
 * Use successful application events to merge spell debuffs and ability effects chronologically.
 * Older snapshots without those events retain reverse arrival order; remaining duration is never age.
 */
const orderEffects = <T extends IOrderableEffect>(effects: readonly T[], rank: (effect: T) => number): T[] =>
    effects
        .map((effect, index) => ({ effect, index }))
        .sort(
            (a, b) =>
                rank(a.effect) - rank(b.effect) ||
                (b.effect.appliedOrder ?? -1) - (a.effect.appliedOrder ?? -1) ||
                b.index - a.index,
        )
        .map((entry) => entry.effect);

export const orderSidebarBuffs = <T extends IOrderableEffect>(buffs: readonly T[]): T[] =>
    orderEffects(buffs, buffRank);

export const orderSidebarDebuffs = <T extends IOrderableEffect>(debuffs: readonly T[]): T[] =>
    orderEffects(debuffs, (effect) => (isTemporary(effect) ? 0 : 1));
