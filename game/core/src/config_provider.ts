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

import unitsJson from "./configuration/units.json";
import spellsJson from "./configuration/spells.json";
import abilitiesJson from "./configuration/abilities.json";
import effectsJson from "./configuration/effects.json";
import { SpellStats } from "./spells/spells";
import { TeamType, UnitStats } from "./units/units_stats";
import { AbilityStats } from "./abilities/abilities";
import { EffectStats } from "./effects/effects";

export const getUnitConfig = (
    team: TeamType,
    raceName: string,
    unitName: string,
    amount: number,
    totalExp?: number,
): UnitStats => {
    // @ts-ignore: we do not know the type here yet
    const raceUnits = unitsJson[raceName];
    if (!raceUnits) {
        throw TypeError(`Unknown race - ${raceName}`);
    }

    const unitStatsConfig = raceUnits[unitName];
    if (!unitStatsConfig) {
        throw TypeError(`Unknown unit - ${unitName}`);
    }

    return new UnitStats(
        raceName,
        unitStatsConfig.name,
        unitStatsConfig.hp,
        unitStatsConfig.steps,
        unitStatsConfig.morale,
        unitStatsConfig.luck,
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
    );
};

export const getSpellConfig = (raceName: string, spellName: string): SpellStats => {
    // @ts-ignore: we do not know the type here yet
    const raceSpells = spellsJson[raceName];
    if (!raceSpells) {
        throw TypeError(`Unknown race - ${raceName}`);
    }

    const spellStatsConfig = raceSpells[spellName];
    if (!spellStatsConfig) {
        throw TypeError(`Unknown spell - ${spellName}`);
    }

    return new SpellStats(
        raceName,
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
