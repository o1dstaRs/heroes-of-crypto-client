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

import { AttackType, Grid } from "@heroesofcrypto/common";

import { SceneLog } from "../menu/scene_log";
import { SpellsFactory } from "../spells/spells_factory";
import { FightStateManager } from "../state/fight_state_manager";
import { MORALE_CHANGE_FOR_KILL } from "../statics";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";
import { processPetrifyingGazeAbility } from "./petrifying_gaze_ability";
import { processSpitBallAbility } from "./spit_ball_ability";
import { processStunAbility } from "./stun_ability";

export interface ILargeCaliberResult {
    landed: boolean;
    maxDamage: number;
}

export function processLargeCaliberAbility(
    attackerUnit: Unit,
    affectedUnits: Unit[],
    currentActiveUnit: Unit,
    rangeAttackDivisor: number,
    sceneStepCount: number,
    spellsFactory: SpellsFactory,
    unitsHolder: UnitsHolder,
    grid: Grid,
    sceneLog: SceneLog,
    isAttack = true,
): ILargeCaliberResult {
    const largeCaliberAbility = attackerUnit.getAbility("Large Caliber");
    let maxDamage = 0;
    if (largeCaliberAbility) {
        for (const unit of affectedUnits) {
            const damageFromAttack = attackerUnit.calculateAttackDamage(
                unit,
                AttackType.RANGE,
                rangeAttackDivisor,
                attackerUnit.calculateAbilityMultiplier(largeCaliberAbility),
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
                attackerUnit.increaseMorale(MORALE_CHANGE_FOR_KILL);
                unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(unit);
                attackerUnit.applyMoraleStepsModifier(FightStateManager.getInstance().getStepsMoraleMultiplier());
            } else {
                processStunAbility(attackerUnit, unit, attackerUnit, sceneLog);

                processSpitBallAbility(
                    attackerUnit,
                    unit,
                    currentActiveUnit,
                    spellsFactory,
                    unitsHolder,
                    grid,
                    sceneLog,
                );
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
