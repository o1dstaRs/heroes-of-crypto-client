import { Augment } from "@heroesofcrypto/common";

/** One line per augment kind, level-agnostic — what the pick card and the portal's hover cards both open with. */
export const AUGMENT_DESCRIPTIONS: Record<Augment.AugmentType["type"], string> = {
    Placement: "Expands the deployment zone before battle.",
    Armor: "Raises physical Armor and adds flat Magic Armor to every unit.",
    Might: "Increases every unit's melee attack damage.",
    Empower: "Increases magic damage from spells, abilities and effects.",
    Sniper: "Increases ranged attack damage and effective shooting range.",
    Movement: "Adds movement steps to every unit.",
};

export const armorAugmentLabel = (augment: Augment.ArmorAugment): string => {
    const power = Augment.getArmorPower(augment);
    return `+${power}% Armor & +${power} Magic Armor`;
};
