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

import {
    AttackType,
    AbilityProperties,
    AuraEffectProperties,
    EffectProperties,
    HoCConstants,
    FactionType,
    TeamType,
    ToAttackType,
    UnitProperties,
    UnitType,
    ToAbilityType,
    ToAbilityPowerType,
} from "@heroesofcrypto/common";

import abilitiesJson from "./configuration/abilities.json";
import auraEffectsJson from "./configuration/aura_effects.json";
import effectsJson from "./configuration/effects.json";
import spellsJson from "./configuration/spells.json";
import creaturesJson from "./configuration/creatures.json";
import { SpellProperties } from "./spells/spells";

const DEFAULT_HERO_CONFIG = {
    hp: 120,
    steps: 3,
    speed: 2,
    armor: 12,
    attack_type: "MELEE",
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
    abilities_descriptions: [],
    abilities_stack_powered: [],
    applied_effects: [],
    applied_buffs: [],
    applied_debuffs: [],
    applied_effects_laps: [],
    applied_buffs_laps: [],
    applied_debuffs_laps: [],
    applied_buffs_descriptions: [],
    applied_debuffs_descriptions: [],
    abilities_auras: [],
    aura_effects: [],
    aura_ranges: [],
    aura_is_buff: [],
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

export const getHeroConfig = (
    team: TeamType,
    faction: FactionType,
    heroName: string,
    largeTextureName: string,
): UnitProperties => {
    const heroConfig = {
        ...DEFAULT_HERO_CONFIG,
        faction,
    };

    const luck = DEFAULT_LUCK_PER_FACTION[faction] ?? 0;
    const morale = DEFAULT_MORALE_PER_FACTION[faction] ?? 0;

    const attackType =
        heroConfig.attack_type && heroConfig.attack_type.constructor === String
            ? ToAttackType[heroConfig.attack_type as string]
            : undefined;
    if (attackType === undefined || attackType === AttackType.NO_TYPE) {
        throw new TypeError(`Invalid attack type for hero ${heroName} = ${attackType}`);
    }

    return new UnitProperties(
        faction,
        heroName,
        heroConfig.hp,
        heroConfig.steps,
        morale,
        luck,
        heroConfig.speed,
        heroConfig.armor,
        attackType,
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
        heroConfig.abilities_descriptions,
        heroConfig.abilities_stack_powered,
        heroConfig.abilities_auras,
        heroConfig.applied_effects,
        heroConfig.applied_buffs,
        heroConfig.applied_debuffs,
        heroConfig.applied_effects_laps,
        heroConfig.applied_buffs_laps,
        heroConfig.applied_debuffs_laps,
        heroConfig.applied_buffs_descriptions,
        heroConfig.applied_debuffs_descriptions,
        heroConfig.aura_effects,
        heroConfig.aura_ranges,
        heroConfig.aura_is_buff,
        1,
        0,
        team,
        UnitType.HERO,
        `${largeTextureName.split("_").slice(0, -1).join("_")}${heroConfig.size === 1 ? "_128" : "_256"}`,
        largeTextureName,
        HoCConstants.MIN_UNIT_STACK_POWER,
    );
};

export const getAbilityConfig = (abilityName: string): AbilityProperties => {
    // @ts-ignore: we do not know the type here yet
    const ability = abilitiesJson[abilityName];
    if (!ability) {
        throw TypeError(`Unknown ability - ${abilityName}`);
    }

    const abilityType = ToAbilityType[ability.type];
    if (!abilityType) {
        throw new TypeError(`Invalid type for ability ${abilityName} = ${abilityType}`);
    }

    const abilityPowerType = ToAbilityPowerType[ability.power_type];
    if (!abilityPowerType) {
        throw new TypeError(`Invalid power type for ability ${abilityName} = ${abilityPowerType}`);
    }

    return new AbilityProperties(
        abilityName,
        abilityType,
        ability.desc,
        ability.power,
        abilityPowerType,
        ability.skip_reponse,
        ability.stack_powered,
        ability.effect,
        ability.aura_effect,
    );
};

export const getCreatureConfig = (
    team: TeamType,
    faction: FactionType,
    creatureName: string,
    largeTextureName: string,
    amount: number,
    totalExp?: number,
): UnitProperties => {
    // @ts-ignore: we do not know the type here yet
    const factionUnits = creaturesJson[faction];
    if (!factionUnits) {
        throw TypeError(`Unknown faction - ${faction}`);
    }

    const creatureConfig = factionUnits[creatureName];
    if (!creatureConfig) {
        throw TypeError(`Unknown creature - ${creatureName}`);
    }

    const attackType =
        creatureConfig.attack_type && creatureConfig.attack_type.constructor === String
            ? ToAttackType[creatureConfig.attack_type as string]
            : undefined;
    if (attackType === undefined || attackType === AttackType.NO_TYPE) {
        throw new TypeError(`Invalid attack type for creature ${creatureName} = ${attackType}`);
    }

    const luck = DEFAULT_LUCK_PER_FACTION[faction] ?? 0;
    const morale = DEFAULT_MORALE_PER_FACTION[faction] ?? 0;

    const abilityAuraRanges: number[] = [];
    const abilityDescriptions: string[] = [];
    const abilityIsStackPowered: boolean[] = [];
    const abilityIsAura: boolean[] = [];
    const abilityAuraIsBuff: boolean[] = [];

    for (const abilityName of creatureConfig.abilities) {
        const abilityConfig = getAbilityConfig(abilityName);

        if (!abilityConfig) {
            throw new TypeError(`Unable to get config for ability ${abilityName} and creature ${creatureName}`);
        }

        if (!abilityConfig.desc) {
            throw new TypeError(`No description for ability ${abilityName} and creature ${creatureName}`);
        }

        if (abilityConfig.power === null || abilityConfig.power === undefined) {
            throw new TypeError(`No power for ability ${abilityName} and creature ${creatureName}`);
        }

        abilityDescriptions.push(abilityConfig.desc.replace(/\{\}/g, abilityConfig.power.toString()));
        abilityIsStackPowered.push(abilityConfig.stack_powered);

        const auraEffect = abilityConfig.aura_effect;
        if (auraEffect) {
            const auraConfig = getAuraEffectConfig(auraEffect);
            abilityAuraRanges.push(auraConfig?.range ?? 0);
            abilityAuraIsBuff.push(auraConfig?.is_buff ?? true);
        } else {
            abilityAuraRanges.push(0);
            abilityAuraIsBuff.push(true);
        }

        abilityIsAura.push(!!abilityConfig.aura_effect);
    }

    return new UnitProperties(
        faction,
        creatureConfig.name,
        creatureConfig.hp,
        creatureConfig.steps,
        morale,
        luck,
        creatureConfig.speed,
        creatureConfig.armor,
        attackType,
        creatureConfig.attack,
        creatureConfig.attack_damage_min,
        creatureConfig.attack_damage_max,
        creatureConfig.attack_range,
        creatureConfig.range_shots,
        creatureConfig.shot_distance,
        creatureConfig.magic_resist,
        creatureConfig.can_fly,
        creatureConfig.exp,
        creatureConfig.size,
        creatureConfig.level,
        structuredClone(creatureConfig.spells),
        creatureConfig.abilities,
        abilityDescriptions,
        abilityIsStackPowered,
        abilityIsAura,
        [], // creatureConfig.effects,
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        creatureConfig.aura_effects,
        abilityAuraRanges,
        abilityAuraIsBuff,
        amount > 0 ? amount : Math.ceil((totalExp ?? 0) / creatureConfig.exp),
        0,
        team,
        UnitType.CREATURE,
        `${largeTextureName.split("_").slice(0, -1).join("_")}${creatureConfig.size === 1 ? "_128" : "_256"}`,
        largeTextureName,
        HoCConstants.MAX_UNIT_STACK_POWER,
    );
};

export const getSpellConfig = (faction: FactionType, spellName: string): SpellProperties => {
    // @ts-ignore: we do not know the type here yet
    const raceSpells = spellsJson[faction];
    if (!raceSpells) {
        throw TypeError(`Unknown race - ${faction}`);
    }

    const spellConfig = raceSpells[spellName];
    if (!spellConfig) {
        throw TypeError(`Unknown spell - ${spellName}`);
    }

    return new SpellProperties(
        faction,
        spellConfig.name,
        spellConfig.level,
        spellConfig.desc,
        spellConfig.target,
        spellConfig.power,
        spellConfig.laps,
        spellConfig.self_cast_allowed,
        spellConfig.self_debuff_applies,
    );
};

export const getEffectConfig = (effectName: string): EffectProperties | undefined => {
    // @ts-ignore: we do not know the type here yet
    const effect = effectsJson[effectName];
    if (!effect) {
        return undefined;
    }

    return new EffectProperties(effectName, effect.laps, effect.desc);
};

export const getAuraEffectConfig = (auraEffectName: string): AuraEffectProperties | undefined => {
    // @ts-ignore: we do not know the type here yet
    const auraEffect = auraEffectsJson[auraEffectName];
    if (!auraEffect) {
        return undefined;
    }

    return new AuraEffectProperties(
        auraEffectName,
        auraEffect.range,
        auraEffect.desc,
        auraEffect.power,
        auraEffect.is_buff,
    );
};
