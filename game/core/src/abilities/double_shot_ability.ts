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

import { AttackType, HoCMath } from "@heroesofcrypto/common";

import { Drawer } from "../draw/drawer";
import { SceneLog } from "../menu/scene_log";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";

export function processDoubleShotAbility(
    fromUnit: Unit,
    toUnit: Unit,
    sceneLog: SceneLog,
    drawer: Drawer,
    unitsHolder: UnitsHolder,
    hoverRangeAttackDivisor: number,
    hoverRangeAttackPoint: HoCMath.XY,
    sceneStepCount: number,
): boolean {
    const doubleShotAbility = fromUnit.getAbility("Double Shot");

    if (!doubleShotAbility || fromUnit.isDead() || toUnit.isDead()) {
        return false;
    }

    drawer.startBulletAnimation(fromUnit.getPosition(), hoverRangeAttackPoint, toUnit);
    unitsHolder.refreshStackPowerForAllUnits();

    const abilityMultiplier = fromUnit.calculateAbilityMultiplier(doubleShotAbility);
    console.log(`second shot abilityMultiplier: ${abilityMultiplier}`);
    const damageFromAttack = fromUnit.calculateAttackDamage(
        toUnit,
        AttackType.RANGE,
        hoverRangeAttackDivisor,
        abilityMultiplier,
    );
    toUnit.applyDamage(damageFromAttack, sceneStepCount);
    DamageStatisticHolder.getInstance().add({
        unitName: fromUnit.getName(),
        damage: damageFromAttack,
        team: fromUnit.getTeam(),
    });
    sceneLog.updateLog(`${fromUnit.getName()} attk ${toUnit.getName()} (${damageFromAttack})`);

    return true;
}
