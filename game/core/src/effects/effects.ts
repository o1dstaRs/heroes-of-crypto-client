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

export class EffectProperties {
    public readonly name: string;

    public laps: number;

    public readonly desc: string;

    public constructor(name: string, laps: number, desc: string) {
        this.name = name;
        this.laps = laps;
        this.desc = desc;
    }
}

export class Effect {
    public readonly defaultProperties: EffectProperties;

    public effectProperties: EffectProperties;

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

    public getProperties(): EffectProperties {
        return this.effectProperties;
    }

    public extend(): void {
        this.effectProperties.laps += 1;
    }

    public toDefault(): void {
        this.effectProperties = structuredClone(this.defaultProperties);
    }

    public minusLap(): void {
        if (this.effectProperties.laps > 0) {
            this.effectProperties.laps -= 1;
        }
        if (this.effectProperties.laps < 0) {
            this.effectProperties.laps = 0;
        }
    }
}
