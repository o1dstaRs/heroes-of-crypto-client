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

export class AuraEffectProperties {
    public readonly name: string;

    public range: number;

    public readonly desc: string;

    public constructor(name: string, range: number, desc: string) {
        this.name = name;
        this.range = range;
        this.desc = desc;
    }
}

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

    public extendRange(): void {
        this.auraEffectProperties.range += 1;
    }

    public toDefault(): void {
        this.auraEffectProperties = structuredClone(this.defaultProperties);
    }

    public narrowRange(): void {
        if (this.auraEffectProperties.range > 0) {
            this.auraEffectProperties.range -= 1;
        }
        if (this.auraEffectProperties.range < 0) {
            this.auraEffectProperties.range = 0;
        }
    }
}
