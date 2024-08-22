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

import { AttackType, HoCLib, HoCMath } from "@heroesofcrypto/common";

import { Drawer } from "../draw/drawer";
import { SceneLog } from "../menu/scene_log";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";

export interface IDoubleShotResult {
    applied: boolean;
    damage: number;
}

export function processDoubleShotAbility(
    fromUnit: Unit,
    toUnit: Unit,
    sceneLog: SceneLog,
    drawer: Drawer,
    unitsHolder: UnitsHolder,
    hoverRangeAttackDivisor: number,
    hoverRangeAttackPosition: HoCMath.XY,
    sceneStepCount: number,
): IDoubleShotResult {
    const doubleShotAbility = fromUnit.getAbility("Double Shot");

    let damageFromAttack = 0;

    if (!doubleShotAbility || fromUnit.isDead() || toUnit.isDead()) {
        return {
            applied: false,
            damage: damageFromAttack,
        };
    }

    const isSecondAttackMissed = HoCLib.getRandomInt(0, 100) < fromUnit.calculateMissChance(toUnit);
    if (isSecondAttackMissed) {
        sceneLog.updateLog(`${fromUnit.getName()} misses attk ${toUnit.getName()}`);
        return {
            applied: false,
            damage: damageFromAttack,
        };
    }

    drawer.startBulletAnimation(fromUnit.getPosition(), hoverRangeAttackPosition, toUnit);
    unitsHolder.refreshStackPowerForAllUnits();

    const abilityMultiplier = fromUnit.calculateAbilityMultiplier(doubleShotAbility);
    damageFromAttack = fromUnit.calculateAttackDamage(
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

    return {
        applied: true,
        damage: damageFromAttack,
    };
}
