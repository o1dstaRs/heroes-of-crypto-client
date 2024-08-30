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

import { AttackType, HoCLib, HoCMath, Grid } from "@heroesofcrypto/common";

import { Drawer } from "../draw/drawer";
import { SceneLog } from "../menu/scene_log";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";
import { processRangeAOEAbility } from "./aoe_range_ability";
import { processLuckyStrikeAbility } from "./lucky_strike_ability";

export interface IDoubleShotResult {
    applied: boolean;
    largeCaliberLanded: boolean;
    damage: number;
}

export function processDoubleShotAbility(
    fromUnit: Unit,
    toUnit: Unit,
    affectedUnits: Unit[],
    sceneLog: SceneLog,
    drawer: Drawer,
    unitsHolder: UnitsHolder,
    grid: Grid,
    hoverRangeAttackDivisor: number,
    hoverRangeAttackPosition: HoCMath.XY,
    sceneStepCount: number,
): IDoubleShotResult {
    const doubleShotAbility = fromUnit.getAbility("Double Shot");

    let damageFromAttack = 0;

    if (!doubleShotAbility || fromUnit.isDead() || toUnit.isDead()) {
        return {
            applied: false,
            largeCaliberLanded: false,
            damage: damageFromAttack,
        };
    }

    const isSecondAttackMissed = HoCLib.getRandomInt(0, 100) < fromUnit.calculateMissChance(toUnit);
    if (isSecondAttackMissed) {
        sceneLog.updateLog(`${fromUnit.getName()} misses attk ${toUnit.getName()}`);
        return {
            applied: false,
            largeCaliberLanded: false,
            damage: damageFromAttack,
        };
    }

    unitsHolder.refreshStackPowerForAllUnits();
    drawer.startBulletAnimation(fromUnit.getPosition(), hoverRangeAttackPosition, toUnit);

    let aoeRangeAttackResult = processRangeAOEAbility(
        fromUnit,
        affectedUnits,
        fromUnit,
        hoverRangeAttackDivisor,
        sceneStepCount,
        unitsHolder,
        grid,
        sceneLog,
        true,
    );
    if (aoeRangeAttackResult.landed) {
        damageFromAttack = processLuckyStrikeAbility(fromUnit, aoeRangeAttackResult.maxDamage, sceneLog);
    } else {
        const abilityMultiplier = fromUnit.calculateAbilityMultiplier(doubleShotAbility);
        damageFromAttack = processLuckyStrikeAbility(
            fromUnit,
            fromUnit.calculateAttackDamage(toUnit, AttackType.RANGE, hoverRangeAttackDivisor, abilityMultiplier),
            sceneLog,
        );
        toUnit.applyDamage(damageFromAttack, sceneStepCount);
        DamageStatisticHolder.getInstance().add({
            unitName: fromUnit.getName(),
            damage: damageFromAttack,
            team: fromUnit.getTeam(),
        });
        sceneLog.updateLog(`${fromUnit.getName()} attk ${toUnit.getName()} (${damageFromAttack})`);
    }

    return {
        applied: true,
        largeCaliberLanded: aoeRangeAttackResult.landed,
        damage: damageFromAttack,
    };
}
