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

import { getAbilityConfig } from "../config_provider";
import { EffectsFactory } from "../effects/effects_factory";
import { Ability } from "./abilities";

export const abilityToTextureName = (abilityName: string): string =>
    `${abilityName.toLowerCase().replace(/ /g, "_")}_256`;

export class AbilitiesFactory {
    protected readonly effectsFactory: EffectsFactory;

    public constructor(effectsFactory: EffectsFactory) {
        this.effectsFactory = effectsFactory;
    }

    public makeAbility(name: string) {
        const abilityConfig = getAbilityConfig(name);

        return new Ability(abilityConfig, this.effectsFactory.makeEffect(abilityConfig.effect));
    }
}
