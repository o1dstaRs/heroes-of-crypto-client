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

import { v4 as uuidv4 } from "uuid";

export enum AttackType {
    MELEE = "MELEE",
    RANGE = "RANGE",
    MAGIC = "MAGIC",
}

export enum TeamType {
    UPPER = 1,
    LOWER = 2,
}

export interface IModifyableUnitStats {
    hp: number;
    armor: number;
}

export class UnitStats {
    public readonly id: string;

    public readonly race: string;

    public readonly name: string;

    public readonly team: TeamType;

    public max_hp: number;

    public hp: number;

    public readonly steps: number;

    public steps_morale: number;

    public morale: number;

    public readonly luck: number;

    public readonly speed: number;

    public armor_mod: number;

    public base_armor: number;

    public range_armor: number;

    public readonly attack_type: AttackType;

    public attack_type_selected: AttackType;

    public readonly attack: number;

    public readonly attack_damage_min: number;

    public readonly attack_damage_max: number;

    public readonly attack_range: number;

    public range_shots: number;

    public range_shots_mod: number;

    public shot_distance: number;

    public readonly magic_resist: number;

    public magic_resist_mod: number;

    public readonly can_cast_spells: boolean;

    public can_fly: boolean;

    public exp: number;

    public readonly size: number;

    public readonly level: number;

    public readonly spells: string[];

    public readonly abilities: string[];

    public effects: string[];

    public amount_alive: number;

    public amount_died: number;

    public luck_per_turn: number;

    public attack_multiplier: number;

    public constructor(
        race: string,
        name: string,
        max_hp: number,
        steps: number,
        morale: number,
        luck: number,
        speed: number,
        base_armor: number,
        attack_type: AttackType,
        attack: number,
        attack_damage_min: number,
        attack_damage_max: number,
        attack_range: number,
        range_shots: number,
        shot_distance: number,
        magic_resist: number,
        can_fly: boolean,
        exp: number,
        size: number,
        level: number,
        spells: string[],
        abilities: string[],
        effects: string[],
        amount_alive: number,
        amount_died: number,
        team: TeamType,
    ) {
        this.id = uuidv4();
        this.race = race;
        this.name = name;
        this.hp = max_hp;
        this.max_hp = max_hp;
        this.steps = steps;
        this.steps_morale = 0;
        this.morale = morale;
        this.luck = luck;
        this.speed = speed;
        this.armor_mod = 0;
        this.base_armor = base_armor;
        this.range_armor = base_armor;
        this.attack_type = attack_type;
        this.attack_type_selected = attack_type;
        this.attack = attack;
        this.attack_damage_min = attack_damage_min;
        this.attack_damage_max = attack_damage_max;
        this.attack_range = attack_range;
        this.range_shots = range_shots;
        this.range_shots_mod = 0;
        this.shot_distance = shot_distance;
        this.magic_resist = magic_resist;
        this.magic_resist_mod = 0;
        this.can_cast_spells = spells.length > 0;
        this.can_fly = can_fly;
        this.exp = exp;
        this.size = size;
        this.level = level;
        this.spells = spells;
        this.abilities = abilities;
        this.effects = effects;
        this.luck_per_turn = 0;
        this.attack_multiplier = 1;
        this.amount_alive = amount_alive;
        this.amount_died = amount_died;
        this.team = team;
    }
}
