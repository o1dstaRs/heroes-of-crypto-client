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

import { AbilityPowerType, AttackType, AuraEffectProperties } from "@heroesofcrypto/common";

export class AuraEffect {
    public readonly defaultProperties: AuraEffectProperties;

    public auraEffectProperties: AuraEffectProperties;

    public constructor(effectProperties: AuraEffectProperties) {
        this.defaultProperties = effectProperties;
        this.auraEffectProperties = structuredClone(this.defaultProperties);
    }

    public getName(): string {
        return this.auraEffectProperties.name;
    }

    public getDesc(): string {
        return this.auraEffectProperties.desc;
    }

    public getRange(): number {
        return this.auraEffectProperties.range;
    }

    public getProperties(): AuraEffectProperties {
        return this.auraEffectProperties;
    }

    public getPower(): number {
        return this.auraEffectProperties.power;
    }

    public extendRange(): void {
        this.auraEffectProperties.range = Math.floor(this.auraEffectProperties.range) + 1;
    }

    public toDefault(): void {
        this.auraEffectProperties = structuredClone(this.defaultProperties);
    }

    public getPowerType(): AbilityPowerType {
        return this.auraEffectProperties.power_type;
    }

    public setPower(power: number): void {
        this.auraEffectProperties.power = power;
    }

    public narrowRange(): void {
        this.auraEffectProperties.range = Math.floor(this.auraEffectProperties.range) - 1;
        if (this.auraEffectProperties.range < -1) {
            this.auraEffectProperties.range = -1;
        }
    }
}

export function canBeApplied(unitAttackType: AttackType, auraEffectProperties: AuraEffectProperties): boolean {
    if (auraEffectProperties.power_type === AbilityPowerType.LUCK_10) {
        return true;
    }

    if (
        unitAttackType === AttackType.RANGE &&
        auraEffectProperties.power_type === AbilityPowerType.DISABLE_RANGE_ATTACK
    ) {
        return true;
    }

    if (
        unitAttackType === AttackType.MELEE &&
        auraEffectProperties.power_type === AbilityPowerType.ADDITIONAL_MELEE_DAMAGE_PERCENTAGE
    ) {
        return true;
    }

    return false;
}
