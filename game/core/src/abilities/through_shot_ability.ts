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

import { AttackType, HoCLib, HoCMath, HoCConstants, Grid } from "@heroesofcrypto/common";

import { Drawer } from "../draw/drawer";
import { SceneLog } from "../menu/scene_log";
import { FightStateManager } from "../state/fight_state_manager";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";
import { processLuckyStrikeAbility } from "./lucky_strike_ability";
import { processPetrifyingGazeAbility } from "./petrifying_gaze_ability";
import { processSpitBallAbility } from "./spit_ball_ability";
import { processStunAbility } from "./stun_ability";

export function processThroughShotAbility(
    attackerUnit: Unit,
    targetUnits: Array<Unit[]>,
    currentActiveUnit: Unit,
    hoverRangeAttackDivisors: number[],
    hoverRangeAttackPosition: HoCMath.XY,
    unitsHolder: UnitsHolder,
    grid: Grid,
    drawer: Drawer,
    sceneStepCount: number,
    sceneLog: SceneLog,
): boolean {
    const throughShotAbility = attackerUnit.getAbility("Through Shot");
    if (!throughShotAbility) {
        return false;
    }

    let targetUnitUndex = 0;
    let targetUnit: Unit | undefined = undefined;

    const unitsDamaged: Unit[] = [];

    while (targetUnitUndex < targetUnits.length) {
        const affectedUnits = targetUnits[targetUnitUndex];
        if (affectedUnits?.length !== 1) {
            targetUnitUndex++;
            continue;
        }

        targetUnit = affectedUnits[0];
        if (!targetUnit) {
            targetUnitUndex++;
            continue;
        }

        const hoverRangeAttackDivisor: number | undefined = hoverRangeAttackDivisors.at(targetUnitUndex);
        if (!hoverRangeAttackDivisor) {
            targetUnitUndex++;
            continue;
        }
        targetUnitUndex++;

        const isAttackMissed = HoCLib.getRandomInt(0, 100) < attackerUnit.calculateMissChance(targetUnit);
        if (isAttackMissed) {
            sceneLog.updateLog(`${attackerUnit.getName()} misses attk ${targetUnit.getName()}`);
        } else {
            const throughShotMultiplier = attackerUnit.calculateAbilityMultiplier(throughShotAbility);
            const damageFromAttack = processLuckyStrikeAbility(
                attackerUnit,
                attackerUnit.calculateAttackDamage(
                    targetUnit,
                    AttackType.RANGE,
                    hoverRangeAttackDivisor,
                    throughShotMultiplier,
                    false,
                ),
                sceneLog,
            );
            sceneLog.updateLog(`${attackerUnit.getName()} attk ${targetUnit.getName()} (${damageFromAttack})`);
            targetUnit.applyDamage(damageFromAttack, sceneStepCount);
            DamageStatisticHolder.getInstance().add({
                unitName: attackerUnit.getName(),
                damage: damageFromAttack,
                team: attackerUnit.getTeam(),
            });
            unitsDamaged.push(targetUnit);

            if (!targetUnit.isDead()) {
                processPetrifyingGazeAbility(attackerUnit, targetUnit, damageFromAttack, sceneStepCount, sceneLog);
            }
        }
    }

    for (const unit of unitsDamaged) {
        if (unit.isDead()) {
            sceneLog.updateLog(`${unit.getName()} died`);
            unitsHolder.deleteUnitById(grid, unit.getId());
            attackerUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(unit);
            attackerUnit.applyMoraleStepsModifier(
                FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
            );
        } else {
            processStunAbility(attackerUnit, unit, attackerUnit, sceneLog);
            processSpitBallAbility(attackerUnit, unit, currentActiveUnit, unitsHolder, grid, sceneLog);
        }
    }

    attackerUnit.decreaseNumberOfShots();
    if (targetUnit) {
        drawer.startBulletAnimation(attackerUnit.getPosition(), hoverRangeAttackPosition, targetUnit);
    }

    return true;
}
