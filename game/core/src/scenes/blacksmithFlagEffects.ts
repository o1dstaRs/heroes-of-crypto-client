export const BLACKSMITH_CRAFT_FLAGS = {
    "Crafted Double Punch": "blacksmith_double_punch",
    "Crafted Double Shot": "blacksmith_double_shot",
    "Crafted Frozen Sword": "blacksmith_frozen_sword",
    "Crafted Frozen Bow": "blacksmith_frozen_bow",
} as const;
export const BLACKSMITH_FLAG_KINDS = [
    "blacksmith_craft",
    "blacksmith_armor",
    "blacksmith_weapon",
    ...Object.values(BLACKSMITH_CRAFT_FLAGS),
] as const;
export type BlacksmithFlagKind = (typeof BLACKSMITH_FLAG_KINDS)[number];

export function blacksmithCraftFlagKind(ability: string | undefined): BlacksmithFlagKind | undefined {
    return ability && Object.hasOwn(BLACKSMITH_CRAFT_FLAGS, ability)
        ? BLACKSMITH_CRAFT_FLAGS[ability as keyof typeof BLACKSMITH_CRAFT_FLAGS]
        : undefined;
}

export function isBlacksmithSpell(spellName: string): boolean {
    return spellName === "Craft" || !!blacksmithRuneFlagKind(spellName);
}

export function blacksmithRuneFlagKind(spellName: string): BlacksmithFlagKind | undefined {
    if (spellName === "Armor Rune") return "blacksmith_armor";
    if (spellName === "Weapon Rune") return "blacksmith_weapon";
    return undefined;
}
