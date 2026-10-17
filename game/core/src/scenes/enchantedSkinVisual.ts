/** Only the active immunity on Black Dragon owns the purple shield shown on its card. */
export function showsEnchantedSkinShield(unit: {
    getName(): string;
    hasAbilityActive(name: string): boolean;
    isDead(): boolean;
}): boolean {
    return unit.hasAbilityActive("Enchanted Skin") && unit.getName() === "Black Dragon" && !unit.isDead();
}
