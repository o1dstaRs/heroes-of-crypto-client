import { CreatureVals } from "@heroesofcrypto/common";

export type DraftAttackIconKind = "RANGE" | "MAGIC" | "MELEE";

const extendedCreatureVals = CreatureVals as typeof CreatureVals & {
    readonly ASH_MOTH?: number;
    readonly WANDERING_MAGE?: number;
};
/** Protocol id 49 retained its role while the generated enum name changed between common revisions. */
export const ASH_MOTH_CREATURE_ID = extendedCreatureVals.ASH_MOTH ?? extendedCreatureVals.WANDERING_MAGE ?? 49;

/**
 * Some caster-role creatures technically use a melee basic attack. Keep their
 * draft-card role clear by showing the same book pictogram as other magic units.
 */
export const draftAttackIconKind = (creatureId: number, attackType: string): DraftAttackIconKind => {
    if (
        creatureId === ASH_MOTH_CREATURE_ID ||
        creatureId === CreatureVals.BATTLE_MAGE ||
        creatureId === CreatureVals.OGRE_MAGE ||
        creatureId === CreatureVals.MAGIC_DRAGON
    ) {
        return "MAGIC";
    }
    if (attackType === "RANGE" || attackType === "MAGIC") return attackType;
    return "MELEE";
};
