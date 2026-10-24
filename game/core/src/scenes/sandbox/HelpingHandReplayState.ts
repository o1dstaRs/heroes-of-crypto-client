import { AppliedSpell, Effect, type EffectProperties, type UnitProperties } from "@heroesofcrypto/common";

export interface ReplayAppliedSpellState {
    name: string;
    power: number;
    laps: number;
    firstProperty?: number;
    secondProperty?: number;
}

export interface HelpingHandReplayStatState {
    initialStats: Pick<
        UnitProperties,
        | "max_hp"
        | "base_armor"
        | "armor_mod"
        | "base_attack"
        | "attack_mod"
        | "attack_damage_min"
        | "attack_damage_max"
        | "magic_resist"
        | "initiative"
        | "steps"
        | "shot_distance"
        | "luck"
        | "morale"
    >;
    buffs: ReplayAppliedSpellState[];
    debuffs: ReplayAppliedSpellState[];
    effects: { defaults: EffectProperties; properties: EffectProperties }[];
    adjustedBaseStatsLaps: number[];
    luckPerTurn: number;
}

export function captureReplayAppliedSpell(spell: AppliedSpell): ReplayAppliedSpellState {
    return {
        name: spell.getName(),
        power: spell.getPower(),
        laps: spell.getLaps(),
        firstProperty: spell.getFirstSpellProperty(),
        secondProperty: spell.getSecondSpellProperty(),
    };
}

export function restoreReplayAppliedSpell(state: ReplayAppliedSpellState): AppliedSpell {
    return new AppliedSpell(state.name, state.power, state.laps, state.firstProperty, state.secondProperty);
}

export function restoreReplayEffect(state: HelpingHandReplayStatState["effects"][number]): Effect {
    const effect = new Effect(structuredClone(state.defaults));
    Object.assign(effect.getProperties(), structuredClone(state.properties));
    return effect;
}
