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
    AbilityProperties,
    AbilityType,
    AbilityPowerType,
    GridSettings,
    HoCMath,
    TeamType,
} from "@heroesofcrypto/common";

import { IFrameable, OnFramePosition } from "../menu/frameable";
import { Sprite } from "../utils/gl/Sprite";
import { Effect } from "../effects/effects";

export class Ability implements IFrameable {
    private readonly abilityProperties: AbilityProperties;

    private readonly sprite: Sprite;

    private readonly effect: Effect | undefined;

    public constructor(abilityProperties: AbilityProperties, sprite: Sprite, effect: Effect | undefined) {
        this.abilityProperties = abilityProperties;
        this.sprite = sprite;
        this.effect = effect;
    }

    public renderWithinFrame(
        gridSettings: GridSettings,
        framePosition: HoCMath.XY,
        onFramePosition: OnFramePosition,
    ): void {
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
            return this.effect;
        }

        return undefined;
    }

    public getEffectName(): string | undefined {
        return this.effect?.getName();
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
