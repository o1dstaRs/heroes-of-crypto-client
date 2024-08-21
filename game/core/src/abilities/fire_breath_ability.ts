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

import { AttackType, Grid, GridSettings, GridMath, HoCMath } from "@heroesofcrypto/common";

import { SceneLog } from "../menu/scene_log";
import { FightStateManager } from "../state/fight_state_manager";
import { MORALE_CHANGE_FOR_KILL } from "../statics";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";

function getCoosCenter(start: HoCMath.XY): HoCMath.XY {
    const coos: HoCMath.XY[] = [
        start,
        { x: start.x - 1, y: start.y },
        { x: start.x - 1, y: start.y - 1 },
        { x: start.x, y: start.y - 1 },
    ];
    let sum = { x: 0, y: 0 };
    for (const coo of coos) {
        sum = { x: sum.x + coo.x, y: sum.y + coo.y };
    }

    return { x: sum.x / coos.length, y: sum.y / coos.length };
}

function addingTargets(
    ix: number,
    iy: number,
    targetList: Unit[],
    target: Unit,
    attacker: Unit,
    grid: Grid,
    unitsHolder: UnitsHolder,
): Unit[] {
    const nextTargetId = grid.getOccupantUnitId({ x: ix, y: iy });
    if (nextTargetId) {
        const addTarget = unitsHolder.getAllUnits().get(nextTargetId);
        if (
            addTarget &&
            !targetList.includes(addTarget) &&
            addTarget.getId() !== attacker.getId() &&
            addTarget.getId() !== target.getId()
        ) {
            targetList.push(addTarget);
        }
    }
    return targetList;
}

function addTargets(
    startingPos: HoCMath.XY[],
    bias: HoCMath.XY,
    target: Unit,
    attacker: Unit,
    grid: Grid,
    unitsHolder: UnitsHolder,
): Unit[] {
    let targetList: Unit[] = [];
    const signX = Math.sign(bias.x);
    const signY = Math.sign(bias.y);
    const bX = Math.floor(Math.abs(bias.x));
    const bY = Math.floor(Math.abs(bias.y));
    for (const startingCell of startingPos) {
        targetList = addingTargets(
            startingCell.x + bX * signX,
            startingCell.y + bY * signY,
            targetList,
            target,
            attacker,
            grid,
            unitsHolder,
        );
    }
    return targetList;
}

export function nextStandingTargets(
    attacker: Unit,
    target: Unit,
    targetPos: HoCMath.XY,
    grid: Grid,
    unitsHolder: UnitsHolder,
    attackerStartingPos?: HoCMath.XY,
): Unit[] {
    const targetCells: HoCMath.XY[] = [];
    if (target.isSmallSize()) {
        targetCells.push(targetPos);
    } else {
        for (let iy = -1; iy < 1; iy++) {
            for (let ix = -1; ix < 1; ix++) {
                targetCells.push({ x: targetPos.x + ix, y: targetPos.y + iy });
            }
        }
    }
    let targetList: Unit[] = [];
    if (attackerStartingPos) {
        const attackerPos = getCoosCenter(attackerStartingPos);
        if (target.isSmallSize()) {
            const bias = { x: targetPos.x - attackerPos.x, y: targetPos.y - attackerPos.y };
            targetList = addTargets(targetCells, bias, target, attacker, grid, unitsHolder);
        } else {
            targetPos = getCoosCenter(targetPos);
            const bias = { x: targetPos.x - attackerPos.x, y: targetPos.y - attackerPos.y };
            targetList = addTargets(targetCells, bias, target, attacker, grid, unitsHolder);
        }
    }

    return targetList;
}

export function processFireBreathAbility(
    fromUnit: Unit,
    toUnit: Unit,
    sceneLog: SceneLog,
    unitsHolder: UnitsHolder,
    sceneStepCount: number,
    grid: Grid,
    gridSettings: GridSettings,
    attackTypeString: string,
    targetMovePosition?: HoCMath.XY,
): void {
    const fireBreathAbility = fromUnit.getAbility("Fire Breath");

    if (!fireBreathAbility) {
        return;
    }

    const targetPos = GridMath.getCellForPosition(gridSettings, toUnit.getPosition());

    if (targetPos) {
        const unitsDead: Unit[] = [];
        const targets = nextStandingTargets(fromUnit, toUnit, targetPos, grid, unitsHolder, targetMovePosition);

        for (const nextStandingTarget of targets) {
            if (
                nextStandingTarget.isDead() ||
                nextStandingTarget.getMagicResist() >= 100 ||
                nextStandingTarget.hasAbilityActive("Fire Element")
            ) {
                continue;
            }

            const fireBreathAttackDamage = fromUnit.calculateAttackDamage(
                nextStandingTarget,
                AttackType.MELEE,
                1,
                fromUnit.calculateAbilityMultiplier(fireBreathAbility),
            );

            nextStandingTarget.applyDamage(fireBreathAttackDamage, sceneStepCount);
            DamageStatisticHolder.getInstance().add({
                unitName: fromUnit.getName(),
                damage: fireBreathAttackDamage,
                team: fromUnit.getTeam(),
            });

            sceneLog.updateLog(
                `${fromUnit.getName()} ${attackTypeString} ${nextStandingTarget.getName()} (${fireBreathAttackDamage})`,
            );

            if (nextStandingTarget.isDead()) {
                unitsDead.push(nextStandingTarget);
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
    }
}
