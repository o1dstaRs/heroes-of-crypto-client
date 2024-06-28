/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { AttackType, FactionType, TeamType, UnitProperties, UnitType } from "@heroesofcrypto/common";

import unitsJson from "./configuration/units.json";
import spellsJson from "./configuration/spells.json";
import abilitiesJson from "./configuration/abilities.json";
import effectsJson from "./configuration/effects.json";
import { SpellStats } from "./spells/spells";
import { AbilityStats } from "./abilities/abilities";
import { EffectStats } from "./effects/effects";

const DEFAULT_HERO_CONFIG = {
    hp: 120,
    steps: 3,
    speed: 2,
    armor: 12,
    attack_type: AttackType.MELEE,
    attack: 12,
    attack_damage_min: 15,
    attack_damage_max: 25,
    attack_range: 1,
    range_shots: 10,
    shot_distance: 5,
    magic_resists: 5,
    can_fly: false,
    exp: 0,
    size: 1,
    level: 1,
    spells: [],
    abilities: [],
    effects: [],
};

const DEFAULT_LUCK_PER_FACTION = {
    [FactionType.NO_TYPE]: 0,
    [FactionType.MIGHT]: 1,
    [FactionType.CHAOS]: -1,
    [FactionType.NATURE]: 4,
    [FactionType.LIFE]: 1,
    [FactionType.DEATH]: -2,
};

const DEFAULT_MORALE_PER_FACTION = {
    [FactionType.NO_TYPE]: 0,
    [FactionType.MIGHT]: 3,
    [FactionType.CHAOS]: -1,
    [FactionType.NATURE]: 1,
    [FactionType.LIFE]: 4,
    [FactionType.DEATH]: -4,
};

export const getHeroConfig = (team: TeamType, faction: FactionType): UnitProperties => {
    const heroConfig = {
        ...DEFAULT_HERO_CONFIG,
        name: "Hero",
        faction,
    };

    const luck = DEFAULT_LUCK_PER_FACTION[faction] ?? 0;
    const morale = DEFAULT_MORALE_PER_FACTION[faction] ?? 0;

    return new UnitProperties(
        faction,
        heroConfig.name,
        heroConfig.hp,
        heroConfig.steps,
        morale,
        luck,
        heroConfig.speed,
        heroConfig.armor,
        heroConfig.attack_type,
        heroConfig.attack,
        heroConfig.attack_damage_min,
        heroConfig.attack_damage_max,
        heroConfig.attack_range,
        heroConfig.range_shots,
        heroConfig.shot_distance,
        heroConfig.magic_resists,
        heroConfig.can_fly,
        heroConfig.exp,
        heroConfig.size,
        heroConfig.level,
        structuredClone(heroConfig.spells),
        heroConfig.abilities,
        heroConfig.effects,
        1,
        0,
        team,
        UnitType.HERO,
    );
};

export const getUnitConfig = (
    team: TeamType,
    faction: FactionType,
    unitName: string,
    amount: number,
    totalExp?: number,
): UnitProperties => {
    // @ts-ignore: we do not know the type here yet
    const raceUnits = unitsJson[faction];
    if (!raceUnits) {
        throw TypeError(`Unknown race - ${faction}`);
    }

    const unitStatsConfig = raceUnits[unitName];
    if (!unitStatsConfig) {
        throw TypeError(`Unknown unit - ${unitName}`);
    }

    const luck = DEFAULT_LUCK_PER_FACTION[faction] ?? 0;
    const morale = DEFAULT_MORALE_PER_FACTION[faction] ?? 0;

    return new UnitProperties(
        faction,
        unitStatsConfig.name,
        unitStatsConfig.hp,
        unitStatsConfig.steps,
        morale,
        luck,
        unitStatsConfig.speed,
        unitStatsConfig.armor,
        unitStatsConfig.attack_type,
        unitStatsConfig.attack,
        unitStatsConfig.attack_damage_min,
        unitStatsConfig.attack_damage_max,
        unitStatsConfig.attack_range,
        unitStatsConfig.range_shots,
        unitStatsConfig.shot_distance,
        unitStatsConfig.magic_resist,
        unitStatsConfig.can_fly,
        unitStatsConfig.exp,
        unitStatsConfig.size,
        unitStatsConfig.level,
        structuredClone(unitStatsConfig.spells),
        unitStatsConfig.abilities,
        unitStatsConfig.effects,
        amount > 0 ? amount : Math.ceil((totalExp ?? 0) / unitStatsConfig.exp),
        0,
        team,
        UnitType.CREATURE,
    );
};

export const getSpellConfig = (faction: FactionType, spellName: string): SpellStats => {
    // @ts-ignore: we do not know the type here yet
    const raceSpells = spellsJson[faction];
    if (!raceSpells) {
        throw TypeError(`Unknown race - ${faction}`);
    }

    const spellStatsConfig = raceSpells[spellName];
    if (!spellStatsConfig) {
        throw TypeError(`Unknown spell - ${spellName}`);
    }

    return new SpellStats(
        faction,
        spellStatsConfig.name,
        spellStatsConfig.level,
        spellStatsConfig.desc,
        spellStatsConfig.target,
        spellStatsConfig.power,
        spellStatsConfig.laps,
        spellStatsConfig.self_cast_allowed,
        spellStatsConfig.self_debuff_applies,
    );
};

export const getAbilityConfig = (abilityName: string): AbilityStats => {
    // @ts-ignore: we do not know the type here yet
    const Abilities = abilitiesJson[abilityName];
    if (!Abilities) {
        throw TypeError(`Unknown ability type - ${abilityName}`);
    }

    return new AbilityStats(
        abilityName,
        Abilities.type,
        Abilities.desc,
        Abilities.power,
        Abilities.power_type,
        Abilities.skip_reponse,
        Abilities.effect,
    );
};

export const getEffectConfig = (effectName: string): EffectStats | undefined => {
    // @ts-ignore: we do not know the type here yet
    const effect = effectsJson[effectName];
    if (!effect) {
        return undefined;
    }

    return new EffectStats(effectName, effect.laps, effect.desc);
};
