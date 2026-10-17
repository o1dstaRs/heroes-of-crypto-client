import type { UnitProperties } from "@heroesofcrypto/common";
import type { CreatureAnimationLabSpell, CreatureAnimationLabState } from "../pixi/PixiScene";

type Selection = Pick<UnitProperties, "name" | "abilities" | "spells"> | null;
const abilityForEffect: Partial<Record<CreatureAnimationLabState, string>> = {
    unicorn_retaliation: "One in the Field",
    unicorn_blindness: "Blindness",
    battle_roar_short: "Battle Roar",
    battle_roar_long: "Battle Roar",
    ai_brain: "AI Driven",
    paralysis: "Paralysis",
    boar_saliva: "Boar Saliva",
    infest_hatch: "Infest",
    infest_hatch_queen: "Infest",
    predatory_assimilation: "Predatory Assimilation",
    angel_resurrection: "Resurrection",
    devour_essence: "Devour Essence",
    crusade: "Crusade",
    unyielding_power: "Unyielding Power",
    enchanted_skin: "Enchanted Skin",
    made_of_fire: "Made of Fire",
    magic_reflection: "Magic Reflection",
    deep_wounds_1: "Deep Wounds Level 1",
    deep_wounds_2: "Deep Wounds Level 2",
    deep_wounds_3: "Deep Wounds Level 3",
    dulling_defense: "Dulling Defense",
    absolving_arrow: "Absolving Arrow",
    borrowed_grace: "Borrowed Grace",
};
const spellsForEffect: Partial<Record<CreatureAnimationLabState, readonly string[]>> = {
    empower: ["Empower"],
    ogre_riot: ["Riot", "Mass Riot"],
    ogre_magic_mirror: ["Magic Mirror", "Mass Magic Mirror"],
};
const castAbilities = ["Battle Roar", "Resurrection", "Chain Lightning", "Castling", "Chakram", "Vine Throw"];

export function creatureLabHasSpell(unit: Selection, name: string): boolean {
    return !!unit?.spells.some((entry) => entry.slice(entry.indexOf(":") + 1) === name);
}

/** Preview controls describe the selected creature's own abilities, never effects it can merely receive. */
export function canPreviewCreatureLabState(unit: Selection, state: CreatureAnimationLabState): boolean {
    if (!unit) return false;
    if (state.startsWith("common_")) return false;
    const ability = abilityForEffect[state];
    if (ability) {
        if (state === "enchanted_skin" && unit.name !== "Black Dragon") return false;
        return unit.abilities.includes(ability);
    }
    const spells = spellsForEffect[state];
    if (spells) return spells.some((name) => creatureLabHasSpell(unit, name));
    if (state === "cast") return unit.spells.length > 0 || castAbilities.some((name) => unit.abilities.includes(name));
    return true;
}

export const creatureLabSpellOptions: ReadonlyArray<{ name: CreatureAnimationLabSpell; label: string }> = [
    { name: "Lightning Strike", label: "Lightning Strike · Молния" },
    { name: "Whirlpool", label: "Whirlpool · Водоворот" },
    { name: "Ring of Fire", label: "Ring of Fire · Кольцо огня" },
    { name: "Meteor Shower", label: "Meteor Shower · Метеоритный дождь" },
    { name: "Fire Wall", label: "Fire Wall · Стена огня" },
];
