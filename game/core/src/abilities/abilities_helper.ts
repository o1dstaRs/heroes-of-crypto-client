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

import { HoCMath, Grid } from "@heroesofcrypto/common";

import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";

function addToTargetList(
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

function getTargetList(
    startingPos: HoCMath.XY[],
    cellsDiff: HoCMath.XY,
    target: Unit,
    attacker: Unit,
    grid: Grid,
    unitsHolder: UnitsHolder,
): Unit[] {
    let targetList: Unit[] = [];
    const signX = Math.sign(cellsDiff.x);
    const signY = Math.sign(cellsDiff.y);
    const bX = Math.floor(Math.abs(cellsDiff.x));
    const bY = Math.floor(Math.abs(cellsDiff.y));
    for (const startingCell of startingPos) {
        targetList = addToTargetList(
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
    attackerUnit: Unit,
    targetUnit: Unit,
    grid: Grid,
    unitsHolder: UnitsHolder,
    attackFromCell?: HoCMath.XY,
    pierceLargeUnits = true,
): Unit[] {
    let targetList: Unit[] = [];
    const targetBaseCell = targetUnit.getBaseCell();
    const attackerBaseCell = attackFromCell ? attackFromCell : attackerUnit.getBaseCell();

    if (targetBaseCell && attackerBaseCell) {
        const cellsDiff = { x: targetBaseCell.x - attackerBaseCell.x, y: targetBaseCell.y - attackerBaseCell.y };
        if (targetUnit.isSmallSize() || pierceLargeUnits) {
            targetList = getTargetList(targetUnit.getCells(), cellsDiff, targetUnit, attackerUnit, grid, unitsHolder);
        }
    }

    return targetList;
}
