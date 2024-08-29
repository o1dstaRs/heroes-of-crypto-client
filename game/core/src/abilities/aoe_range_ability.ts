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

import { AttackType, Grid, HoCConstants, HoCMath } from "@heroesofcrypto/common";

import { SceneLog } from "../menu/scene_log";
import { FightStateManager } from "../state/fight_state_manager";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";
import { processPetrifyingGazeAbility } from "./petrifying_gaze_ability";
import { processSpitBallAbility } from "./spit_ball_ability";
import { processStunAbility } from "./stun_ability";

export interface IAOERangeAttackResult {
    landed: boolean;
    maxDamage: number;
}

export function processRangeAOEAbility(
    attackerUnit: Unit,
    affectedUnits: Unit[],
    currentActiveUnit: Unit,
    rangeAttackDivisor: number,
    sceneStepCount: number,
    unitsHolder: UnitsHolder,
    grid: Grid,
    sceneLog: SceneLog,
    isAttack = true,
): IAOERangeAttackResult {
    let aoeAbility = attackerUnit.getAbility("Area Throw");
    if (!aoeAbility) {
        aoeAbility = attackerUnit.getAbility("Large Caliber");
    }

    let maxDamage = 0;
    if (aoeAbility) {
        for (const unit of affectedUnits) {
            const damageFromAttack = attackerUnit.calculateAttackDamage(
                unit,
                AttackType.RANGE,
                rangeAttackDivisor,
                attackerUnit.calculateAbilityMultiplier(aoeAbility),
                false,
            );

            unit.applyDamage(damageFromAttack, sceneStepCount);
            DamageStatisticHolder.getInstance().add({
                unitName: attackerUnit.getName(),
                damage: damageFromAttack,
                team: attackerUnit.getTeam(),
            });
            sceneLog.updateLog(
                `${attackerUnit.getName()} ${isAttack ? "attk" : "resp"} ${unit.getName()} (${damageFromAttack})`,
            );
            maxDamage = Math.max(maxDamage, damageFromAttack);

            if (!unit.isDead()) {
                processPetrifyingGazeAbility(attackerUnit, unit, damageFromAttack, sceneStepCount, sceneLog);
            }
        }

        for (const unit of affectedUnits) {
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

        return {
            landed: true,
            maxDamage,
        };
    }

    return {
        landed: false,
        maxDamage,
    };
}

export function evaluateAffectedUnits(
    affectedCells: HoCMath.XY[],
    unitsHolder: UnitsHolder,
    grid: Grid,
): Array<Unit[]> | undefined {
    const cellKeys: number[] = [];
    const unitIds: string[] = [];
    const affectedUnits: Unit[] = [];

    for (const c of affectedCells) {
        const cellKey = (c.x << 4) | c.y;
        if (cellKeys.includes(cellKey)) {
            continue;
        }

        const occupantId = grid.getOccupantUnitId(c);
        if (!occupantId) {
            continue;
        }

        if (unitIds.includes(occupantId)) {
            continue;
        }

        const occupantUnit = unitsHolder.getAllUnits().get(occupantId);
        if (!occupantUnit) {
            continue;
        }

        affectedUnits.push(occupantUnit);
        cellKeys.push(cellKey);
        unitIds.push(occupantId);
    }

    if (affectedUnits.length) {
        return [affectedUnits, affectedUnits];
    }

    return undefined;
}
