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

import { Unit } from "../units/units";

export function processPenetratingBiteAbility(fromUnit: Unit, toUnit: Unit): number {
    const penetratingBiteAbility = fromUnit.getAbility("Penetrating Bite");
    if (!penetratingBiteAbility) {
        return 0;
    }

    const biteDamage = Math.floor(
        (fromUnit.calculateAbilityMultiplier(penetratingBiteAbility) - 1) * toUnit.getMaxHp(),
    );

    return biteDamage;
}
