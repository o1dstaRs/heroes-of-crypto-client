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

import { b2Body, XY } from "@box2d/core";

import { Grid } from "../grid/grid";
import { PathHelper, IWeightedRoute } from "../path/path_helper";
import { Unit, IUnitAIRepr } from "../units/units";
import { AttackType, TeamType } from "../units/units_stats";
import { matrixElementOrZero } from "../utils/math";
import { ObstacleType } from "../obstacles/obstacle";

export interface IAI {
    nextMovingTarget(): XY | undefined;

    nextAttackTarget(): b2Body | undefined;

    decide(grid: Grid, currentTick: number, id: string, enemyTeam: number): void;

    getClosestEnemyDistance(currentTick: number): number;

    ownsTargetCell(grid: Grid): boolean;

    init(grid: Grid, currentTick: number, id: string, enemyTeam: number): void;

    canAttack(): boolean;

    startAttacking(): void;

    stopAttacking(): void;

    cleanAttackTarget(grid: Grid): void;

    action(unit: Unit, grid: Grid, matrix: number[][]): IAIAction;
}

export enum AIActionType {
    M_ATTACK,
    R_ATTACK,
    S_ATTACK,
    MOVE,
    MOVE_AND_M_ATTACK,
    WAIT,
}

export interface IAIAction {
    actionType(): AIActionType;
    cellToMove(): XY | undefined;
    cellToAttack(): XY | undefined;
    currentActiveKnownPaths(): Map<number, IWeightedRoute[]>;
}

export class BasicAIAction implements IAIAction {
    private readonly type: AIActionType;

    private readonly cell: XY | undefined;

    private readonly attackCell: XY | undefined;

    private readonly activeKnownPaths: Map<number, IWeightedRoute[]>;

    public constructor(
        type: AIActionType,
        cell: XY | undefined,
        toAttackCell: XY | undefined,
        activeKnownPaths: Map<number, IWeightedRoute[]>,
    ) {
        this.type = type;
        this.cell = cell;
        this.attackCell = toAttackCell;
        this.activeKnownPaths = activeKnownPaths;
    }

    public actionType(): AIActionType {
        return this.type;
    }

    public cellToMove(): XY | undefined {
        return this.cell;
    }

    public cellToAttack(): XY | undefined {
        return this.attackCell;
    }

    public currentActiveKnownPaths(): Map<number, IWeightedRoute[]> {
        return this.activeKnownPaths;
    }
}

/**
 * take unit, grid, matrix and return action for the given unit
 */
