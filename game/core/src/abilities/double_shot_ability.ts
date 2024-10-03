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
import { IVisibleDamage } from "../state/visible_state";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";
import { processRangeAOEAbility } from "./aoe_range_ability";
import { processLuckyStrikeAbility } from "./lucky_strike_ability";

export interface IDoubleShotResult {
    applied: boolean;
    aoeRangeAttackLanded: boolean;
    damage: number;
    unitIdsDied: string[];
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
    damageForAnimation: IVisibleDamage,
    isAOE: boolean,
): IDoubleShotResult {
    const doubleShotAbility = fromUnit.getAbility("Double Shot");
    const unitIdsDied: string[] = [];

    let damageFromAttack = 0;

    if (
        !doubleShotAbility ||
        (!isAOE &&
            (fromUnit.isDead() ||
                toUnit.isDead() ||
                fromUnit.isSkippingThisTurn() ||
                (fromUnit.getTarget() && fromUnit.getTarget() !== toUnit.getId())))
    ) {
        return {
            applied: false,
            aoeRangeAttackLanded: false,
            damage: damageFromAttack,
            unitIdsDied,
        };
    }

    const isSecondAttackMissed = HoCLib.getRandomInt(0, 100) < fromUnit.calculateMissChance(toUnit);
    if (isSecondAttackMissed) {
        sceneLog.updateLog(`${fromUnit.getName()} misses attk ${toUnit.getName()}`);
        return {
            applied: false,
            aoeRangeAttackLanded: false,
            damage: damageFromAttack,
            unitIdsDied,
        };
    }

    drawer.startBulletAnimation(fromUnit.getPosition(), hoverRangeAttackPosition, toUnit);

    let aoeRangeAttackResult = processRangeAOEAbility(
        fromUnit,
        affectedUnits,
        fromUnit,
        hoverRangeAttackDivisor,
        unitsHolder,
        grid,
        sceneLog,
        true,
    );
    if (aoeRangeAttackResult.landed) {
        damageFromAttack = processLuckyStrikeAbility(fromUnit, aoeRangeAttackResult.maxDamage, sceneLog);
    } else {
        let abilityMultiplier = fromUnit.calculateAbilityMultiplier(doubleShotAbility);
        const paralysisAttackerEffect = fromUnit.getEffect("Paralysis");
        if (paralysisAttackerEffect) {
            abilityMultiplier *= (100 - paralysisAttackerEffect.getPower()) / 100;
        }
        damageFromAttack = processLuckyStrikeAbility(
            fromUnit,
            fromUnit.calculateAttackDamage(toUnit, AttackType.RANGE, hoverRangeAttackDivisor, abilityMultiplier),
            sceneLog,
        );
        toUnit.applyDamage(damageFromAttack);
        damageForAnimation.render = true;
        damageForAnimation.amount = damageFromAttack;
        damageForAnimation.unitPosition = toUnit.getPosition();
        damageForAnimation.unitIsSmall = toUnit.isSmallSize();
        DamageStatisticHolder.getInstance().add({
            unitName: fromUnit.getName(),
            damage: damageFromAttack,
            team: fromUnit.getTeam(),
        });
        const pegasusLightEffect = toUnit.getEffect("Pegasus Light");
        if (pegasusLightEffect) {
            fromUnit.increaseMorale(pegasusLightEffect.getPower());
        }
        sceneLog.updateLog(`${fromUnit.getName()} attk ${toUnit.getName()} (${damageFromAttack})`);
    }

    return {
        applied: true,
        aoeRangeAttackLanded: aoeRangeAttackResult.landed,
        damage: damageFromAttack,
        unitIdsDied: aoeRangeAttackResult.unitIdsDied,
    };
}
