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
    TeamType,
    Grid,
    ObstacleType,
    HoCMath,
    PathHelper,
    GridMath,
    IWeightedRoute,
    Unit,
    IUnitAIRepr,
    UnitsHolder,
    HoCLib,
} from "@heroesofcrypto/common";

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

const previousTargets: Map<string, string> = new Map<string, string>();

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
    unitsHolder: UnitsHolder,
    pathHelper: PathHelper,
): BasicAIAction | undefined {
    const debug = process.env.DEBUG_AI === "true";
    if (debug === true) {
        console.group("Start AI check");
        console.time("AI step");
    }

    let action: BasicAIAction | undefined = undefined;
    let selectedEnemy: Unit | undefined = undefined;
    const enemiesAround = unitsHolder.allEnemiesAroundUnit(unit, false);
    for (const e of enemiesAround) {
        if (e.isDead() || e.hasBuffActive("Hidden")) {
            continue;
        }

        if (!GridMath.isPositionWithinGrid(grid.getSettings(), e.getPosition())) {
            continue;
        }

        if (unit.getTarget() && unit.getTarget() === e.getId()) {
            selectedEnemy = e;
            break;
        }

        const previousTarget = previousTargets.get(unit.getId());
        if (previousTarget && previousTarget === e.getId()) {
            selectedEnemy = e;
            break;
        }
    }

    if (!selectedEnemy && enemiesAround.length) {
        // pick random enemy
        selectedEnemy = enemiesAround[HoCLib.getRandomInt(0, enemiesAround.length)];
    }

    if (selectedEnemy) {
        for (const ec of selectedEnemy.getCells()) {
            for (const uc of unit.getCells()) {
                if (Math.abs(ec.x - uc.x) <= 1 && Math.abs(ec.y - uc.y) <= 1) {
                    action = new BasicAIAction(
                        AIActionType.MELEE_ATTACK,
                        unit.getBaseCell(),
                        { x: ec.x, y: ec.y },
                        new Map(),
                    );
                    break;
                }
            }
            if (action) {
                break;
            }
        }
    }

    if (!action) {
        if (!unit.canMove()) {
            return undefined;
        }

        action = doFindTarget(unit, unitsHolder, grid, matrix, pathHelper, debug);
    }

    if (debug === true) {
        logAction(action, debug);
        console.timeEnd("AI step");
        console.groupEnd();
    }
    return action;
}

function logAction(action: BasicAIAction | undefined, debug: boolean) {
    if (!debug) {
        return;
    }
    if (!action) {
        console.log("Action is undefined");
        return;
    }
    const actionType = action.actionType();
    console.log("Do action:" + AIActionType[actionType] + " unit to move to " + cellToString(action.cellToMove()));
}

