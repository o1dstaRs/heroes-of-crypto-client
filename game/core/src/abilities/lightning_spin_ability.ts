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

import { XY } from "@box2d/core";

import { Grid } from "../grid/grid";
import { getCellForPoint } from "../grid/grid_math";
import { GridSettings } from "../grid/grid_settings";
import { SceneLog } from "../menu/scene_log";
import { FightStateManager } from "../state/fight_state_manager";
import { MORALE_CHANGE_FOR_KILL } from "../statics";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";
import { AttackType } from "../units/units_stats";
import { processFireShieldAbility } from "./fire_shield_ability";
import { processOneInTheFieldAbility } from "./one_in_the_field_ability";
import { processStunAbility } from "./stun_ability";

export function allEnemiesAroundLargeUnit(
    attacker: Unit,
    isAttack: boolean,
    unitsHolder: UnitsHolder,
    grid: Grid,
    gridSettings: GridSettings,
    targetMovePosition?: XY,
): Unit[] {
    const enemyList: Unit[] = [];
    if (attacker && !attacker.isSmallSize()) {
        // use either target move position on current
        // depending on the action type (attack vs response)
        const firstCheckCell = isAttack ? targetMovePosition : getCellForPoint(gridSettings, attacker.getPosition());

        if (!firstCheckCell) {
            return enemyList;
        }

        for (let i = -2; i <= 1; i++) {
            for (let j = -2; j <= 1; j++) {
                const checkCell: XY = { x: firstCheckCell.x + i, y: firstCheckCell.y + j };
                const checkUnitId = grid.getOccupantUnitId(checkCell);
                if (checkUnitId) {
                    const addUnit = unitsHolder.getAllUnits().get(checkUnitId);
                    if (
                        addUnit &&
                        checkUnitId !== attacker.getId() &&
                        !enemyList.includes(addUnit) &&
                        !(attacker.getTeam() === addUnit?.getTeam())
                    ) {
                        enemyList.push(addUnit);
                    }
                }
            }
        }
    }
    return enemyList;
}

export function processLightningSpinAbility(
    fromUnit: Unit,
    sceneLog: SceneLog,
    unitsHolder: UnitsHolder,
    sceneStepCount: number,
    grid: Grid,
    gridSettings: GridSettings,
    targetMovePosition?: XY,
    isAttack = true,
): boolean {
    let lightningSpinLanded = false;
    const lightningSpinAbility = fromUnit.getAbility("Lightning Spin");

    if (lightningSpinAbility) {
        const unitsDead: Unit[] = [];
        const enemyList = allEnemiesAroundLargeUnit(
            fromUnit,
            isAttack,
            unitsHolder,
            grid,
            gridSettings,
            targetMovePosition,
        );
        let actionString: string;
        if (isAttack) {
            actionString = "attk";
        } else {
            actionString = "resp";
        }

        for (const enemy of enemyList) {
            const abilityMultiplier = fromUnit.calculateAbilityMultiplier(lightningSpinAbility);
            console.log(`abilityMultiplier: ${abilityMultiplier}`);

            const damageFromAttack = fromUnit.calculateAttackDamage(enemy, AttackType.MELEE, 1, abilityMultiplier);

            enemy.applyDamage(damageFromAttack, sceneStepCount);
            DamageStatisticHolder.getInstance().add({
                unitName: fromUnit.getName(),
                damage: damageFromAttack,
                team: fromUnit.getTeam(),
            });

            sceneLog.updateLog(`${fromUnit.getName()} ${actionString} ${enemy.getName()} (${damageFromAttack})`);

            if (enemy.isDead()) {
                unitsDead.push(enemy);
            }

            // check all the possible modificators here
            // just in case if we have more inherited/stolen abilities
            processFireShieldAbility(enemy, fromUnit, sceneLog, unitsHolder, damageFromAttack, sceneStepCount);
            processStunAbility(fromUnit, enemy, fromUnit, sceneLog);
        }

        unitsHolder.refreshStackPowerForAllUnits();

        for (const unitDead of unitsDead) {
            sceneLog.updateLog(`${unitDead.getName()} died`);
            unitsHolder.deleteUnitById(grid, unitDead.getId());
            fromUnit.increaseMorale(MORALE_CHANGE_FOR_KILL);
            fromUnit.applyMoraleStepsModifier(FightStateManager.getInstance().getStepsMoraleMultiplier());
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(unitDead);
        }

        if (!isAttack) {
            processOneInTheFieldAbility(fromUnit);
        }

        lightningSpinLanded = true;
    }

    return lightningSpinLanded;
}
