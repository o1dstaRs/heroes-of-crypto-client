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

import { AttackType, HoCLib } from "@heroesofcrypto/common";

import { SceneLog } from "../menu/scene_log";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";
import { processFireShieldAbility } from "./fire_shield_ability";

export function processDoublePunchAbility(
    fromUnit: Unit,
    toUnit: Unit,
    sceneLog: SceneLog,
    unitsHolder: UnitsHolder,
    sceneStepCount: number,
): boolean {
    const doublePunchAbility = fromUnit.getAbility("Double Punch");
    let secondPunchLanded = false;
    if (doublePunchAbility && !fromUnit.isDead() && !toUnit.isDead()) {
        if (HoCLib.getRandomInt(0, 100) < fromUnit.calculateMissChance(toUnit)) {
            sceneLog.updateLog(`${fromUnit.getName()} misses attk ${toUnit.getName()}`);
            return false;
        }

        unitsHolder.refreshStackPowerForAllUnits();
        const abilityMultiplier = fromUnit.calculateAbilityMultiplier(doublePunchAbility);
        const damageFromAttack = fromUnit.calculateAttackDamage(toUnit, AttackType.MELEE, 1, abilityMultiplier);
        toUnit.applyDamage(damageFromAttack, sceneStepCount);
        DamageStatisticHolder.getInstance().add({
            unitName: fromUnit.getName(),
            damage: damageFromAttack,
            team: fromUnit.getTeam(),
        });
        sceneLog.updateLog(`${fromUnit.getName()} attk ${toUnit.getName()} (${damageFromAttack})`);

        processFireShieldAbility(toUnit, fromUnit, sceneLog, unitsHolder, damageFromAttack, sceneStepCount);
        secondPunchLanded = true;
    }

    return secondPunchLanded;
}