function doFindTarget(
    unit: IUnitAIRepr,
    unitsHolder: UnitsHolder,
    grid: Grid,
    matrix: number[][],
    pathHelper: PathHelper,
    debug: boolean,
): BasicAIAction | undefined {
    const unitCell = unit.getBaseCell();
    const numRows = matrix.length;
    const numCols = matrix[0].length;
    if (numRows !== numCols) {
        return undefined;
    }
    // closest enemy unit
    let closestTarget: HoCMath.XY | undefined;
    let closestTargetDistance = Infinity;
    let cellsByDistanceFromTarget: HoCMath.XY[][];
    let resultRoute: IWeightedRoute | undefined;
    let resultRouteIndex: number | undefined;
    let resultMovementDistance: number = Infinity;
    let resultDistanceLeftToTarget: number = Infinity;
    let resultDepth: number = Infinity;

    // if not range or spell type then add BFS, similar is in pathhelper
    // get the cell to go or cell to go and target to attack
    // to see grid use grid.print(unit.getId());

    const max_steps = 100; // unit.steps
    const infiniteMovePath = pathHelper.getMovePath(
        unitCell,
        matrix,
        max_steps + unit.getSteps(),
        grid.getAggrMatrixByTeam(unit.getTeam() === TeamType.LOWER ? TeamType.UPPER : TeamType.LOWER),
        unit.canFly(),
        unit.isSmallSize(),
        unit.hasAbilityActive("Made of Fire"),
    );

    const actualMovePath = pathHelper.getMovePath(
        unitCell,
        matrix,
        unit.getSteps(),
        grid.getAggrMatrixByTeam(unit.getTeam() === TeamType.LOWER ? TeamType.UPPER : TeamType.LOWER),
        unit.canFly(),
        unit.isSmallSize(),
        unit.hasAbilityActive("Made of Fire"),
    );

    const movePath = actualMovePath;

    if (debug) {
        console.log("just for debug: " + actualMovePath.knownPaths.size + " " + infiniteMovePath.knownPaths.size);
        grid.print(unit.getId());
    }

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
    if (debug) {
        console.log("currentUnit is at: " + cellToString(unitCell));
    }
    // go through every cell and check is it an enemy
    const pickTarget = (): BasicAIAction | undefined => {
        for (let y = 0; y < numRows; y++) {
            for (let x = 0; x < numCols; x++) {
                const element = HoCMath.matrixElementOrDefault(matrix, x, y, 0);
                if (element !== unit.getTeam() && element !== 0) {
                    if (
                        element === ObstacleType.BLOCK ||
                        element === ObstacleType.HOLE ||
                        element === ObstacleType.WATER ||
                        element === ObstacleType.LAVA
                    ) {
                        continue;
                    }

                    const occupantUnitId = grid.getOccupantUnitId({ x: x, y: y });
                    if (!occupantUnitId) {
                        continue;
                    }

                    if (debug) {
                        console.log("Checking unit at cell: " + cellToString({ x: x, y: y }));
                    }

                    // get the list of cells that atacker can go to in order to attack the unit, return the layers, i.e bfs cells
                    cellsByDistanceFromTarget = getLayersForAttacker_2(
                        { x: x, y: y },
                        matrix,
                        unit,
                        unit.isSmallSize(),
                        true,
                    );
                    if (debug) {
                        console.log(getLayersForAttacker({ x: x, y: y }, matrix, unit, unit.isSmallSize(), true));
                    }
                    // go through all cells in a layer, check the actual min distance for attcker unit and save
                    for (let depth = 0; depth < cellsByDistanceFromTarget.length; depth++) {
                        if (debug) {
                            let cellsStr = "";
                            cellsByDistanceFromTarget[depth].forEach(
                                (cell) => (cellsStr = cellsStr + " [" + cellToString(cell) + "]"),
                            );
                            console.log("checking layer cellsToMoveTo:" + cellsStr);
                        }
                        // let layerRouteIndiciesLeft: number = Infinity;
                        for (const layerCell of cellsByDistanceFromTarget[depth]) {
                            const { knownPaths } = movePath;

                            if (depth === 0 && cellKey(layerCell) === cellKey(unitCell)) {
                                const occupantUnitId = grid.getOccupantUnitId({ x: x, y: y });
                                if (occupantUnitId) {
                                    previousTargets.set(unit.getId(), occupantUnitId);
                                }
                                return new BasicAIAction(
                                    AIActionType.MELEE_ATTACK,
                                    unitCell,
                                    { x: x, y: y },
                                    knownPaths,
                                );
                            }

                            const cellK = cellKey(layerCell);

                            if (!knownPaths.has(cellK)) {
                                if (debug) {
                                    console.log("No known path to layerCell:" + cellToString(layerCell));
                                }
                            } else {
                                if (debug) {
                                    console.log("Check path to layerCell:" + cellToString(layerCell));
                                }
                            }
                            const tmpRoute = knownPaths.get(cellK);
                            if (!tmpRoute) {
                                continue;
                            }
                            // const weight = tmpRoute?.at(0)?.weight;
                            // if (weight === undefined) {
                            //     continue;
                            // }
                            // if (weight >= closestTargetDistance) {
                            //     continue;
                            // }
                            // if (debug) {
                            //     console.log(
                            //         "New min distance: " + weight + " elementNeighbor:" + cellToString(layerCell),
                            //     );
                            // }
                            // closestTargetDistance = weight;
                            // closestTarget = { x: x, y: y };
                            if (debug) {
                                console.log(
                                    "for the target cell " +
                                        cellToString({ x: x, y: y }) +
                                        " with mote to cell: " +
                                        cellToString(layerCell) +
                                        " avaiable routs: " +
                                        tmpRoute?.length,
                                );
                            }
                            for (const currentRoute of tmpRoute) {
                                // let currentRoute = tmpRoute?.at(0);

                                if (!currentRoute) {
                                    continue;
                                }
                                if (debug) {
                                    let routeStr = "";
                                    currentRoute?.route.forEach(
                                        (cell: HoCMath.XY | undefined) =>
                                            (routeStr = routeStr + " [" + cellToString(cell) + "]"),
                                    );
                                    console.log("Checking route=" + routeStr);
                                }
                                /**
                                 * Use "paths" to go through the board and calculate the end cell
                                 * since the "paths" take into account aggro board
                                 */
                                // let currentRouteIndex = 0;
                                // let nextCellDistance: number | undefined;
                                // do {
                                //     const cell = currentRoute.route[currentRouteIndex];
                                //     const nextCell = currentRoute.route[currentRouteIndex + 1];
                                //     if (nextCell === undefined) {
                                //         break;
                                //     }
                                //     if (isSameCell(cell, layerCell)) {
                                //         break;
                                //     }
                                //     nextCellDistance = movePath.knownPaths?.get(cellKey(nextCell))?.at(0)?.weight;

                                //     if (debug) {
                                //         console.log("nextCellDistance: " + nextCellDistance);
                                //     }
                                //     if (nextCellDistance !== undefined && nextCellDistance > unit.getSteps()) {
                                //         break;
                                //     }
                                //     currentRouteIndex += 1;
                                // } while (
                                //     nextCellDistance !== undefined &&
                                //     nextCellDistance <= unit.getSteps() &&
                                //     currentRouteIndex < currentRoute.route.length
                                // );

                                // if (debug) {
                                //     console.log("Set currentRouteIndex: " + currentRouteIndex);
                                // }

                                // while (currentRouteIndex >= 0) {
                                //     const cellToGo = currentRoute?.route[currentRouteIndex];
                                //     if (cellToGo) {
                                //         if (unit.isSmallSize()) {
                                //             if (!isFree(cellToGo, matrix, unit)) {
                                //                 currentRouteIndex--;
                                //             } else {
                                //                 break;
                                //             }
                                //         } else if (
                                //             !isFree(cellToGo, matrix, unit) ||
                                //             !isFree({ x: cellToGo.x - 1, y: cellToGo.y }, matrix, unit) ||
                                //             !isFree({ x: cellToGo.x - 1, y: cellToGo.y - 1 }, matrix, unit) ||
                                //             !isFree({ x: cellToGo.x, y: cellToGo.y - 1 }, matrix, unit)
                                //         ) {
                                //             currentRouteIndex--;
                                //         } else {
                                //             break;
                                //         }
                                //     } else {
                                //         break;
                                //     }
                                // }
                                // let currentRouteIndiciesLeft = currentRoute.route.length - 1 - currentRouteIndex;
                                // let cellToMoveTo = currentRoute.route[currentRouteIndex];
                                let cellToMoveTo = layerCell;
                                let movementDistance = movePath.knownPaths?.get(cellKey(cellToMoveTo))?.at(0)?.weight;

                                let distanceLeftToTarget = HoCMath.getDistance(cellToMoveTo, { x: x, y: y });

                                if (debug) {
                                    console.log(
                                        "Cell to move: " +
                                            cellToString(cellToMoveTo) +
                                            " elementNeighbor: " +
                                            cellToString(layerCell) +
                                            // " updated currentRouteIndex: " +
                                            // currentRouteIndex +
                                            " distance to target: " +
                                            distanceLeftToTarget,
                                    );
                                }

                                if (!movementDistance) {
                                    console.log("skip cell: " + cellToString({ x: x, y: y }));
                                    continue;
                                }
                                // if same indicies left till the target but clooser then prev cell then update the route and hte cell to move to
                                if (
                                    resultDepth > depth || //&& distanceLeftToTarget < resultDistanceLeftToTarget) ||
                                    (resultDepth === depth &&
                                        (distanceLeftToTarget < resultDistanceLeftToTarget ||
                                            (distanceLeftToTarget === resultDistanceLeftToTarget &&
                                                movementDistance < resultMovementDistance)))
                                ) {
                                    resultRoute = currentRoute;
                                    // resultRouteIndex = currentRouteIndex;
                                    resultMovementDistance = movementDistance;
                                    resultDistanceLeftToTarget = distanceLeftToTarget;
                                    // layerRouteIndiciesLeft = currentRouteIndiciesLeft;
                                    resultDepth = depth;
                                    closestTarget = { x: x, y: y };
                                    if (debug) {
                                        console.log("Set new cell to move to :" + cellToString(cellToMoveTo));
                                    }
                                }
                            }
                        }
                        // in current layer we found a cell to go to, use it
                        // if (resultMovementDistance) {
                        //     break;
                        // }
                    }
                    // if (resultMovementDistance) {
                    //     break;
                    // }
                }
            }
        }

        return undefined;
    };

    let actionDetermined = pickTarget();
    if (actionDetermined) {
        return actionDetermined;
    }

    if (debug) {
        console.log("СlosestTarget:" + cellToString(closestTarget));
    }

    if (closestTarget === undefined /*|| resultRouteIndex === undefined*/) {
        return undefined;
    }

    if (unit.getAttackType() === AttackType.RANGE) {
        const occupantUnitId = grid.getOccupantUnitId({ x: closestTarget.x, y: closestTarget.y });
        if (occupantUnitId) {
            previousTargets.set(unit.getId(), occupantUnitId);
        }
        return new BasicAIAction(AIActionType.RANGE_ATTACK, undefined, closestTarget, movePath.knownPaths);
    }

    if (resultRouteIndex === 0) {
        const occupantUnitId = grid.getOccupantUnitId({ x: closestTarget.x, y: closestTarget.y });
        if (occupantUnitId) {
            previousTargets.set(unit.getId(), occupantUnitId);
        }
        return new BasicAIAction(
            AIActionType.MELEE_ATTACK,
            // resultRoute?.route[resultRouteIndex],
            resultRoute?.route[resultRoute?.route.length - 1],
            closestTarget,
            movePath.knownPaths,
        );
    }

    if (debug) {
        console.log(
            "closestTargetDistance=" +
                closestTargetDistance +
                ", unit.steps=" +
                unit.getSteps() +
                ", routeIndex=" +
                resultRouteIndex,
        );
        let routeStr = "";
        resultRoute?.route.forEach(
            (cell: HoCMath.XY | undefined) => (routeStr = routeStr + " [" + cellToString(cell) + "]"),
        );
        console.log("Route=" + routeStr);
    }
    if (/*resultRoute && resultRoute?.route.length - 1 === resultRouteIndex &&*/ resultDepth === 0) {
        const occupantUnitId = grid.getOccupantUnitId({ x: closestTarget.x, y: closestTarget.y });
        if (occupantUnitId) {
            previousTargets.set(unit.getId(), occupantUnitId);
        }
        return new BasicAIAction(
            AIActionType.MOVE_AND_MELEE_ATTACK,
            // resultRoute?.route[resultRouteIndex],
            resultRoute?.route[resultRoute?.route.length - 1],
            closestTarget,
            movePath.knownPaths,
        );
    }
    // let toMoveTo = resultRoute?.route[resultRouteIndex];
    let toMoveTo = resultRoute?.route[resultRoute?.route.length - 1];
    if (debug) {
        console.log("action MOVE with cell to move to x:" + toMoveTo?.x + " t:" + toMoveTo?.y);
    }
    previousTargets.delete(unit.getId());

    return new BasicAIAction(
        AIActionType.MOVE,
        // resultRoute?.route[resultRouteIndex],
        resultRoute?.route[resultRoute?.route.length - 1],
        undefined,
        movePath.knownPaths,
    );
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
    attacker: IUnitAIRepr,
    isCurrentUnitSmall = true,
    isTargetUnitSmall = true,
): HoCMath.XY[] {
    const borderCells = filterCells(
        getBorderCells(cellToAttack, isCurrentUnitSmall),
        matrix,
        isCurrentUnitSmall,
        attacker,
    );
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
    return filterCells(cellsForBigAttacker, matrix, false, attacker);
}

