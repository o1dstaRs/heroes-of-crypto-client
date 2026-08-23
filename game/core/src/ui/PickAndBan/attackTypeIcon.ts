import { CreatureVals } from "@heroesofcrypto/common";

export type DraftAttackIconKind = "RANGE" | "MAGIC" | "MELEE";

/**
 * Wandering Mage attacks in melee, but its draft-card role is communicated by
 * the Book of Chaos. Reuse the same book pictogram as the other magic units.
 */
export const draftAttackIconKind = (creatureId: number, attackType: string): DraftAttackIconKind => {
    if (creatureId === CreatureVals.ASH_MOTH) return "MAGIC";
    if (attackType === "RANGE" || attackType === "MAGIC") return attackType;
    return "MELEE";
};
