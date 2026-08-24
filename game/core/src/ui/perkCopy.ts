/*
 * -----------------------------------------------------------------------------
 * This file is part of the client code of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { Perk } from "@heroesofcrypto/common";

import { images } from "../generated/image_imports";

/**
 * Player-facing copy for the three scouting perks (perks).
 *
 * The wire-level description on PerkProperties is one terse line ("Reveal the opponent's picks in 3
 * random slots. Grants 6 upgrade points.") — enough to label a card, not enough to choose between
 * them. A perk is committed BEFORE the draft and cannot be changed, and it silently sets the
 * augment budget the player only spends much later, at placement. So the pre-game chooser has to say
 * three separate things: what the perk reveals, what its point budget actually buys, and why you
 * would take it over the other two.
 *
 * Kept here (client-side, not on PerkProperties) so wording can change without a common rebuild and a
 * server redeploy, and shared so the pre-game chooser and the in-draft panel can never drift apart.
 */
export interface PerkCopy {
    /** Round perk medallion shared by every chooser, summary rail, and match-history view. */
    readonly iconImage: string;
    /** Three or four words under the name on the card. */
    readonly tagline: string;
    /** Exactly what the perk reveals, in board terms. */
    readonly detail: string;
    /** What the point budget costs or buys, in augment levels. */
    readonly budget: string;
    /** Why a player would choose this one over the other two. */
    readonly why: string;
}

/**
 * Scout's three slots are NOT drawn uniformly. The six-slot army layout is
 * [L1, L1, L2, L2, L3, L4] (CreaturePoolByLevel = [2, 2, 1, 1]) and the perk rolls ONE slot per
 * tier block — see applyPerk in common's picks/pick_sim.ts. That guarantee is the whole reason to
 * take Scout, so it is stated explicitly rather than as "3 random slots".
 */
export const PERK_COPY: Record<number, PerkCopy> = {
    [Perk.Perk.THREE_REVEALS]: {
        // perk_scout art has not landed in the shared drive yet - fall back to the other scouting icon.
        iconImage: (images as Partial<Record<string, string>>).perk_scout ?? images.perk_spymaster,
        tagline: "Half their army, spread across every tier",
        detail:
            "Opens three of the opponent's six army slots — one per tier block, not three at random: " +
            "one of their two Level 1 picks, one of their two Level 2 picks, and either their Level 3 or " +
            "their Level 4. The slots are rolled the moment the draft opens and stay open as those picks " +
            "fill in. The other three never open.",
        budget: "6 of 7 upgrade points — one augment level short of the maximum.",
        why:
            "The middle line, and the only perk guaranteed to show you something at every power tier — " +
            "including one of their two heavyweights. Take it when you want a read on their plan and can " +
            "spare a single augment level to get it.",
    },
    [Perk.Perk.SEE_ALL]: {
        iconImage: images.perk_spymaster,
        tagline: "The whole enemy draft, live",
        detail:
            "Every one of the opponent's six picks is visible for the entire draft, each revealed as they " +
            "lock it in — so you always know what they have taken before you commit your next pick or ban.",
        budget: "5 of 7 upgrade points — two augment levels short of the maximum.",
        why:
            "Total information: you ban what actually threatens you and pick real counters instead of " +
            "guessing. It is the most expensive perk, so it pays off when you know the matchups well " +
            "enough to convert what you see into better picks.",
    },
    [Perk.Perk.SEE_NONE]: {
        iconImage: images.perk_blind_fury,
        tagline: "Draft blind, field the strongest army",
        detail:
            "You see none of the opponent's picks at any point. You draft entirely on your own plan and " +
            "meet whatever they built on the board.",
        budget: "All 7 upgrade points — the full budget, enough for two level-3 augments plus a level-1.",
        why:
            "Trades every scrap of information for raw army strength. Take it when you have a composition " +
            "you trust and would rather be stronger than informed. Perks are chosen independently, so " +
            "expect that your opponent may still be watching you.",
    },
};

export const getPerkCopy = (perkId: number): PerkCopy | undefined => PERK_COPY[perkId];

export const getPerkIconImage = (perkId: number): string | undefined => PERK_COPY[perkId]?.iconImage;