function getLayersForAttacker_2(
    cellToAttack: HoCMath.XY,
    matrix: number[][],
    attacker: IUnitAIRepr,
    isCurrentUnitSmall = true,
    isTargetUnitSmall = true,
): HoCMath.XY[][] {
    const result: HoCMath.XY[][] = [];
    for (let i = 1; i < matrix.length / 2; i++) {
        const borderCells = filterCells(getBorderCells_2(cellToAttack, i), matrix, isCurrentUnitSmall, attacker);
        result[i - 1] = borderCells;
    }
    if (isTargetUnitSmall) {
        return result;
    } else {
        return [];
    }
}

function getBorderCells_2(currentCell: HoCMath.XY, distance = 1): HoCMath.XY[] {
    const borderCells = [];
    for (let i = 0; i < distance * 2 + 1; i++) {
        borderCells.push({ x: currentCell.x - distance + i, y: currentCell.y - distance });
    }
    for (let i = 0; i < distance * 2 + 1; i++) {
        borderCells.push({ x: currentCell.x - distance + i, y: currentCell.y + distance });
    }
    for (let i = 0; i < (distance - 1) * 2 + 1; i++) {
        borderCells.push({ x: currentCell.x - distance, y: currentCell.y - distance + i });
    }
    for (let i = 0; i < (distance - 1) * 2 + 1; i++) {
        borderCells.push({ x: currentCell.x + distance, y: currentCell.y - distance + i });
    }
    return borderCells;
}

