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

export function processRapidChargeAbility(attackerUnit: Unit, chargeDistanceCells: number): number {
    let abilityMultiplier = 1;

    const rapidChargeAbility = attackerUnit.getAbility("Rapid Charge");
    if (rapidChargeAbility) {
        let rapidChargeMultiplier = attackerUnit.calculateAbilityMultiplier(rapidChargeAbility);
        if (rapidChargeMultiplier < abilityMultiplier) {
            return abilityMultiplier;
        }

        rapidChargeMultiplier = (rapidChargeMultiplier - 1) * chargeDistanceCells;

        return abilityMultiplier + rapidChargeMultiplier;
    }

    return abilityMultiplier;
}
