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

import { SceneLog } from "../menu/scene_log";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";

export function processFireShieldAbility(
    fromUnit: Unit,
    toUnit: Unit,
    sceneLog: SceneLog,
    unitsHolder: UnitsHolder,
    damageFromAttack: number,
    sceneStepCount: number,
): void {
    if (toUnit.isDead()) {
        return;
    }

    const fireShieldAbility = fromUnit.getAbility("Fire Shield");
    if (fireShieldAbility && !toUnit.hasAbilityActive("Fire Element")) {
        const fireShieldDmg = Math.ceil(damageFromAttack * fromUnit.calculateAbilityMultiplier(fireShieldAbility));
        toUnit.applyDamage(fireShieldDmg, sceneStepCount);
        DamageStatisticHolder.getInstance().add({
            unitName: fromUnit.getName(),
            damage: fireShieldDmg,
            team: fromUnit.getTeam(),
        });
        sceneLog.updateLog(`${toUnit.getName()} received (${fireShieldDmg}) from Fire Shield`);
        unitsHolder.refreshStackPowerForAllUnits();
    }
}