//return cells by distance from the cell to attack
function getLayersForAttacker(
    cellToAttack: HoCMath.XY,
    matrix: number[][],
    attacker: IUnitAIRepr,
    isCurrentUnitSmall = true,
    isTargetUnitSmall = true,
): HoCMath.XY[][] {
    const result: HoCMath.XY[][] = [];
    for (let i = 1; i < matrix.length / 2; i++) {
        const borderCells = filterCells(
            getBorderCells(cellToAttack, isCurrentUnitSmall, i),
            matrix,
            isCurrentUnitSmall,
            attacker,
        );
        result[i - 1] = borderCells;
    }
    if (isTargetUnitSmall) {
        return result;
    } else {
        return [];
    }
}

// return border cells that the small or big unit has
function getBorderCells(currentCell: HoCMath.XY, isSmallUnit = true, distance = 1): HoCMath.XY[] {
    const borderCells = [];
    borderCells.push({ x: currentCell.x - distance, y: currentCell.y + distance });
    borderCells.push({ x: currentCell.x - distance, y: currentCell.y });
    borderCells.push({ x: currentCell.x - distance, y: currentCell.y - distance });
    borderCells.push({ x: currentCell.x, y: currentCell.y - distance });
    borderCells.push({ x: currentCell.x + distance, y: currentCell.y - distance });
    if (isSmallUnit) {
        borderCells.push({ x: currentCell.x + distance, y: currentCell.y });
        borderCells.push({ x: currentCell.x + distance, y: currentCell.y + distance });
        borderCells.push({ x: currentCell.x, y: currentCell.y + distance });
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
        borderCells.push({ x: currentCell.x - distance, y: currentCell.y + distance + 1 });
        borderCells.push({ x: currentCell.x, y: currentCell.y + distance + 1 });
        borderCells.push({ x: currentCell.x + distance, y: currentCell.y + distance + 1 });
        borderCells.push({ x: currentCell.x + distance + 1, y: currentCell.y + distance + 1 });
        borderCells.push({ x: currentCell.x + distance + 1, y: currentCell.y + distance });
        borderCells.push({ x: currentCell.x + distance + 1, y: currentCell.y });
        borderCells.push({ x: currentCell.x + distance + 1, y: currentCell.y - distance });
    }
    return borderCells;
}

