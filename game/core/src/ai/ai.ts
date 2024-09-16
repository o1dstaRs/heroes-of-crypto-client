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

import { AttackType, TeamType, Grid, ObstacleType, HoCMath, PathHelper, IWeightedRoute } from "@heroesofcrypto/common";

import { Unit, IUnitAIRepr } from "../units/units";

export interface IAI {
    nextMovingTarget(): HoCMath.XY | undefined;

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
    MELEE_ATTACK,
    RANGE_ATTACK,
    MAGIC_ATTACK,
    MOVE,
    MOVE_AND_MELEE_ATTACK,
}

export interface IAIAction {
    actionType(): AIActionType;
    cellToMove(): HoCMath.XY | undefined;
    cellToAttack(): HoCMath.XY | undefined;
    currentActiveKnownPaths(): Map<number, IWeightedRoute[]>;
}

export class BasicAIAction implements IAIAction {
    private readonly type: AIActionType;
    private readonly cellToMoveTo: HoCMath.XY | undefined;
    private readonly cellToAttackTo: HoCMath.XY | undefined;
    private readonly activeKnownPaths: Map<number, IWeightedRoute[]>;

    public constructor(
        type: AIActionType,
        cellToMoveTo: HoCMath.XY | undefined,
        cellToAttackTo: HoCMath.XY | undefined,
        activeKnownPaths: Map<number, IWeightedRoute[]>,
    ) {
        this.type = type;
        this.cellToMoveTo = cellToMoveTo;
        this.cellToAttackTo = cellToAttackTo;
        this.activeKnownPaths = activeKnownPaths;
    }

    public actionType(): AIActionType {
        return this.type;
    }

    public cellToMove(): HoCMath.XY | undefined {
        return this.cellToMoveTo;
    }

    public cellToAttack(): HoCMath.XY | undefined {
        return this.cellToAttackTo;
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
    console.group("Start AI check");
    console.time("AI step");
    const action = doFindTarget(unit, grid, matrix, pathHelper);
    console.timeEnd("AI step");
    console.groupEnd();
    return action;
}

function doFindTarget(
    unit: IUnitAIRepr,
    grid: Grid,
    matrix: number[][],
    pathHelper: PathHelper,
): BasicAIAction | undefined {
    if (unit.getBaseCell() === undefined) {
        return undefined;
    }
    const unitCell = unit.getBaseCell() ?? { x: -1, y: -1 }; // pos = XY
    const numRows = matrix.length;
    const numCols = matrix[0].length;
    if (numRows !== numCols) {
        return undefined;
    }
    let minDistance = Infinity;
    let closestTarget: HoCMath.XY | undefined;

    // if not range or spell type then add BFS, similar is in pathhelper
    // get the cell to go or cell to go and target to attack
    // to see grid use grid.print(unit.getId());

    const max_steps = 100; // unit.steps
    const paths = pathHelper.getMovePath(
        unitCell,
        matrix,
        max_steps + unit.getSteps(),
        grid.getAggrMatrixByTeam(unit.getTeam() === TeamType.LOWER ? TeamType.UPPER : TeamType.LOWER),
        unit.getCanFly(),
        unit.isSmallSize(),
    );
    let route;

    /*
    Note:
    any big unit in matrix occupies 4 cells, the current unit is provided by upper right cell:
    3 ---- 0 0 0 0 0 0 0
    2 ---- 0 2 2 0 0 - x
    1 ---- 0 2 2 0 0 - -
    0 ---- 0 0 0 0 0 0 0
    ^      | | | | | | |
    |      | | | | | | |
    y/x->  0 1 2 3 4 5 6
    */
    console.log("currentUnit is at: " + cellToString(unitCell));
    for (let i = 0; i < numRows; i++) {
        for (let j = 0; j < numCols; j++) {
            const element = HoCMath.matrixElementOrDefault(matrix, j, i, 0);
            if (element !== unit.getTeam() && element !== 0) {
                if (
                    element === ObstacleType.BLOCK ||
                    element === ObstacleType.HOLE ||
                    element === ObstacleType.WATER ||
                    element === ObstacleType.LAVA
                ) {
                    continue;
                }
                console.log("checking possible target at x=" + j + ", i=" + i);
                // get the list of cells that atacker can go to in order to attack the unit
                const neighbors = getCellsForAttacker({ x: j, y: i }, matrix, unit.isSmallSize(), true);
                for (const elementNeighbor of neighbors) {
                    console.log("checking a cellToMoveTo:" + cellToString(elementNeighbor));
                    if (unit.isSmallSize()) {
                        if (cellKey(elementNeighbor) === cellKey(unitCell)) {
                            return new BasicAIAction(
                                AIActionType.MELEE_ATTACK,
                                unitCell,
                                { x: j, y: i },
                                paths.knownPaths,
                            );
                        }
                    } else if (
                        cellKey(elementNeighbor) === cellKey(unitCell) ||
                        cellKey(elementNeighbor) === cellKey({ x: unitCell.x - 1, y: unitCell.y }) ||
                        cellKey(elementNeighbor) === cellKey({ x: unitCell.x - 1, y: unitCell.y - 1 }) ||
                        cellKey(elementNeighbor) === cellKey({ x: unitCell.x, y: unitCell.y - 1 })
                    ) {
                        return new BasicAIAction(AIActionType.MELEE_ATTACK, unitCell, { x: j, y: i }, paths.knownPaths);
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
                            console.log(
                                "New min distance: " + weight + " elementNeighbor:" + cellToString(elementNeighbor),
                            );
                            minDistance = weight;
                            closestTarget = { x: j, y: i };
                            route = tmpRoute?.at(0);
                        }
                    } else {
                        console.log("No known path to elementNeighbor:" + cellToString(elementNeighbor));
                    }
                }
            }
        }
    }

