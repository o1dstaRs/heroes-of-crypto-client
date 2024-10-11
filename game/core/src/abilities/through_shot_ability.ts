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

import {
    AttackType,
    HoCLib,
    HoCMath,
    HoCConstants,
    Grid,
    ISceneLog,
    Unit,
    FightStateManager,
    UnitsHolder,
    IAnimationData,
} from "@heroesofcrypto/common";

import { DamageStatisticHolder } from "../stats/damage_stats";
import { processLuckyStrikeAbility } from "./lucky_strike_ability";
import { processPetrifyingGazeAbility } from "./petrifying_gaze_ability";
import { processSpitBallAbility } from "./spit_ball_ability";
import { processStunAbility } from "./stun_ability";

export interface IThroughShotResult {
    landed: boolean;
    unitIdsDied: string[];
    animationData: IAnimationData[];
}

export function processThroughShotAbility(
    attackerUnit: Unit,
    targetUnits: Array<Unit[]>,
    currentActiveUnit: Unit,
    hoverRangeAttackDivisors: number[],
    hoverRangeAttackPosition: HoCMath.XY,
    unitsHolder: UnitsHolder,
    grid: Grid,
    sceneLog: ISceneLog,
    damageStatisticHolder: DamageStatisticHolder,
    decreaseNumberOfShots = true,
): IThroughShotResult {
    const animationData: IAnimationData[] = [];
    const unitIdsDied: string[] = [];
    const throughShotAbility = attackerUnit.getAbility("Through Shot");
    if (!throughShotAbility) {
        return { landed: false, unitIdsDied, animationData };
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
            let throughShotMultiplier = attackerUnit.calculateAbilityMultiplier(throughShotAbility);
            const paralysisAttackerEffect = attackerUnit.getEffect("Paralysis");
            if (paralysisAttackerEffect) {
                throughShotMultiplier *= (100 - paralysisAttackerEffect.getPower()) / 100;
            }
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
            damageStatisticHolder.add({
                unitName: attackerUnit.getName(),
                damage: targetUnit.applyDamage(damageFromAttack),
                team: attackerUnit.getTeam(),
            });
            const pegasusLightEffect = targetUnit.getEffect("Pegasus Light");
            if (pegasusLightEffect) {
                attackerUnit.increaseMorale(pegasusLightEffect.getPower());
            }
            unitsDamaged.push(targetUnit);

            if (!targetUnit.isDead()) {
                processPetrifyingGazeAbility(
                    attackerUnit,
                    targetUnit,
                    damageFromAttack,
                    sceneLog,
                    damageStatisticHolder,
                );
            }
        }
    }

    for (const unit of unitsDamaged) {
        if (unit.isDead()) {
            sceneLog.updateLog(`${unit.getName()} died`);
            unitIdsDied.push(unit.getId());
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

    if (decreaseNumberOfShots) {
        attackerUnit.decreaseNumberOfShots();
    }
    if (targetUnit) {
        animationData.push({
            fromPosition: attackerUnit.getPosition(),
            toPosition: hoverRangeAttackPosition,
            affectedUnit: targetUnit,
        });
    }

    return { landed: true, unitIdsDied, animationData };
}