function filterCells(
    cells: HoCMath.XY[],
    matrix: number[][],
    isAttackerSmall = true,
    attacker: IUnitAIRepr,
): HoCMath.XY[] {
    const filtered = [];
    for (const cell of cells) {
        if (isFree(cell, matrix, attacker)) {
            if (isAttackerSmall) {
                filtered.push(cell);
            } else if (
                isFree({ x: cell.x - 1, y: cell.y }, matrix, attacker) &&
                isFree({ x: cell.x - 1, y: cell.y - 1 }, matrix, attacker) &&
                isFree({ x: cell.x, y: cell.y - 1 }, matrix, attacker)
            ) {
                filtered.push(cell);
            }
        }
    }
    return filtered;
}

function isFree(cell: HoCMath.XY, matrix: number[][], attacker: IUnitAIRepr): boolean {
    if (HoCMath.matrixElementOrDefault(matrix, cell.x, cell.y, 0) != 0) {
        for (const atCell of attacker.getCells()) {
            if (isSameCell(atCell, cell)) {
                return true;
            }
        }
        return false;
    }
    return cell.x >= 0 && cell.x < matrix[0].length && cell.y >= 0 && cell.y < matrix.length;
}

function isSameCell(first: HoCMath.XY, second: HoCMath.XY): boolean {
    return first.x === second.x && first.y === second.y;
}

function cellToString(cell: HoCMath.XY | undefined): string {
    if (cell === undefined) {
        return "undefined";
    } else {
        return "x:" + cell.x + " y:" + cell.y;
    }
}