export function findTarget(
    unit: IUnitAIRepr,
    grid: Grid,
    matrix: number[][], // matrix for big unit has 4 cells filled
    pathHelper: PathHelper,
): BasicAIAction | undefined {
    if (unit.getCell() === undefined) {
        return undefined;
    }
    const unitPos = unit.getCell() ?? { x: -1, y: -1 }; // pos = XY
    const numRows = matrix.length;
    const numCols = matrix[0].length;
    if (numRows !== numCols) {
        return undefined;
    }
    let minDistance = Infinity;
    let closestTarget: XY | undefined;

    // if not range or spell type then add BFS, similar is in pathhelper
    // get the cell to go or cell to go and target to attack
    // to see grid use grid.print(unit.getId());

    const max_steps = 100; // unit.steps
    const paths = pathHelper.getMovePath(
        unitPos,
        matrix,
        max_steps + unit.getSteps(),
        grid.getAggrMatrixByTeam(unit.getTeam() === TeamType.LOWER ? TeamType.UPPER : TeamType.LOWER),
        unit.getCanFly(),
        unit.isSmallSize(),
    );
    let route;

    for (let i = 0; i < numRows; i++) {
        for (let j = 0; j < numCols; j++) {
            const element = matrixElementOrZero(matrix, j, i);
            if (element !== unit.getTeam() && element !== 0) {
                if (
                    element === ObstacleType.BLOCK ||
                    element === ObstacleType.HOLE ||
                    element === ObstacleType.WATER ||
                    element === ObstacleType.LAVA
                ) {
                    continue;
                }

                const neighbors = getCellsForAttacker({ x: j, y: i }, numRows, true, true);
                for (const elementNeighbor of neighbors) {
                    if (unit.isSmallSize()) {
                        if (cellKey(elementNeighbor) === cellKey(unitPos)) {
                            return new BasicAIAction(AIActionType.M_ATTACK, unitPos, { x: j, y: i }, paths.knownPaths);
                        }
                    } else if (
                        cellKey(elementNeighbor) === cellKey(unitPos) ||
                        cellKey(elementNeighbor) === cellKey({ x: unitPos.x - 1, y: unitPos.y }) ||
                        cellKey(elementNeighbor) === cellKey({ x: unitPos.x - 1, y: unitPos.y - 1 }) ||
                        cellKey(elementNeighbor) === cellKey({ x: unitPos.x, y: unitPos.y })
                    ) {
                        return new BasicAIAction(AIActionType.M_ATTACK, unitPos, { x: j, y: i }, paths.knownPaths);
                    }

                    const cellK = cellKey(elementNeighbor);
                    const { knownPaths } = paths;
                    if (knownPaths.has(cellK)) {
                        const tmpRoute = knownPaths.get(cellK);
                        const weight = tmpRoute?.at(0)?.weight;
                        if (weight === undefined) {
                            continue;
                        }
                        if (weight < minDistance) {
                            minDistance = weight;
                            closestTarget = { x: j, y: i };
                            route = tmpRoute?.at(0);
                        }
                    }
                }
            }
        }
    }

    if (closestTarget === undefined) {
        return undefined;
    }

    if (unit.getAllStats()?.attack_type === AttackType.RANGE) {
        return new BasicAIAction(AIActionType.R_ATTACK, undefined, closestTarget, paths.knownPaths);
    }

    /**
     * Use "paths" to go through the board and calculate the end cell
     * since the "paths" take into accoubt aggro board
     */
    let routeIndex = 0;
    let currentDistance: number | undefined = 0;
    do {
        const nextCell = route?.route[routeIndex + 1];
        if (nextCell === undefined || (nextCell?.x === closestTarget.x && nextCell?.y === closestTarget.y)) {
            break;
        }
        currentDistance = paths.knownPaths?.get(cellKey(nextCell))?.at(0)?.weight;
        if (currentDistance !== undefined && currentDistance <= unit.getSteps()) {
            routeIndex += 1;
        }
    } while (currentDistance !== undefined && currentDistance < unit.getSteps());

    while (routeIndex >= 0) {
        const cellToGo = route?.route[routeIndex];
        if (cellToGo) {
            if (unit.isSmallSize()) {
                if (matrixElementOrZero(matrix, cellToGo.x, cellToGo.y) !== 0) {
                    routeIndex--;
                } else {
                    break;
                }
            } else if (
                matrixElementOrZero(matrix, cellToGo.x, cellToGo.y) !== 0 ||
                matrixElementOrZero(matrix, cellToGo.x - 1, cellToGo.y) !== 0 ||
                matrixElementOrZero(matrix, cellToGo.x, cellToGo.y - 1) !== 0 ||
                matrixElementOrZero(matrix, cellToGo.x - 1, cellToGo.y - 1) !== 0
            ) {
                routeIndex--;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    if (routeIndex === 0) {
        return new BasicAIAction(AIActionType.M_ATTACK, route?.route[routeIndex], closestTarget, paths.knownPaths);
    }

    if (minDistance <= unit.getSteps()) {
        return new BasicAIAction(
            AIActionType.MOVE_AND_M_ATTACK,
            route?.route[routeIndex],
            closestTarget,
            paths.knownPaths,
        );
    }

    return new BasicAIAction(AIActionType.MOVE, route?.route[routeIndex], undefined, paths.knownPaths);
}

function cellKey(xy: XY): number {
    return (xy.x << 4) | xy.y; // TODO extact method in path_helper.js
}

/*
find neighbor positions for a unit

Current small
[0, 0, 0, 0, 0],
[0, 0, 0, 0, 0],
[0, 0, 0, 0, 0],
[0, 0, 2, 0, 0],
[0, 0, 0, 0, 0],

Current small, Attacker Big
[0, 0, 0, 0, 0],
[0, 0, 0, 0, 0],
[0, x, x, x, x],
[0, x, 2, 0, x],
[0, x, 0, 0, x],

Current big
[0, 0, 0, 0, 0],
[0, 0, 0, 0, 0],
[0, -, -, 0, 0],
[0, -, 2, 0, 0],
[0, 0, 0, 0, 0],

Current big, Attacker Big
[0, 0, 0, 0, 0],
[x, x, x, x, x],
[x, -, -, 0, x],
[x, -, 2, 0, x],
[x, 0, 0, 0, x],
*/
export function getCellsForAttacker(
    currentCell: XY,
    matrixSize: number,
    isCurrentUnitSmall = true,
    isAttackerUnitSmall = true,
): XY[] {
    const borderCells = filterCells(getBorderCells(currentCell, isCurrentUnitSmall), matrixSize);
    if (isAttackerUnitSmall) {
        return borderCells;
    }
    const cellsForBigAttacker: XY[] = [];
    for (const borderCell of borderCells) {
        if (borderCell.x <= currentCell.x && borderCell.y <= currentCell.y) {
            cellsForBigAttacker.push(borderCell);
        } else if (
            borderCell.x === currentCell.x + 1 &&
            borderCell.y === currentCell.y - (isCurrentUnitSmall ? 1 : 2)
        ) {
            cellsForBigAttacker.push(borderCell);
            cellsForBigAttacker.push({ x: borderCell.x + 1, y: borderCell.y });
        } else if (borderCell.x === currentCell.x + 1 && borderCell.y === currentCell.y + 1) {
            cellsForBigAttacker.push({ x: borderCell.x + 1, y: borderCell.y });
            cellsForBigAttacker.push({ x: borderCell.x + 1, y: borderCell.y + 1 });
            cellsForBigAttacker.push({ x: borderCell.x, y: borderCell.y + 1 });
        } else if (borderCell.x === currentCell.x + 1) {
            cellsForBigAttacker.push({ x: borderCell.x + 1, y: borderCell.y });
        } else if (
            borderCell.x === currentCell.x - (isCurrentUnitSmall ? 1 : 2) &&
            borderCell.y === currentCell.y + 1
        ) {
            cellsForBigAttacker.push({ x: borderCell.x, y: borderCell.y });
            cellsForBigAttacker.push({ x: borderCell.x, y: borderCell.y + 1 });
        } else if (borderCell.y === currentCell.y + 1) {
            cellsForBigAttacker.push({ x: borderCell.x, y: borderCell.y + 1 });
        }
    }
    return filterCells(cellsForBigAttacker, matrixSize, false);
}

// return cells that the small or big unit has
function getBorderCells(currentCell: XY, isSmallUnit = true): XY[] {
    const borderCells = [];
    borderCells.push({ x: currentCell.x + 1, y: currentCell.y - 1 });
    borderCells.push({ x: currentCell.x + 1, y: currentCell.y });
    borderCells.push({ x: currentCell.x + 1, y: currentCell.y + 1 });
    borderCells.push({ x: currentCell.x, y: currentCell.y + 1 });
    borderCells.push({ x: currentCell.x - 1, y: currentCell.y + 1 });
    if (isSmallUnit) {
        borderCells.push({ x: currentCell.x - 1, y: currentCell.y });
        borderCells.push({ x: currentCell.x - 1, y: currentCell.y - 1 });
        borderCells.push({ x: currentCell.x, y: currentCell.y - 1 });
    } else {
        borderCells.push({ x: currentCell.x - 2, y: currentCell.y + 1 });
        borderCells.push({ x: currentCell.x - 2, y: currentCell.y });
        borderCells.push({ x: currentCell.x - 2, y: currentCell.y - 1 });
        borderCells.push({ x: currentCell.x - 2, y: currentCell.y - 2 });
        borderCells.push({ x: currentCell.x - 1, y: currentCell.y - 2 });
        borderCells.push({ x: currentCell.x, y: currentCell.y - 2 });
        borderCells.push({ x: currentCell.x + 1, y: currentCell.y - 2 });
    }
    return borderCells;
}

function filterCells(cells: XY[], matrixSize: number, isAttackerSmall = true): XY[] {
    const filtered = [];
    for (const cell of cells) {
        if (inBounds(cell, matrixSize)) {
            if (isAttackerSmall) {
                filtered.push(cell);
            } else if (
                inBounds({ x: cell.x - 1, y: cell.y }, matrixSize) &&
                inBounds({ x: cell.x - 1, y: cell.y - 1 }, matrixSize) &&
                inBounds({ x: cell.x, y: cell.y - 1 }, matrixSize)
            ) {
                filtered.push(cell);
            }
        }
    }
    return filtered;
}

function inBounds(cell: XY, matrixSize: number): boolean {
    return cell.x >= 0 && cell.x < matrixSize && cell.y >= 0 && cell.y < matrixSize;
}
