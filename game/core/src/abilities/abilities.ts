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

import { GridSettings } from "../grid/grid_settings";
import { IFrameable, OnFramePosition } from "../menu/frameable";
import { TeamType } from "../units/units_stats";
import { Sprite } from "../utils/gl/Sprite";
import { Effect } from "../effects/effects";
import { XY } from "../utils/math";

export enum AbilityPowerType {
    TOTAL_DAMAGE_PERCENTAGE = "TOTAL_DAMAGE_PERCENTAGE",
    ADDITIONAL_DAMAGE_PERCENTAGE = "ADDITIONAL_DAMAGE_PERCENTAGE",
    UNLIMITED_RESPONSES = "UNLIMITED_RESPONSES",
    UNLIMITED_SUPPLIES = "UNLIMITED_SUPPLIES",
    UNLIMITED_RANGE = "UNLIMITED_RANGE",
    MAGIC_RESIST_100 = "MAGIC_RESIST_100",
    LIGHTNING_SPIN_ATTACK = "LIGHTNING_SPIN_ATTACK",
    FIRE_BREATH = "FIRE_BREATH",
    APPLY_EFFECT = "APPLY_EFFECT",
}

export enum AbilityType {
    ATTACK = "ATTACK",
    ADDITIONAL_ATTACK = "ADDITIONAL_ATTACK",
    RESPOND = "RESPOND",
    SUPPLIES = "SUPPLIES",
    DEFENCE = "DEFENCE",
    REFLECT = "REFLECT",
    STATUS = "STATUS",
    HEAL = "HEAL",
    UNIT_TYPE = "UNIT_TYPE",
}

export class AbilityStats {
    public readonly name: string;

    public readonly type: AbilityType;

    public readonly desc: string;

    public readonly power: number;

    public readonly power_type: AbilityPowerType;

    public readonly skip_response: boolean;

    public readonly effect: string | null;

    public constructor(
        name: string,
        type: AbilityType,
        desc: string,
        power: number,
        powerType: AbilityPowerType,
        skipResponse: boolean,
        effect: string | null,
    ) {
        this.name = name;
        this.type = type;
        this.desc = desc;
        this.power = power;
        this.power_type = powerType;
        this.skip_response = skipResponse;
        this.effect = effect;
    }
}

export class Ability implements IFrameable {
    private readonly abilityStats: AbilityStats;

    private readonly sprite: Sprite;

    private effect: Effect | undefined;

    public constructor(abilityStats: AbilityStats, sprite: Sprite, effect: Effect | undefined) {
        this.abilityStats = abilityStats;
        this.sprite = sprite;
        this.effect = effect;
    }

    public renderWithinFrame(gridSettings: GridSettings, framePosition: XY, onFramePosition: OnFramePosition): void {
        const xMul = (onFramePosition - 1) % 3;
        const yMul = Math.floor((onFramePosition - 1) / 3);

        this.sprite.setRect(
            framePosition.x + gridSettings.getHalfStep() + gridSettings.getStep() * xMul,
            framePosition.y - gridSettings.getHalfStep() + gridSettings.getStep() * (3 - yMul),
            gridSettings.getStep(),
            gridSettings.getStep(),
        );
        this.sprite.render();
    }

    public getName(): string {
        return this.abilityStats.name;
    }

    public getType(): AbilityType {
        return this.abilityStats.type;
    }

    public getDesc(): string {
        return this.abilityStats.desc;
    }

    public getPower(): number {
        return this.abilityStats.power;
    }

    public getPowerType(): AbilityPowerType {
        return this.abilityStats.power_type;
    }

    public getSkipResponse(): boolean {
        return this.abilityStats.skip_response;
    }

    public getEffect(): Effect | undefined {
        if (this.effect) {
            return this.effect;
        }

        return undefined;
    }

    public getEffectName(): string | undefined {
        return this.effect?.getName();
    }

    public hasEffect(effectName: string): boolean {
        if (this.effect && this.effect.getName() === effectName) {
            return true;
        }

        return false;
    }
}

export function getAbilitiesWithPosisionCoefficient(
    unitAbilities: Ability[],
    fromCell?: XY,
    toCell?: XY,
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
