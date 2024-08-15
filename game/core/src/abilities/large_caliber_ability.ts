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

import { Grid, GridMath, GridSettings, HoCMath } from "@heroesofcrypto/common";
import { UnitsHolder } from "../units/units_holder";
import { Unit } from "../units/units";
import { AttackType } from "@heroesofcrypto/common/src/generated/protobuf/v1/types_pb";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { MORALE_CHANGE_FOR_KILL } from "../statics";
import { FightStateManager } from "../state/fight_state_manager";
import { SceneLog } from "../menu/scene_log";
import { XY } from "@box2d/core";

export function allUnitsInShotArea(
    toUnit: Unit,
    hoverRangeAttackPoint: XY,
    unitsHolder: UnitsHolder,
    grid: Grid,
    gridSettings: GridSettings,
): Unit[] {
    const unitList: Unit[] = [];
    let target_position = GridMath.getCellForPosition(gridSettings, toUnit.getPosition());
    if (!toUnit.isSmallSize()) {
        target_position = GridMath.getCellForPosition(gridSettings, hoverRangeAttackPoint);
    }
    if (target_position) {
        if (!toUnit.isSmallSize()) {
            const check_down_cell: HoCMath.XY = { x: target_position.x - 1, y: target_position.y - 1 };
            const check_down_UnitId = grid.getOccupantUnitId(check_down_cell);
            if (check_down_UnitId) {
                if (check_down_UnitId === toUnit.getId()) {
                    unitList.push(toUnit);
                    return unitList;
                }
            }
        }
        let checking_UnitId = grid.getOccupantUnitId(target_position);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const checking_cell: HoCMath.XY = { x: target_position.x + dx, y: target_position.y + dy };
                checking_UnitId = grid.getOccupantUnitId(checking_cell);
                if (checking_UnitId) {
                    const addUnit = unitsHolder.getAllUnits().get(checking_UnitId);
                    if (addUnit && !unitList.includes(addUnit)) {
                        unitList.push(addUnit);
                    }
                }
            }
        }
    }
    return unitList;
}

export function processLargeCaliberAbility(
    fromUnit: Unit,
    toUnit: Unit,
    sceneLog: SceneLog,
    unitsHolder: UnitsHolder,
    sceneStepCount: number,
    grid: Grid,
    gridSettings: GridSettings,
    attackTypeString: string,
    hoverRangeAttackDivisor: number,
    hoverRangeAttackPoint: XY,
): void {
    const largeCaliberAbility = fromUnit.getAbility("Large Caliber");

    if (!largeCaliberAbility) {
        return;
    }

    // let vector: HoCMath.XY = { x: 0, y: 0 };
    // if (!toUnit.isSmallSize()) {
    //     vector =
    // }
    const unitsDead: Unit[] = [];
    const targets = allUnitsInShotArea(toUnit, hoverRangeAttackPoint, unitsHolder, grid, gridSettings);
    for (const next_target of targets) {
        if (next_target === toUnit) {
            continue;
        }

        const largeCaliberAttackDamage = fromUnit.calculateAttackDamage(
            next_target,
            AttackType.RANGE,
            hoverRangeAttackDivisor,
            fromUnit.calculateAbilityMultiplier(largeCaliberAbility),
        );

        next_target.applyDamage(largeCaliberAttackDamage, sceneStepCount);
        DamageStatisticHolder.getInstance().add({
            unitName: fromUnit.getName(),
            damage: largeCaliberAttackDamage,
            team: fromUnit.getTeam(),
        });

        sceneLog.updateLog(
            `${fromUnit.getName()} ${attackTypeString} ${next_target.getName()} (${largeCaliberAttackDamage})`,
        );

        if (next_target.isDead()) {
            unitsDead.push(next_target);
        }
    }

    unitsHolder.refreshStackPowerForAllUnits();

    for (const unitDead of unitsDead) {
        sceneLog.updateLog(`${unitDead.getName()} died`);
        unitsHolder.deleteUnitById(grid, unitDead.getId());
        fromUnit.increaseMorale(MORALE_CHANGE_FOR_KILL);
        fromUnit.applyMoraleStepsModifier(FightStateManager.getInstance().getStepsMoraleMultiplier());
        unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(unitDead);
    }
    return;
}
