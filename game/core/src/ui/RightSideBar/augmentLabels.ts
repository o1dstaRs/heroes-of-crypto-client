import { Augment } from "@heroesofcrypto/common";

export const armorAugmentLabel = (augment: Augment.ArmorAugment): string => {
    const power = Augment.getArmorPower(augment);
    return `+${power}% Armor & +${power} Magic Armor`;
};
