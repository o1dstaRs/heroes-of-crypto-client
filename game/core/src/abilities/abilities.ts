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

import { AbilityProperties, AbilityType, AbilityPowerType, HoCMath, TeamType } from "@heroesofcrypto/common";
import { AuraEffect } from "../effects/aura_effects";

import { Effect } from "../effects/effects";
import { processLuckyStrikeAbility } from "./lucky_strike_ability";

export class Ability {
    private readonly abilityProperties: AbilityProperties;

    private readonly effect: Effect | undefined;

    private readonly auraEffect: AuraEffect | undefined;

    public constructor(
        abilityProperties: AbilityProperties,
        effect: Effect | undefined,
        auraEffect: AuraEffect | undefined,
    ) {
        this.abilityProperties = abilityProperties;
        this.effect = effect;
        this.auraEffect = auraEffect;
    }

    public getName(): string {
        return this.abilityProperties.name;
    }

    public getType(): AbilityType {
        return this.abilityProperties.type;
    }

    public getDesc(): string {
        return this.abilityProperties.desc;
    }

    public getPower(): number {
        return this.abilityProperties.power;
    }

    public getPowerType(): AbilityPowerType {
        return this.abilityProperties.power_type;
    }

    public getSkipResponse(): boolean {
        return this.abilityProperties.skip_response;
    }

    public getEffect(): Effect | undefined {
        if (this.effect) {
            this.effect.toDefault();
            return this.effect;
        }

        return undefined;
    }

    public getEffectName(): string | undefined {
        return this.effect?.getName();
    }

    public getAuraEffect(): AuraEffect | undefined {
        if (this.auraEffect) {
            this.auraEffect.toDefault();
            return this.auraEffect;
        }

        return undefined;
    }

    public getAuraEffectName(): string | undefined {
        return this.auraEffect?.getName();
    }
}

export function getAbilitiesWithPosisionCoefficient(
    unitAbilities: Ability[],
    fromCell?: HoCMath.XY,
    toCell?: HoCMath.XY,
    toUnitSmallSize?: boolean,
    fromUnitTeam?: TeamType,
): Ability[] {
    const abilities: Ability[] = [];
    if (!unitAbilities?.length || !fromCell || !toCell) {
        return abilities;
    }

    for (const a of unitAbilities) {
        if (a.getName() === "Backstab") {
            const aY = fromCell.y;
            const tY = toCell.y;

            if (fromUnitTeam === TeamType.LOWER && aY > tY) {
                abilities.push(a);
            }

            if (fromUnitTeam === TeamType.UPPER && aY < tY - (toUnitSmallSize ? 0 : 1)) {
                abilities.push(a);
            }
        }
    }

    return abilities;
}

export function getAbilitiesWithChanceMultiplier(unitAbilities: Ability[]): Ability[] {
    const abilities: Ability[] = [];

    for (const a of unitAbilities) {
        if (processLuckyStrikeAbility(a)) {
            console.log("Lucky Strike!");
            abilities.push(a);
        }
    }

    return abilities;
}
