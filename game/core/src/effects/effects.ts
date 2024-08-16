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

import { EffectProperties } from "@heroesofcrypto/common";

export class Effect {
    private readonly defaultProperties: EffectProperties;

    private effectProperties: EffectProperties;

    public constructor(effectProperties: EffectProperties) {
        this.defaultProperties = effectProperties;
        this.effectProperties = structuredClone(this.defaultProperties);
    }

    public getName(): string {
        return this.effectProperties.name;
    }

    public getDesc(): string {
        return this.effectProperties.desc;
    }

    public getLaps(): number {
        return this.effectProperties.laps;
    }

    public getPower(): number {
        return this.effectProperties.power;
    }

    public getProperties(): EffectProperties {
        return this.effectProperties;
    }

    public setPower(power: number): void {
        this.effectProperties.power = power;
    }

    public extend(): void {
        if (this.effectProperties.laps === Number.MAX_SAFE_INTEGER) {
            return;
        }

        this.effectProperties.laps += 1;
    }

    public getDefaultProperties(): EffectProperties {
        return structuredClone(this.defaultProperties);
    }

    public minusLap(): void {
        if (this.effectProperties.laps === Number.MAX_SAFE_INTEGER) {
            return;
        }

        if (this.effectProperties.laps > 0) {
            this.effectProperties.laps -= 1;
        }
        if (this.effectProperties.laps < 0) {
            this.effectProperties.laps = 0;
        }
    }
}
