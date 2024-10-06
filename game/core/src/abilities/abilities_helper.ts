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

import { HoCMath, Grid, Unit, UnitsHolder } from "@heroesofcrypto/common";

function addToTargetList(
    ix: number,
    iy: number,
    targetList: Unit[],
    target: Unit,
    attacker: Unit,
    grid: Grid,
    unitsHolder: UnitsHolder,
    onlyOppositeTeam: boolean,
): Unit[] {
    const nextTargetId = grid.getOccupantUnitId({ x: ix, y: iy });
    if (nextTargetId) {
        const nextStanding = unitsHolder.getAllUnits().get(nextTargetId);
        if (
            nextStanding &&
            !targetList.includes(nextStanding) &&
            nextStanding.getId() !== attacker.getId() &&
            nextStanding.getId() !== target.getId() &&
            (!onlyOppositeTeam || nextStanding.getTeam() !== attacker.getTeam())
        ) {
            targetList.push(nextStanding);
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
    onlyOppositeTeam: boolean,
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
            onlyOppositeTeam,
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
    onlyOppositeTeam = false,
): Unit[] {
    let targetList: Unit[] = [];
    let targetBaseCell = targetUnit.getBaseCell();

    const attackFromBaseCell = attackFromCell ? attackFromCell : attackerUnit.getBaseCell();

    if (!attackFromBaseCell || !targetBaseCell) {
        return targetList;
    }

    let attackerBaseCell = attackFromBaseCell;

    if (!attackerUnit.isSmallSize()) {
        const attackerCells = [
            attackerBaseCell,
            { x: attackerBaseCell.x - 1, y: attackerBaseCell.y },
            { x: attackerBaseCell.x, y: attackerBaseCell.y - 1 },
            { x: attackerBaseCell.x - 1, y: attackerBaseCell.y - 1 },
        ];
        let closestCell = attackerCells[0];
        let minDistance = HoCMath.getDistance(closestCell, targetBaseCell);

        for (const cell of attackerCells) {
            const distance = HoCMath.getDistance(cell, targetBaseCell);
            if (distance < minDistance) {
                closestCell = cell;
                minDistance = distance;
            }
        }

        attackerBaseCell = closestCell;

        if (!targetUnit.isSmallSize()) {
            const targetCells = targetUnit.getCells();
            let closestTargetCell = targetCells[0];
            minDistance = HoCMath.getDistance(closestTargetCell, attackerBaseCell);

            for (const cell of targetCells) {
                const distance = HoCMath.getDistance(cell, attackerBaseCell);
                if (distance < minDistance) {
                    closestTargetCell = cell;
                    minDistance = distance;
                }
            }

            targetBaseCell = closestTargetCell;
        }
    }

    const tbs = targetUnit.getBaseCell();
    let xCoefficient = 0;
    let yCoefficient = 0;
    if (!targetUnit.isSmallSize()) {
        const baseCellDiffX = tbs.x - attackFromBaseCell.x;
        const baseCellDiffY = tbs.y - attackFromBaseCell.y;
        if (baseCellDiffX === 2) {
            xCoefficient = 1;
        } else if (baseCellDiffX === -2) {
            xCoefficient = -1;
        }
        if (baseCellDiffY === 2) {
            yCoefficient = 1;
        } else if (baseCellDiffY === -2) {
            yCoefficient = -1;
        }
        xCoefficient = tbs.x - attackFromBaseCell.x - xCoefficient;
        yCoefficient = tbs.y - attackFromBaseCell.y - yCoefficient;
    }

    if (targetBaseCell && attackerBaseCell) {
        const cellsDiff = {
            x: targetBaseCell.x - attackerBaseCell.x + xCoefficient,
            y: targetBaseCell.y - attackerBaseCell.y + yCoefficient,
        };
        if (targetUnit.isSmallSize() || pierceLargeUnits) {
            targetList = getTargetList(
                targetUnit.getCells(),
                cellsDiff,
                targetUnit,
                attackerUnit,
                grid,
                unitsHolder,
                onlyOppositeTeam,
            );
        }
    }

    return targetList;
}