    if (closestTarget === undefined) {
        return undefined;
    }
    console.log("СlosestTarget:" + cellToString(closestTarget));
    if (unit.getAttackType() === AttackType.RANGE) {
        return new BasicAIAction(AIActionType.RANGE_ATTACK, undefined, closestTarget, paths.knownPaths);
    }

    /**
     * Use "paths" to go through the board and calculate the end cell
     * since the "paths" take into account aggro board
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
                if (HoCMath.matrixElementOrDefault(matrix, cellToGo.x, cellToGo.y, 0) !== 0) {
                    routeIndex--;
                } else {
                    break;
                }
            } else if (
                HoCMath.matrixElementOrDefault(matrix, cellToGo.x, cellToGo.y, 0) !== 0 ||
                HoCMath.matrixElementOrDefault(matrix, cellToGo.x - 1, cellToGo.y, 0) !== 0 ||
                HoCMath.matrixElementOrDefault(matrix, cellToGo.x, cellToGo.y - 1, 0) !== 0 ||
                HoCMath.matrixElementOrDefault(matrix, cellToGo.x - 1, cellToGo.y - 1, 0) !== 0
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
        return new BasicAIAction(AIActionType.MELEE_ATTACK, route?.route[routeIndex], closestTarget, paths.knownPaths);
    }

    console.log("MinDistance=" + minDistance + " unit.steps=" + unit.getSteps());
    if (minDistance <= unit.getSteps()) {
        return new BasicAIAction(
            AIActionType.MOVE_AND_MELEE_ATTACK,
            route?.route[routeIndex],
            closestTarget,
            paths.knownPaths,
        );
    }
    let toMoveTo = route?.route[routeIndex];
    console.log("action MOVE with cell to move to x:" + toMoveTo?.x + " t:" + toMoveTo?.y);
    return new BasicAIAction(AIActionType.MOVE, route?.route[routeIndex], undefined, paths.knownPaths);
}

function cellKey(xy: HoCMath.XY): number {
    return (xy.x << 4) | xy.y;
}

/*
find cells for the given cell that attacker can stand at

Current small
[0, 0, 0, 0, 0],
[0, 0, 2, 0, 0],
[0, 0, 0, 0, 0],
[0, 0, 0, 0, 0],
[0, 0, 0, 0, 0],

Current small, Attacker Big
[0, 0, 0, 0, 0],
[0, x, x, x, x],
[0, x, 0, 0, x],
[0, x, 2, 0, x],
[0, x, 0, 0, x],

Current big
[0, 0, 0, 0, 0],
[0, 0, 0, 0, 0],
[0, -, 2, 0, 0],
[0, -, -, 0, 0],
[0, 0, 0, 0, 0],

Current big, Attacker Big
[x, x, x, x, x],
[x, 0, 0, 0, x],
[x, 2, 2, 0, x],
[x, 2, 2, 0, x],
[x, 0, 0, 0, x],
*/
export function getCellsForAttacker(
    cellToAttack: HoCMath.XY,
    matrix: number[][],
    isCurrentUnitSmall = true,
    isTargetUnitSmall = true,
): HoCMath.XY[] {
    const borderCells = filterCells(getBorderCells(cellToAttack, isCurrentUnitSmall), matrix, isCurrentUnitSmall);
    if (isTargetUnitSmall) {
        return borderCells;
    }
    const cellsForBigAttacker: HoCMath.XY[] = [];
    for (const borderCell of borderCells) {
        if (borderCell.x <= cellToAttack.x && borderCell.y <= cellToAttack.y) {
            cellsForBigAttacker.push(borderCell);
        } else if (
            borderCell.x === cellToAttack.x + 1 &&
            borderCell.y === cellToAttack.y - (isCurrentUnitSmall ? 1 : 2)
        ) {
            cellsForBigAttacker.push(borderCell);
            cellsForBigAttacker.push({ x: borderCell.x + 1, y: borderCell.y });
        } else if (borderCell.x === cellToAttack.x + 1 && borderCell.y === cellToAttack.y + 1) {
            cellsForBigAttacker.push({ x: borderCell.x + 1, y: borderCell.y });
            cellsForBigAttacker.push({ x: borderCell.x + 1, y: borderCell.y + 1 });
            cellsForBigAttacker.push({ x: borderCell.x, y: borderCell.y + 1 });
        } else if (borderCell.x === cellToAttack.x + 1) {
            cellsForBigAttacker.push({ x: borderCell.x + 1, y: borderCell.y });
        } else if (
            borderCell.x === cellToAttack.x - (isCurrentUnitSmall ? 1 : 2) &&
            borderCell.y === cellToAttack.y + 1
        ) {
            cellsForBigAttacker.push({ x: borderCell.x, y: borderCell.y });
            cellsForBigAttacker.push({ x: borderCell.x, y: borderCell.y + 1 });
        } else if (borderCell.y === cellToAttack.y + 1) {
            cellsForBigAttacker.push({ x: borderCell.x, y: borderCell.y + 1 });
        }
    }
    return filterCells(cellsForBigAttacker, matrix, false);
}

// return border cells that the small or big unit has
function getBorderCells(currentCell: HoCMath.XY, isSmallUnit = true): HoCMath.XY[] {
    const borderCells = [];
    borderCells.push({ x: currentCell.x - 1, y: currentCell.y + 1 });
    borderCells.push({ x: currentCell.x - 1, y: currentCell.y });
    borderCells.push({ x: currentCell.x - 1, y: currentCell.y - 1 });
    borderCells.push({ x: currentCell.x, y: currentCell.y - 1 });
    borderCells.push({ x: currentCell.x + 1, y: currentCell.y - 1 });
    if (isSmallUnit) {
        borderCells.push({ x: currentCell.x + 1, y: currentCell.y });
        borderCells.push({ x: currentCell.x + 1, y: currentCell.y + 1 });
        borderCells.push({ x: currentCell.x, y: currentCell.y + 1 });
    } else {
        /*
        // big attacker
        // small target
        // possible cells that big attacker can be palces at (right up corner) to attack the cell
        0 0 0 0 0 0 0
        0 x x x x 0 0
        0 x 0 0 x 0 0
        0 x c 0 x 0 0
        0 x x x x 0 0
        */
        borderCells.push({ x: currentCell.x - 1, y: currentCell.y + 2 });
        borderCells.push({ x: currentCell.x, y: currentCell.y + 2 });
        borderCells.push({ x: currentCell.x + 1, y: currentCell.y + 2 });
        borderCells.push({ x: currentCell.x + 2, y: currentCell.y + 2 });
        borderCells.push({ x: currentCell.x + 2, y: currentCell.y + 1 });
        borderCells.push({ x: currentCell.x + 2, y: currentCell.y });
        borderCells.push({ x: currentCell.x + 2, y: currentCell.y - 1 });
    }
    return borderCells;
}

function filterCells(cells: HoCMath.XY[], matrix: number[][], isAttackerSmall = true): HoCMath.XY[] {
    const filtered = [];
    for (const cell of cells) {
        if (isFree(cell, matrix)) {
            if (isAttackerSmall) {
                filtered.push(cell);
            } else if (
                isFree({ x: cell.x - 1, y: cell.y }, matrix) &&
                isFree({ x: cell.x - 1, y: cell.y - 1 }, matrix) &&
                isFree({ x: cell.x, y: cell.y - 1 }, matrix)
            ) {
                filtered.push(cell);
            }
        }
    }
    return filtered;
}

function isFree(cell: HoCMath.XY, matrix: number[][]): boolean {
    if (HoCMath.matrixElementOrDefault(matrix, cell.x, cell.y, 0) != 0) {
        return false;
    }
    return cell.x >= 0 && cell.x < matrix[0].length && cell.y >= 0 && cell.y < matrix.length;
}

function cellToString(cell: HoCMath.XY | undefined): string {
    if (cell === undefined) {
        return "undefined";
    } else {
        return "x:" + cell.x + " y:" + cell.y;
    }
}
