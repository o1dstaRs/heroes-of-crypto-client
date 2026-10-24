import type { UnitProperties } from "@heroesofcrypto/common";
import type { CreatureAnimationLabSpell, CreatureAnimationLabState } from "../pixi/PixiScene";

type Selection = Pick<UnitProperties, "name" | "abilities" | "spells"> | null;
const abilityForEffect: Partial<Record<CreatureAnimationLabState, string>> = {
    bitter_experience: "Bitter Experience",
    dodge: "Dodge",
    small_specie: "Small Specie",
    backstab: "Backstab",
    unicorn_retaliation: "One in the Field",
    unicorn_blindness: "Blindness",
    battle_roar_short: "Battle Roar",
    battle_roar_long: "Battle Roar",
    ai_brain: "AI Driven",
    stun: "Stun",
    paralysis: "Paralysis",
    boar_saliva: "Boar Saliva",
    penetrating_bite: "Penetrating Bite",
    piercing_spear: "Piercing Spear",
    shadow_touch: "Shadow Touch",
    wild_regeneration: "Wild Regeneration",
    wild_regeneration_engine: "Wild Regeneration",
    petrifying_gaze: "Petrifying Gaze",
    aggr: "Aggr",
    terrifying_gaze: "Terrifying Gaze",
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
    hamstring: "Hamstring",
    lucky_strike: "Lucky Strike",
    shatter_armor: "Shatter Armor",
    leather_armor: "Leather Armor",
    blind_fury: "Blind Fury",
    miner: "Miner",
    madness: "Madness",
    absolving_arrow: "Absolving Arrow",
    borrowed_grace: "Borrowed Grace",
};
const spellsForEffect: Partial<Record<CreatureAnimationLabState, readonly string[]>> = {
    blacksmith_double_punch: ["Craft"],
    blacksmith_double_shot: ["Craft"],
    blacksmith_frozen_sword: ["Craft"],
    blacksmith_frozen_bow: ["Craft"],
    blacksmith_craft: ["Craft"],
    blacksmith_armor: ["Armor Rune"],
    blacksmith_weapon: ["Weapon Rune"],
    mage_misfortune: ["Misfortune"],
    mage_fireforged: ["Fireforged Sword"],
    single_heal: ["Heal"],
    empower: ["Empower"],
    satyr_courage: ["Courage"],
    satyr_helping_hand: ["Helping Hand"],
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
    if (state === "water_shield_break") return unit.name === "Mermaid";
    if (state === "stun") return unit.abilities.includes("Stun") || unit.abilities.includes("Stun Aura");
    if (state === "wind_flow") return unit.abilities.includes("Wind Flow") || creatureLabHasSpell(unit, "Wind Flow");
    if (state.startsWith("beholder_debuff_")) return unit.abilities.includes("Spit Ball");
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
    { name: "Fireball", label: "Fireball · Огненный шар" },
    { name: "Smoke", label: "Smoke · Дым" },
    { name: "Ring of Fire", label: "Ring of Fire · Кольцо огня" },
    { name: "Meteor Shower", label: "Meteor Shower · Метеоритный дождь" },
    { name: "Fire Wall", label: "Fire Wall · Стена огня" },
];
