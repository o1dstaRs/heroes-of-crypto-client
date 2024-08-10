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

import { getAuraEffectConfig, getEffectConfig } from "../config_provider";
import { AuraEffect, AuraEffectProperties } from "./aura_effects";
import { Effect, EffectProperties } from "./effects";

export class EffectsFactory {
    public constructor() {}

    public makeEffect(name: string | null): Effect | undefined {
        if (!name) {
            return undefined;
        }

        const config = getEffectConfig(name);
        if (!(config instanceof EffectProperties)) {
            return undefined;
        }

        return new Effect(config);
    }

    public makeAuraEffect(name: string | null): AuraEffect | undefined {
        if (!name) {
            return undefined;
        }

        const config = getAuraEffectConfig(name);
        if (!(config instanceof AuraEffectProperties)) {
            return undefined;
        }

        return new AuraEffect(config);
    }
}
