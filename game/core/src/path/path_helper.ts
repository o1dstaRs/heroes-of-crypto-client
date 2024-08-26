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

import { GridMath, GridSettings, ObstacleType, TeamType, HoCLib, HoCMath } from "@heroesofcrypto/common";

import { IAttackTargets, Unit } from "../units/units";

export interface IMovePath {
    cells: HoCMath.XY[];
    hashes: Set<number>;
    knownPaths: Map<number, IWeightedRoute[]>;
}

export interface IWeightedRoute {
    cell: HoCMath.XY;
    route: HoCMath.XY[];
    weight: number;
    firstAggrMet: boolean;
}

export class PathHelper {
    public static DIAGONAL_MOVE_COST = 1.4142135623730951;

    public static Y_FACTION_ICONS_OFFSET = 2;

    private readonly gridSettings: GridSettings;

    public constructor(gridSettings: GridSettings) {
        this.gridSettings = gridSettings;
    }

    public getNeighborCells(
        currentCell: HoCMath.XY,
        visited: Set<number> = new Set(),
        isSmallUnit = true,
        getDiag = true,
        includeLeftRightEdges = false,
    ): HoCMath.XY[] {
        const neighborsLine = [];
        const neighborsDiag = [];
        const diff = includeLeftRightEdges ? 2 : 0;
        const canGoLeft = currentCell.x > (isSmallUnit ? 0 : 1) - diff;
        const canGoRight = currentCell.x < this.gridSettings.getGridSize() - 1 + diff;
        let canGoDown;
        if (currentCell.x < 0) {
            canGoDown = currentCell.y > 2;
        } else if (isSmallUnit) {
            canGoDown = currentCell.y > 0;
        } else {
            canGoDown = currentCell.y > 1;
        }
        const canGoUp = currentCell.y < this.gridSettings.getGridSize() - 1;

        if (canGoLeft) {
            const newX = currentCell.x - 1;
            const p1 = (newX << 4) | currentCell.y;
            if (!visited.has(p1)) {
                neighborsLine.push({ x: newX, y: currentCell.y });
            }
            if (canGoDown && getDiag) {
                const newY = currentCell.y - 1;
                const p2 = (newX << 4) | newY;
                if (!visited.has(p2)) {
                    neighborsDiag.push({ x: newX, y: newY });
                }
            }
            if (canGoUp && getDiag) {
                const newY = currentCell.y + 1;
                const p3 = (newX << 4) | newY;
                if (!visited.has(p3)) {
                    neighborsDiag.push({ x: newX, y: newY });
                }
            }
        }
        if (canGoUp) {
            const newY = currentCell.y + 1;
            const p4 = (currentCell.x << 4) | newY;
            if (!visited.has(p4)) {
                neighborsLine.push({ x: currentCell.x, y: newY });
            }
        }
        if (canGoDown) {
            const newY = currentCell.y - 1;
            const p5 = (currentCell.x << 4) | newY;
            if (!visited.has(p5)) {
                neighborsLine.push({ x: currentCell.x, y: newY });
            }
        }
        if (canGoRight) {
            const newX = currentCell.x + 1;
            const p6 = (newX << 4) | currentCell.y;
            if (!visited.has(p6)) {
                neighborsLine.push({ x: newX, y: currentCell.y });
            }
            if (canGoDown && getDiag) {
                const newY = currentCell.y - 1;
                const p7 = (newX << 4) | newY;
                if (!visited.has(p7)) {
                    neighborsDiag.push({ x: newX, y: newY });
                }
            }
            if (canGoUp && getDiag) {
                const newY = currentCell.y + 1;
                const p8 = (newX << 4) | newY;
                if (!visited.has(p8)) {
                    neighborsDiag.push({ x: newX, y: newY });
                }
            }
        }

        return [...neighborsLine, ...neighborsDiag];
    }

    private attackCellA(
        unitCell: HoCMath.XY,
        newUnitCellX: number,
        newUnitCellY: number,
        availableAttackCellHashes: Set<number>,
        targetUnit: Unit,
    ): HoCMath.XY | undefined {
        if (availableAttackCellHashes.has((newUnitCellX << 4) | newUnitCellY)) {
            return { x: newUnitCellX, y: newUnitCellY };
        }

        if (targetUnit.getTeam() === TeamType.UPPER) {
            if (availableAttackCellHashes.has((unitCell.x << 4) | newUnitCellY)) {
                return { x: unitCell.x, y: newUnitCellY };
            }

            if (availableAttackCellHashes.has((newUnitCellX << 4) | unitCell.y)) {
                return { x: newUnitCellX, y: unitCell.y };
            }
        } else {
            if (availableAttackCellHashes.has((newUnitCellX << 4) | unitCell.y)) {
                return { x: newUnitCellX, y: unitCell.y };
            }

            if (availableAttackCellHashes.has((unitCell.x << 4) | newUnitCellY)) {
                return { x: unitCell.x, y: newUnitCellY };
            }
        }

        return undefined;
    }

    private attackCellB(
        unitCell: HoCMath.XY,
        newUnitCellX: number,
        newUnitCellY: number,
        availableAttackCellHashes: Set<number>,
        targetUnit: Unit,
    ): HoCMath.XY | undefined {
        if (availableAttackCellHashes.has((newUnitCellX << 4) | newUnitCellY)) {
            return { x: newUnitCellX, y: newUnitCellY };
        }

        if (targetUnit.getTeam() === TeamType.UPPER) {
            if (availableAttackCellHashes.has((newUnitCellX << 4) | unitCell.y)) {
                return { x: newUnitCellX, y: unitCell.y };
            }

            if (availableAttackCellHashes.has((unitCell.x << 4) | newUnitCellY)) {
                return { x: unitCell.x, y: newUnitCellY };
            }
        } else {
            if (availableAttackCellHashes.has((unitCell.x << 4) | newUnitCellY)) {
                return { x: unitCell.x, y: newUnitCellY };
            }

            if (availableAttackCellHashes.has((newUnitCellX << 4) | unitCell.y)) {
                return { x: newUnitCellX, y: unitCell.y };
            }
        }

        return undefined;
    }

    private attackCellC(
        unitCell: HoCMath.XY,
        newUnitCellX: number,
        availableAttackCellHashes: Set<number>,
        targetUnit: Unit,
    ): HoCMath.XY | undefined {
        if (targetUnit.getTeam() === TeamType.UPPER) {
            const firstUnitCellY = unitCell.y - 1;
            if (firstUnitCellY >= 0 && availableAttackCellHashes.has((newUnitCellX << 4) | firstUnitCellY)) {
                return { x: newUnitCellX, y: firstUnitCellY };
            }

            const secondUnitCellY = unitCell.y + 1;
            if (
                secondUnitCellY < this.gridSettings.getGridSize() &&
                availableAttackCellHashes.has((newUnitCellX << 4) | secondUnitCellY)
            ) {
                return { x: newUnitCellX, y: secondUnitCellY };
            }
        } else {
            const firstUnitCellY = unitCell.y + 1;
            if (
                firstUnitCellY < this.gridSettings.getGridSize() &&
                availableAttackCellHashes.has((newUnitCellX << 4) | firstUnitCellY)
            ) {
                return { x: newUnitCellX, y: firstUnitCellY };
            }

            const secondUnitCellY = unitCell.y - 1;
            if (secondUnitCellY >= 0 && availableAttackCellHashes.has((newUnitCellX << 4) | secondUnitCellY)) {
                return { x: newUnitCellX, y: secondUnitCellY };
            }
        }

        return undefined;
    }

    private attackCellD(
        unitCell: HoCMath.XY,
        newUnitCellY: number,
        availableAttackCellHashes: Set<number>,
        targetUnit: Unit,
    ): HoCMath.XY | undefined {
        if (targetUnit.getTeam() === TeamType.UPPER) {
            const firstUnitCellX = unitCell.x - 1;
            if (firstUnitCellX >= 0 && availableAttackCellHashes.has((firstUnitCellX << 4) | newUnitCellY)) {
                return { x: firstUnitCellX, y: newUnitCellY };
            }

            const secondUnitCellX = unitCell.x + 1;
            if (
                secondUnitCellX < this.gridSettings.getGridSize() &&
                availableAttackCellHashes.has((secondUnitCellX << 4) | newUnitCellY)
            ) {
                return { x: secondUnitCellX, y: newUnitCellY };
            }
        } else {
            const firstUnitCellX = unitCell.x + 1;
            if (
                firstUnitCellX < this.gridSettings.getGridSize() &&
                availableAttackCellHashes.has((firstUnitCellX << 4) | newUnitCellY)
            ) {
                return { x: firstUnitCellX, y: newUnitCellY };
            }

            const secondUnitCellX = unitCell.x - 1;
            if (secondUnitCellX >= 0 && availableAttackCellHashes.has((secondUnitCellX << 4) | newUnitCellY)) {
                return { x: secondUnitCellX, y: newUnitCellY };
            }
        }

        return undefined;
    }

    private getClosestAttackCell(
        mousePosition: HoCMath.XY,
        isCornerPos: boolean,
        cells?: HoCMath.XY[],
    ): HoCMath.XY | undefined {
        if (!cells?.length) {
            return undefined;
        }

        const attackCells: HoCMath.IXYDistance[] = [];
        for (const c of cells) {
            const position = GridMath.getPositionForCell(
                c,
                this.gridSettings.getMinX(),
                this.gridSettings.getStep(),
                this.gridSettings.getHalfStep(),
            );
            const newPosition = {
                x: position.x - this.gridSettings.getHalfStep(),
                y: position.y - this.gridSettings.getHalfStep(),
            };
            attackCells.push({
                xy: c,
                distance: HoCMath.getDistance(mousePosition, newPosition),
            });
        }
        if (isCornerPos) {
            attackCells.sort((a: HoCMath.IXYDistance, b: HoCMath.IXYDistance) => {
                if (a.distance > b.distance) {
                    return -1;
                }
                if (b.distance > a.distance) {
                    return 1;
                }
                return 0;
            });
        } else {
            attackCells.sort((a: HoCMath.IXYDistance, b: HoCMath.IXYDistance) => {
                if (a.distance < b.distance) {
                    return -1;
                }
                if (a.distance > b.distance) {
                    return 1;
                }
                return 0;
            });
        }

        return attackCells[0].xy;
    }

    private isCornerMousePosition(
        unitPositionX: number,
        unitPositionY: number,
        xMin: number,
        xMax: number,
        yMin: number,
        yMax: number,
        mouseCell: HoCMath.XY,
        mousePosition: HoCMath.XY,
    ): boolean {
        const part = this.gridSettings.getCellSize() / 6;
        const xLeft = unitPositionX - part;
        const xRight = unitPositionX + part;
        const yDown = unitPositionY - part;
        const yTop = unitPositionY + part;

        return (
            (mouseCell.x === xMin && mouseCell.y === yMax && mousePosition.x < xLeft && mousePosition.y > yTop) ||
            (mouseCell.x === xMax && mouseCell.y === yMax && mousePosition.x > xRight && mousePosition.y > yTop) ||
            (mouseCell.x === xMax && mouseCell.y === yMin && mousePosition.x > xRight && mousePosition.y < yDown) ||
            (mouseCell.x === xMin && mouseCell.y === yMin && mousePosition.x < xLeft && mousePosition.y < yDown)
        );
    }

    private captureRoute(
        knownPaths: Map<number, IWeightedRoute[]>,
        key: number,
        weightedRoute: IWeightedRoute,
    ): boolean {
        const knownRoutes = knownPaths.get(key);
        let captured = false;
        if (!knownRoutes) {
            knownPaths.set(key, [weightedRoute]);
            captured = true;
        } else {
            const indices = [];
            let index = 0;
            for (const knownRoute of knownRoutes.values()) {
                if (knownRoute.weight < weightedRoute.weight) {
                    index++;
                    continue;
                } else if (knownRoute.weight === weightedRoute.weight) {
                    indices.push(index);
                } else if (!indices.length) {
                    knownRoutes.push(weightedRoute);
                } else {
                    const randIndex = indices[HoCLib.getRandomInt(0, indices.length)];
                    knownPaths.set(key, [
                        ...knownRoutes.slice(0, randIndex),
                        weightedRoute,
                        ...knownRoutes.slice(randIndex),
                    ]);
                    captured = true;
                }
                index++;
            }
        }

        return captured;
    }

    private filterUnallowedDestinations(movePath: IMovePath, matrix: number[][], isSmallUnit: boolean): IMovePath {
        const filteredCells: HoCMath.XY[] = [];
        const hashes: Set<number> = new Set();
        const { knownPaths } = movePath;

        for (const cell of movePath.cells) {
            const key = (cell.x << 4) | cell.y;
            if (isSmallUnit) {
                if (!knownPaths.has(key)) {
                    continue;
                }
            }

            const matrixElement = HoCMath.matrixElementOrDefault(matrix, cell.x, cell.y, 0);
            if (
                matrixElement === ObstacleType.LAVA ||
                matrixElement === ObstacleType.WATER ||
                matrixElement === ObstacleType.BLOCK
            ) {
                continue;
            }

            filteredCells.push(cell);
            hashes.add(key);
        }

        return {
            cells: filteredCells,
            knownPaths,
            hashes,
        };
    }

    public calculateClosestAttackFrom(
        mousePosition: HoCMath.XY,
        attackCells: HoCMath.XY[],
        unitCells: HoCMath.XY[],
        unitIsSmallSize: boolean,
        attackRange: number,
        targetUnit: Unit,
        attackCellHashesToLargeCells: Map<number, HoCMath.XY[]>,
    ): HoCMath.XY | undefined {
        if (!targetUnit || !attackCells.length || !unitCells.length) {
            return undefined;
        }

        const mouseCell = GridMath.getCellForPosition(this.gridSettings, mousePosition);
        if (!mouseCell) {
            return undefined;
        }

        let foundCell = false;
        let xMin = Number.MAX_SAFE_INTEGER;
        let xMax = Number.MIN_SAFE_INTEGER;
        let yMin = Number.MAX_SAFE_INTEGER;
        let yMax = Number.MIN_SAFE_INTEGER;

        for (const uc of unitCells) {
            xMin = Math.min(xMin, uc.x);
            xMax = Math.max(xMax, uc.x);
            yMin = Math.min(yMin, uc.y);
            yMax = Math.max(yMax, uc.y);
            if (uc.x === mouseCell.x && uc.y === mouseCell.y) {
                foundCell = true;
            }
        }
        if (!foundCell) {
            return undefined;
        }

        const positionForMouseCell = GridMath.getPositionForCell(
            mouseCell,
            this.gridSettings.getMinX(),
            this.gridSettings.getStep(),
            this.gridSettings.getHalfStep(),
        );

        const unitPositionX = positionForMouseCell.x;
        const unitPositionY = positionForMouseCell.y;

        const part = targetUnit.isSmallSize() ? this.gridSettings.getCellSize() / 6 : 0;
        const xLeft = unitPositionX - part;
        const xRight = unitPositionX + part;
        const yDown = unitPositionY - part;
        const yTop = unitPositionY + part;

        HoCLib.shuffle(attackCells);

        const availableAttackCells: HoCMath.XY[] = [];
        const availableAttackCellHashes: Set<number> = new Set();
        for (const position of attackCells) {
            if (
                Math.abs(position.x - mouseCell.x) <= attackRange &&
                Math.abs(position.y - mouseCell.y) <= attackRange
            ) {
                availableAttackCells.push(position);
                availableAttackCellHashes.add((position.x << 4) | position.y);
            }
        }

        if (availableAttackCells) {
            let cornerPos = false;
            if (!targetUnit.isSmallSize()) {
                cornerPos =
                    (mouseCell.x === xMin &&
                        mouseCell.y === yMax &&
                        mousePosition.x < unitPositionX &&
                        mousePosition.y > unitPositionY) ||
                    (mouseCell.x === xMax &&
                        mouseCell.y === yMax &&
                        mousePosition.x > unitPositionX &&
                        mousePosition.y > unitPositionY) ||
                    (mouseCell.x === xMax &&
                        mouseCell.y === yMin &&
                        mousePosition.x > unitPositionX &&
                        mousePosition.y < unitPositionY) ||
                    (mouseCell.x === xMin &&
                        mouseCell.y === yMin &&
                        mousePosition.x < unitPositionX &&
                        mousePosition.y < unitPositionY);
            }

            if (
                (!targetUnit.isSmallSize() && !cornerPos) ||
                (targetUnit.isSmallSize() &&
                    mousePosition.x >= xLeft &&
                    mousePosition.x < xRight &&
                    mousePosition.y >= yDown &&
                    mousePosition.y < yTop)
            ) {
                let closestDistance = Number.MAX_SAFE_INTEGER;
                let closestCell = availableAttackCells[0];
                for (const ap of availableAttackCells) {
                    const distance = HoCMath.getDistance(
                        mousePosition,
                        GridMath.getPositionForCell(
                            ap,
                            this.gridSettings.getMinX(),
                            this.gridSettings.getStep(),
                            this.gridSettings.getHalfStep(),
                        ),
                    );
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestCell = ap;
                    }
                }

                if (closestCell && !unitIsSmallSize) {
                    return this.getClosestAttackCell(
                        mousePosition,
                        this.isCornerMousePosition(
                            unitPositionX,
                            unitPositionY,
                            xMin,
                            xMax,
                            yMin,
                            yMax,
                            mouseCell,
                            mousePosition,
                        ),
                        attackCellHashesToLargeCells.get((closestCell.x << 4) | closestCell.y),
                    );
                }

                return closestCell;
            }

            if (mousePosition.x < xLeft && mousePosition.y < yDown) {
                const newUnitCellPositionX = mouseCell.x - 1;
                const newUnitCellPositionY = mouseCell.y - 1;

                if (newUnitCellPositionX >= 0 && newUnitCellPositionY >= 0) {
                    const closestCell = this.attackCellA(
                        mouseCell,
                        newUnitCellPositionX,
                        newUnitCellPositionY,
                        availableAttackCellHashes,
                        targetUnit,
                    );
                    if (closestCell && !unitIsSmallSize) {
                        return this.getClosestAttackCell(
                            mousePosition,
                            this.isCornerMousePosition(
                                unitPositionX,
                                unitPositionY,
                                xMin,
                                xMax,
                                yMin,
                                yMax,
                                mouseCell,
                                mousePosition,
                            ),
                            attackCellHashesToLargeCells.get((closestCell.x << 4) | closestCell.y),
                        );
                    }
                    return closestCell;
                }
            } else if (mousePosition.x > xRight && mousePosition.y > yTop) {
                const newUnitCellPositionX = mouseCell.x + 1;
                const newUnitCellPositionY = mouseCell.y + 1;

                if (
                    newUnitCellPositionX < this.gridSettings.getGridSize() &&
                    newUnitCellPositionY < this.gridSettings.getGridSize()
                ) {
                    const closestCell = this.attackCellB(
                        mouseCell,
                        newUnitCellPositionX,
                        newUnitCellPositionY,
                        availableAttackCellHashes,
                        targetUnit,
                    );
                    if (closestCell && !unitIsSmallSize) {
                        return this.getClosestAttackCell(
                            mousePosition,
                            this.isCornerMousePosition(
                                unitPositionX,
                                unitPositionY,
                                xMin,
                                xMax,
                                yMin,
                                yMax,
                                mouseCell,
                                mousePosition,
                            ),
                            attackCellHashesToLargeCells.get((closestCell.x << 4) | closestCell.y),
                        );
                    }
                    return closestCell;
                }
            } else if (mousePosition.x < xLeft && mousePosition.y > yTop) {
                const newUnitCellPositionX = mouseCell.x - 1;
                const newUnitCellPositionY = mouseCell.y + 1;

                if (newUnitCellPositionX >= 0 && newUnitCellPositionY < this.gridSettings.getGridSize()) {
                    const closestCell = this.attackCellB(
                        mouseCell,
                        newUnitCellPositionX,
                        newUnitCellPositionY,
                        availableAttackCellHashes,
                        targetUnit,
                    );
                    if (closestCell && !unitIsSmallSize) {
                        return this.getClosestAttackCell(
                            mousePosition,
                            this.isCornerMousePosition(
                                unitPositionX,
                                unitPositionY,
                                xMin,
                                xMax,
                                yMin,
                                yMax,
                                mouseCell,
                                mousePosition,
                            ),
                            attackCellHashesToLargeCells.get((closestCell.x << 4) | closestCell.y),
                        );
                    }
                    return closestCell;
                }
            } else if (mousePosition.x > xRight && mousePosition.y < yDown) {
                const newUnitCellPositionX = mouseCell.x + 1;
                const newUnitCellPositionY = mouseCell.y - 1;

                if (newUnitCellPositionX < this.gridSettings.getGridSize() && newUnitCellPositionY >= 0) {
                    const closestCell = this.attackCellA(
                        mouseCell,
                        newUnitCellPositionX,
                        newUnitCellPositionY,
                        availableAttackCellHashes,
                        targetUnit,
                    );
                    if (closestCell && !unitIsSmallSize) {
                        return this.getClosestAttackCell(
                            mousePosition,
                            this.isCornerMousePosition(
                                unitPositionX,
                                unitPositionY,
                                xMin,
                                xMax,
                                yMin,
                                yMax,
                                mouseCell,
                                mousePosition,
                            ),
                            attackCellHashesToLargeCells.get((closestCell.x << 4) | closestCell.y),
                        );
                    }
                    return closestCell;
                }
            } else if (mousePosition.x > xRight) {
                const newUnitCellPositionX = mouseCell.x + 1;
                if (availableAttackCellHashes.has((newUnitCellPositionX << 4) | mouseCell.y)) {
                    const p = { x: newUnitCellPositionX, y: mouseCell.y };
                    if (!unitIsSmallSize) {
                        return this.getClosestAttackCell(
                            mousePosition,
                            this.isCornerMousePosition(
                                unitPositionX,
                                unitPositionY,
                                xMin,
                                xMax,
                                yMin,
                                yMax,
                                mouseCell,
                                mousePosition,
                            ),
                            attackCellHashesToLargeCells.get((p.x << 4) | p.y),
                        );
                    }
                    return p;
                }

                const closestCell = this.attackCellC(
                    mouseCell,
                    newUnitCellPositionX,
                    availableAttackCellHashes,
                    targetUnit,
                );
                if (closestCell && !unitIsSmallSize) {
                    return this.getClosestAttackCell(
                        mousePosition,
                        this.isCornerMousePosition(
                            unitPositionX,
                            unitPositionY,
                            xMin,
                            xMax,
                            yMin,
                            yMax,
                            mouseCell,
                            mousePosition,
                        ),
                        attackCellHashesToLargeCells.get((closestCell.x << 4) | closestCell.y),
                    );
                }
                return closestCell;
            } else if (mousePosition.x < xLeft) {
                const newUnitCellPositionX = mouseCell.x - 1;
                if (availableAttackCellHashes.has((newUnitCellPositionX << 4) | mouseCell.y)) {
                    const p = { x: newUnitCellPositionX, y: mouseCell.y };
                    if (!unitIsSmallSize) {
                        return this.getClosestAttackCell(
                            mousePosition,
                            this.isCornerMousePosition(
                                unitPositionX,
                                unitPositionY,
                                xMin,
                                xMax,
                                yMin,
                                yMax,
                                mouseCell,
                                mousePosition,
                            ),
                            attackCellHashesToLargeCells.get((p.x << 4) | p.y),
                        );
                    }
                    return p;
                }

                const closestCell = this.attackCellC(
                    mouseCell,
                    newUnitCellPositionX,
                    availableAttackCellHashes,
                    targetUnit,
                );
                if (closestCell && !unitIsSmallSize) {
                    return this.getClosestAttackCell(
                        mousePosition,
                        this.isCornerMousePosition(
                            unitPositionX,
                            unitPositionY,
                            xMin,
                            xMax,
                            yMin,
                            yMax,
                            mouseCell,
                            mousePosition,
                        ),
                        attackCellHashesToLargeCells.get((closestCell.x << 4) | closestCell.y),
                    );
                }
                return closestCell;
            } else if (mousePosition.y > yTop) {
                const newUnitCellPositionY = mouseCell.y + 1;
                if (availableAttackCellHashes.has((mouseCell.x << 4) | newUnitCellPositionY)) {
                    const p = { x: mouseCell.x, y: newUnitCellPositionY };
                    if (!unitIsSmallSize) {
                        return this.getClosestAttackCell(
                            mousePosition,
                            this.isCornerMousePosition(
                                unitPositionX,
                                unitPositionY,
                                xMin,
                                xMax,
                                yMin,
                                yMax,
                                mouseCell,
                                mousePosition,
                            ),
                            attackCellHashesToLargeCells.get((p.x << 4) | p.y),
                        );
                    }
                    return p;
                }

                const closestCell = this.attackCellD(
                    mouseCell,
                    newUnitCellPositionY,
                    availableAttackCellHashes,
                    targetUnit,
                );
                if (closestCell && !unitIsSmallSize) {
                    return this.getClosestAttackCell(
                        mousePosition,
                        this.isCornerMousePosition(
                            unitPositionX,
                            unitPositionY,
                            xMin,
                            xMax,
                            yMin,
                            yMax,
                            mouseCell,
                            mousePosition,
                        ),
                        attackCellHashesToLargeCells.get((closestCell.x << 4) | closestCell.y),
                    );
                }
                return closestCell;
            } else if (mousePosition.y < yDown) {
                const newUnitCellPositionY = mouseCell.y - 1;
                if (availableAttackCellHashes.has((mouseCell.x << 4) | newUnitCellPositionY)) {
                    const p = { x: mouseCell.x, y: newUnitCellPositionY };
                    if (!unitIsSmallSize) {
                        return this.getClosestAttackCell(
                            mousePosition,
                            this.isCornerMousePosition(
                                unitPositionX,
                                unitPositionY,
                                xMin,
                                xMax,
                                yMin,
                                yMax,
                                mouseCell,
                                mousePosition,
                            ),
                            attackCellHashesToLargeCells.get((p.x << 4) | p.y),
                        );
                    }
                    return p;
                }

                const closestCell = this.attackCellD(
                    mouseCell,
                    newUnitCellPositionY,
                    availableAttackCellHashes,
                    targetUnit,
                );
                if (closestCell && !unitIsSmallSize) {
                    return this.getClosestAttackCell(
                        mousePosition,
                        this.isCornerMousePosition(
                            unitPositionX,
                            unitPositionY,
                            xMin,
                            xMax,
                            yMin,
                            yMax,
                            mouseCell,
                            mousePosition,
                        ),
                        attackCellHashesToLargeCells.get((closestCell.x << 4) | closestCell.y),
                    );
                }
                return closestCell;
            }
        }

        return undefined;
    }

    public areCellsFormingSquare(preStart: boolean, cells?: HoCMath.XY[]): boolean {
        if (!cells || cells.length !== 4) {
            return false;
        }

        let xMin = Number.MAX_SAFE_INTEGER;
        let xMax = Number.MIN_SAFE_INTEGER;
        let yMin = Number.MAX_SAFE_INTEGER;
        let yMax = Number.MIN_SAFE_INTEGER;

        const knownHashes: Set<string> = new Set();

        for (const c of cells) {
            if (preStart) {
                if (c.x < -2 || c.x >= this.gridSettings.getGridSize() + 2) {
                    return false;
                }
                if (c.x < 0 && c.y < PathHelper.Y_FACTION_ICONS_OFFSET) {
                    return false;
                }
                if (c.y < -2 || c.y >= this.gridSettings.getGridSize() + 2) {
                    return false;
                }
            } else if (
                c.x < 0 ||
                c.y < 0 ||
                c.x >= this.gridSettings.getGridSize() ||
                c.y >= this.gridSettings.getGridSize()
            ) {
                return false;
            }

            const key = `${c.x}:${c.y}`;
            if (knownHashes.has(key)) {
                return false;
            }
            knownHashes.add(key);
            xMin = Math.min(xMin, c.x);
            xMax = Math.max(xMax, c.x);
            yMin = Math.min(yMin, c.y);
            yMax = Math.max(yMax, c.y);
        }

        return xMax - xMin === 1 && yMax - yMin === 1;
    }

    public getClosestSquareCellIndices(
        mousePosition: HoCMath.XY,
        allowedPlacementCellHashes: Set<number>,
        cellToUnitPreRound?: Map<string, Unit>,
        unitCells?: HoCMath.XY[],
        allowedToMoveThere?: Set<number>,
        currentActiveKnownPaths?: Map<number, IWeightedRoute[]>,
    ): HoCMath.XY[] | undefined {
        const squareCells: HoCMath.XY[] = [];
        const mouseCell = GridMath.getCellForPosition(this.gridSettings, mousePosition);
        const neightborCells: HoCMath.IXYDistance[] = [];

        const hasStarted = !!allowedToMoveThere;

        const isOneOfTheUnitCells = (cellToCheck: HoCMath.XY): boolean => {
            if (!unitCells?.length) {
                return false;
            }

            for (const c of unitCells) {
                if (c.x === cellToCheck.x && c.y === cellToCheck.y) {
                    return true;
                }
            }

            return false;
        };

        const isAllowed = (cellKey: number): boolean => {
            if (!allowedPlacementCellHashes.size && !allowedToMoveThere) {
                return false;
            }

            return allowedPlacementCellHashes.has(cellKey) || (!!allowedToMoveThere && allowedToMoveThere.has(cellKey));
        };

        const getReachable = (): HoCMath.XY[] => {
            const reachable: HoCMath.XY[] = [];

            let maxX = Number.MIN_SAFE_INTEGER;
            let maxY = Number.MIN_SAFE_INTEGER;

            for (const c of squareCells) {
                maxX = Math.max(maxX, c.x);
                maxY = Math.max(maxY, c.y);
            }

            for (const c of squareCells) {
                // need to make sure that top right corner is reachable
                if (
                    currentActiveKnownPaths &&
                    squareCells.length === 4 &&
                    c.x === maxX &&
                    c.y === maxY &&
                    !currentActiveKnownPaths.has((c.x << 4) | c.y)
                ) {
                    continue;
                }

                reachable.push(c);
            }

            return reachable;
        };

        const yStart = PathHelper.Y_FACTION_ICONS_OFFSET - 1;

        if (mouseCell) {
            const mouseCellKey = (mouseCell.x << 4) | mouseCell.y;
            if (isOneOfTheUnitCells(mouseCell)) {
                squareCells.push(mouseCell);
            } else if (
                !hasStarted &&
                ((mouseCell.x < 0 && mouseCell.y > yStart) || mouseCell.x >= this.gridSettings.getGridSize())
            ) {
                if (!cellToUnitPreRound?.has(`${mouseCell.x}:${mouseCell.y}`)) {
                    squareCells.push(mouseCell);
                }
            } else if (!cellToUnitPreRound?.has(`${mouseCell.x}:${mouseCell.y}`) && isAllowed(mouseCellKey)) {
                squareCells.push(mouseCell);
            }

            const cellsToCheck = this.getNeighborCells(mouseCell, new Set([mouseCellKey]), true, true, !hasStarted);
            for (const c of cellsToCheck) {
                const cellPosition = GridMath.getPositionForCell(
                    c,
                    this.gridSettings.getMinX(),
                    this.gridSettings.getStep(),
                    this.gridSettings.getHalfStep(),
                );
                neightborCells.push({
                    xy: c,
                    distance: HoCMath.getDistance(mousePosition, {
                        x: cellPosition.x,
                        y: cellPosition.y,
                    }),
                });
            }
        }

        if (neightborCells.length >= 3) {
            neightborCells.sort((a: HoCMath.IXYDistance, b: HoCMath.IXYDistance) => {
                if (a.distance < b.distance) {
                    return -1;
                }
                if (a.distance > b.distance) {
                    return 1;
                }
                return 0;
            });
            let refCell = mouseCell;
            let skipFirst = false;

            if (!refCell) {
                refCell = neightborCells[0].xy;
                const refCellKey = (refCell.x << 4) | refCell.y;
                if (isOneOfTheUnitCells(refCell)) {
                    squareCells.push(refCell);
                } else if (
                    !hasStarted &&
                    ((refCell.x < 0 && refCell.y > yStart) || refCell.x >= this.gridSettings.getGridSize())
                ) {
                    if (!cellToUnitPreRound?.has(`${refCell.x}:${refCell.y}`)) {
                        squareCells.push(refCell);
                    }
                } else if (!cellToUnitPreRound?.has(`${refCell.x}:${refCell.y}`) && isAllowed(refCellKey)) {
                    squareCells.push(refCell);
                }
                skipFirst = true;
            }

            for (const nc of neightborCells) {
                if (skipFirst) {
                    skipFirst = false;
                    continue;
                }
                let needToAdd = false;
                for (const sc of squareCells) {
                    const absX = Math.abs(sc.x - nc.xy.x);
                    if (absX > 1) {
                        needToAdd = false;
                        break;
                    }
                    const absY = Math.abs(sc.y - nc.xy.y);
                    if (absY > 1) {
                        needToAdd = false;
                        break;
                    }

                    needToAdd = true;
                }
                if (needToAdd) {
                    const ncKey = (nc.xy.x << 4) | nc.xy.y;
                    if (isOneOfTheUnitCells(nc.xy)) {
                        squareCells.push(nc.xy);
                    } else if (
                        !hasStarted &&
                        ((nc.xy.x < 0 && nc.xy.y > yStart) || nc.xy.x >= this.gridSettings.getGridSize())
                    ) {
                        if (!cellToUnitPreRound?.has(`${nc.xy.x}:${nc.xy.y}`)) {
                            squareCells.push(nc.xy);
                        }
                    } else if (!cellToUnitPreRound?.has(`${nc.xy.x}:${nc.xy.y}`) && isAllowed(ncKey)) {
                        squareCells.push(nc.xy);
                    }
                }
                if (squareCells.length >= 4) {
                    break;
                }
            }
        } else {
            return undefined;
        }

        return getReachable();
    }

    private getLargeUnitAttackCells(
        attackPosition: HoCMath.XY,
        attackerBodyCellTopRight: HoCMath.XY,
        enemyCell: HoCMath.XY,
        currentActiveKnownPaths: Map<number, IWeightedRoute[]>,
        fromPathHashes?: Set<number>,
    ): HoCMath.XY[] {
        const attackCells: HoCMath.XY[] = [];

        if (!fromPathHashes?.size) {
            return attackCells;
        }

        const verifyAndPush = (cell: HoCMath.XY) => {
            const cellsToCheck: HoCMath.XY[] = [cell];
            const isSelfCell = cell.x === attackerBodyCellTopRight.x && cell.y === attackerBodyCellTopRight.y;
            if (!isSelfCell && !currentActiveKnownPaths.has((cell.x << 4) | cell.y)) {
                return;
            }

            cellsToCheck.push({ x: cell.x - 1, y: cell.y });
            cellsToCheck.push({ x: cell.x - 1, y: cell.y - 1 });
            cellsToCheck.push({ x: cell.x, y: cell.y - 1 });

            let allCellsCompliant = true;
            for (const ctc of cellsToCheck) {
                if (ctc.x === enemyCell.x && ctc.y === enemyCell.y) {
                    allCellsCompliant = false;
                    break;
                }
                if (
                    ctc.x < 0 ||
                    ctc.x >= this.gridSettings.getGridSize() ||
                    ctc.y < 0 ||
                    ctc.y >= this.gridSettings.getGridSize() ||
                    !fromPathHashes.has((ctc.x << 4) | ctc.y)
                ) {
                    allCellsCompliant = false;
                    break;
                }
            }
            if (allCellsCompliant) {
                attackCells.push(cell);
            }
        };

        if (attackPosition.x < enemyCell.x && attackPosition.y < enemyCell.y) {
            verifyAndPush(attackPosition);
            verifyAndPush({ x: attackPosition.x, y: attackPosition.y + 1 });
            verifyAndPush({ x: attackPosition.x + 1, y: attackPosition.y });
            return attackCells;
        }
        if (attackPosition.x > enemyCell.x && attackPosition.y > enemyCell.y) {
            verifyAndPush({ x: attackPosition.x + 1, y: attackPosition.y + 1 });
            verifyAndPush({ x: attackPosition.x + 1, y: attackPosition.y });
            verifyAndPush({ x: attackPosition.x, y: attackPosition.y + 1 });
            return attackCells;
        }
        if (attackPosition.x < enemyCell.x && attackPosition.y > enemyCell.y) {
            verifyAndPush(attackPosition);
            verifyAndPush({ x: attackPosition.x, y: attackPosition.y + 1 });
            verifyAndPush({ x: attackPosition.x + 1, y: attackPosition.y + 1 });
            return attackCells;
        }
        if (attackPosition.x > enemyCell.x && attackPosition.y < enemyCell.y) {
            verifyAndPush(attackPosition);
            verifyAndPush({ x: attackPosition.x + 1, y: attackPosition.y + 1 });
            verifyAndPush({ x: attackPosition.x + 1, y: attackPosition.y });
            return attackCells;
        }

        if (attackPosition.x < enemyCell.x) {
            verifyAndPush(attackPosition);
            verifyAndPush({ x: attackPosition.x, y: attackPosition.y + 1 });
            return attackCells;
        }
        if (attackPosition.y > enemyCell.y) {
            verifyAndPush({ x: attackPosition.x, y: attackPosition.y + 1 });
            verifyAndPush({ x: attackPosition.x + 1, y: attackPosition.y + 1 });
            return attackCells;
        }
        if (attackPosition.y < enemyCell.y) {
            verifyAndPush({ x: attackPosition.x, y: attackPosition.y });
            verifyAndPush({ x: attackPosition.x + 1, y: attackPosition.y });
            return attackCells;
        }
        if (attackPosition.x > enemyCell.x) {
            verifyAndPush({ x: attackPosition.x + 1, y: attackPosition.y });
            verifyAndPush({ x: attackPosition.x + 1, y: attackPosition.y + 1 });
            return attackCells;
        }
        return attackCells;
    }

    public attackMeleeAllowed(
        byUnit: Unit,
        fromPath: HoCMath.XY[],
        currentActiveKnownPaths: Map<number, IWeightedRoute[]>,
        enemyTeam: Unit[],
        positions: Map<string, HoCMath.XY>,
    ): IAttackTargets {
        const canAttackUnits: Unit[] = [];
        const canAttackUnitIds: Set<string> = new Set();
        const possibleAttackCells: HoCMath.XY[] = [];
        const possibleAttackCellHashes: Set<number> = new Set();
        const possibleAttackCellHashesToLargeCells: Map<number, HoCMath.XY[]> = new Map();

        let fromPathHashes: Set<number> | undefined;
        let currentCells: HoCMath.XY[];
        if (byUnit.isSmallSize()) {
            const currentCell = GridMath.getCellForPosition(this.gridSettings, byUnit.getPosition());
            if (currentCell) {
                fromPath.unshift(currentCell);
                currentCells = [currentCell];
            } else {
                currentCells = [];
            }
        } else {
            currentCells = GridMath.getCellsAroundPosition(this.gridSettings, byUnit.getPosition());
            for (const c of currentCells) {
                fromPath.unshift(c);
            }
            fromPathHashes = new Set();
            for (const fp of fromPath) {
                fromPathHashes.add((fp.x << 4) | fp.y);
            }
        }

        let maxX = Number.MIN_SAFE_INTEGER;
        let maxY = Number.MIN_SAFE_INTEGER;

        for (const c of currentCells) {
            maxX = Math.max(maxX, c.x);
            maxY = Math.max(maxY, c.y);
        }

        for (const u of enemyTeam) {
            const position = positions.get(u.getId());
            if (!position || !GridMath.isPositionWithinGrid(this.gridSettings, position)) {
                continue;
            }

            let bodyCells: HoCMath.XY[];
            if (u.isSmallSize()) {
                const bodyCellPos = GridMath.getCellForPosition(this.gridSettings, position);
                if (!bodyCellPos) {
                    continue;
                }
                bodyCells = [bodyCellPos];
            } else {
                bodyCells = GridMath.getCellsAroundPosition(this.gridSettings, u.getPosition());
            }

            for (const bodyCellPos of bodyCells) {
                for (const possiblePos of fromPath) {
                    if (
                        Math.abs(bodyCellPos.x - possiblePos.x) <= byUnit.getAttackRange() &&
                        Math.abs(bodyCellPos.y - possiblePos.y) <= byUnit.getAttackRange()
                    ) {
                        const posHash = (possiblePos.x << 4) | possiblePos.y;
                        let addPos = false;
                        if (byUnit.isSmallSize()) {
                            addPos = true;
                        } else {
                            const getLargeUnitAttackCells = this.getLargeUnitAttackCells(
                                possiblePos,
                                { x: maxX, y: maxY },
                                bodyCellPos,
                                currentActiveKnownPaths,
                                fromPathHashes,
                            );
                            if (getLargeUnitAttackCells?.length) {
                                addPos = true;
                                possibleAttackCellHashesToLargeCells.set(posHash, getLargeUnitAttackCells);
                            }
                        }

                        if (addPos) {
                            if (!canAttackUnitIds.has(u.getId())) {
                                canAttackUnits.push(u);
                                canAttackUnitIds.add(u.getId());
                            }

                            if (!possibleAttackCellHashes.has(posHash)) {
                                possibleAttackCells.push(possiblePos);
                                possibleAttackCellHashes.add(posHash);
                            }
                        }
                    }
                }
            }
        }

        return {
            units: canAttackUnits,
            unitIds: canAttackUnitIds,
            attackCells: possibleAttackCells,
            attackCellHashes: possibleAttackCellHashes,
            attackCellHashesToLargeCells: possibleAttackCellHashesToLargeCells,
        };
    }

    public getMovePath(
        currentCell: HoCMath.XY,
        matrix: number[][],
        maxSteps: number,
        aggrBoard?: number[][],
        canFly = false,
        isSmallUnit = true,
    ): IMovePath {
        const knownPaths: Map<number, IWeightedRoute[]> = new Map();
        const allowed: HoCMath.XY[] = [];
        let currentCellKeys: number[];
        if (isSmallUnit) {
            currentCellKeys = [(currentCell.x << 4) | currentCell.y];
        } else {
            currentCellKeys = [
                ((currentCell.x - 1) << 4) | currentCell.y,
                (currentCell.x << 4) | (currentCell.y - 1),
                ((currentCell.x - 1) << 4) | (currentCell.y - 1),
                (currentCell.x << 4) | currentCell.y,
            ];
        }
        const initialCellKeys: Set<number> = new Set(currentCellKeys);
        const visited: Set<number> = new Set([(currentCell.x << 4) | currentCell.y]);
        const allowedToMoveThere: Set<number> = new Set();
        const stepsRemaining: Map<number, number> = new Map();
        stepsRemaining.set((currentCell.x << 4) | currentCell.y, maxSteps);
        const queue: IWeightedRoute[] = [
            {
                cell: currentCell,
                route: [currentCell],
                weight: 0,
                firstAggrMet: false,
            },
        ];

        const aggr = (cells: HoCMath.XY[], weightedRoute: IWeightedRoute): number => {
            if (!cells.length) {
                return 1;
            }

            if (aggrBoard) {
                let sumAggr = 0;
                for (const cell of cells) {
                    sumAggr += aggrBoard[cell.x][cell.y] || 1;
                }

                const aggrValue = sumAggr / cells.length;
                if (aggrValue > 1) {
                    if (!weightedRoute.firstAggrMet) {
                        weightedRoute.firstAggrMet = true;
                        return 1;
                    }
                }
                return aggrValue;
            }

            return 1;
        };

        while (queue.length) {
            const curWeightedRoute = queue.shift();
            if (!curWeightedRoute) {
                break;
            }

            const cur = curWeightedRoute.cell;

            const key = (cur.x << 4) | cur.y;
            for (const n of this.getNeighborCells(cur, visited, isSmallUnit)) {
                const keyNeighbor = (n.x << 4) | n.y;
                const el1 = HoCMath.matrixElementOrDefault(matrix, n.x, n.y, 0);
                if (isSmallUnit) {
                    if (
                        ((!canFly && el1) ||
                            (canFly && el1 && el1 !== ObstacleType.LAVA && el1 !== ObstacleType.WATER)) &&
                        !initialCellKeys.has(keyNeighbor)
                    ) {
                        visited.add(keyNeighbor);
                        continue;
                    }
                } else {
                    const unitKeyLeft = ((n.x - 1) << 4) | n.y;
                    const unitKeyLeftDown = ((n.x - 1) << 4) | (n.y - 1);
                    const unitKeyDown = (n.x << 4) | (n.y - 1);
                    const el2 = HoCMath.matrixElementOrDefault(matrix, n.x - 1, n.y, 0);
                    const el3 = HoCMath.matrixElementOrDefault(matrix, n.x - 1, n.y - 1, 0);
                    const el4 = HoCMath.matrixElementOrDefault(matrix, n.x, n.y - 1, 0);
                    if (
                        (((!canFly && el1) ||
                            (canFly && el1 && el1 !== ObstacleType.LAVA && el1 !== ObstacleType.WATER)) &&
                            !initialCellKeys.has(keyNeighbor)) ||
                        (((!canFly && el2) ||
                            (canFly && el2 && el2 !== ObstacleType.LAVA && el2 !== ObstacleType.WATER)) &&
                            !initialCellKeys.has(unitKeyLeft)) ||
                        (((!canFly && el3) ||
                            (canFly && el3 && el3 !== ObstacleType.LAVA && el3 !== ObstacleType.WATER)) &&
                            !initialCellKeys.has(unitKeyLeftDown)) ||
                        (((!canFly && el4) ||
                            (canFly && el4 && el4 !== ObstacleType.LAVA && el4 !== ObstacleType.WATER)) &&
                            !initialCellKeys.has(unitKeyDown))
                    ) {
                        visited.add(keyNeighbor);
                        continue;
                    }
                }

                const isDiagMove = cur.x !== n.x && cur.y !== n.y;
                const remaining = stepsRemaining.get(key) ?? maxSteps;
                if (isDiagMove) {
                    let moveCost: number;
                    if (isSmallUnit) {
                        if (canFly) {
                            moveCost = PathHelper.DIAGONAL_MOVE_COST;
                        } else {
                            moveCost = PathHelper.DIAGONAL_MOVE_COST * aggr([n], curWeightedRoute);
                        }
                    } else if (canFly) {
                        moveCost = PathHelper.DIAGONAL_MOVE_COST;
                    } else {
                        moveCost =
                            PathHelper.DIAGONAL_MOVE_COST *
                            aggr(
                                [n, { x: n.x - 1, y: n.y }, { x: n.x - 1, y: n.y - 1 }, { x: n.x, y: n.y - 1 }],
                                curWeightedRoute,
                            );
                    }

                    if (remaining >= moveCost) {
                        // disallow sneaking between diagonals
                        if (!canFly) {
                            const xA = cur.x - 1;
                            const yA = cur.y - 1;
                            const xB = cur.x + 1;
                            const yB = cur.y + 1;
                            if (xA === n.x && yA === n.y) {
                                if (isSmallUnit) {
                                    if (
                                        HoCMath.matrixElementOrDefault(matrix, xA, cur.y, 0) &&
                                        HoCMath.matrixElementOrDefault(matrix, cur.x, yA, 0)
                                    ) {
                                        continue;
                                    }
                                } else if (
                                    HoCMath.matrixElementOrDefault(matrix, cur.x - 2, cur.y, 0) ||
                                    HoCMath.matrixElementOrDefault(matrix, cur.x, cur.y - 2, 0)
                                ) {
                                    continue;
                                }
                            } else if (xB === n.x && yB === n.y) {
                                if (isSmallUnit) {
                                    if (
                                        HoCMath.matrixElementOrDefault(matrix, xB, cur.y, 0) &&
                                        HoCMath.matrixElementOrDefault(matrix, cur.x, yB, 0)
                                    ) {
                                        continue;
                                    }
                                } else if (
                                    HoCMath.matrixElementOrDefault(matrix, xA, yB, 0) ||
                                    HoCMath.matrixElementOrDefault(matrix, xB, yA, 0)
                                ) {
                                    continue;
                                }
                            } else if (xA === n.x && yB === n.y) {
                                if (isSmallUnit) {
                                    if (
                                        HoCMath.matrixElementOrDefault(matrix, xA, cur.y, 0) &&
                                        HoCMath.matrixElementOrDefault(matrix, cur.x, yB, 0)
                                    ) {
                                        continue;
                                    }
                                } else if (
                                    HoCMath.matrixElementOrDefault(matrix, cur.x - 2, yA, 0) ||
                                    HoCMath.matrixElementOrDefault(matrix, cur.x, yB, 0)
                                ) {
                                    continue;
                                }
                            } else if (xB === n.x && yA === n.y) {
                                if (isSmallUnit) {
                                    if (
                                        HoCMath.matrixElementOrDefault(matrix, xB, cur.y, 0) &&
                                        HoCMath.matrixElementOrDefault(matrix, cur.x, yA, 0)
                                    ) {
                                        continue;
                                    }
                                } else if (
                                    HoCMath.matrixElementOrDefault(matrix, xA, cur.y - 2, 0) ||
                                    HoCMath.matrixElementOrDefault(matrix, cur.x + 1, cur.y, 0)
                                ) {
                                    continue;
                                }
                            }
                        }

                        stepsRemaining.set(keyNeighbor, remaining - moveCost);
                        //                        curWeightedRoute.route.push(n);
                        const weightedRoute = {
                            cell: { x: n.x, y: n.y },
                            route: [...curWeightedRoute.route, n],
                            weight: curWeightedRoute.weight + moveCost,
                            firstAggrMet: curWeightedRoute.firstAggrMet,
                        };
                        if (this.captureRoute(knownPaths, keyNeighbor, weightedRoute)) {
                            if (!allowedToMoveThere.has(keyNeighbor)) {
                                allowedToMoveThere.add(keyNeighbor);
                                allowed.push({ x: n.x, y: n.y });
                            }
                            if (!isSmallUnit) {
                                const unitKeyLeft = ((n.x - 1) << 4) | n.y;
                                if (!allowedToMoveThere.has(unitKeyLeft)) {
                                    allowedToMoveThere.add(unitKeyLeft);
                                    allowed.push({ x: n.x - 1, y: n.y });
                                }
                                const unitKeyLeftDown = ((n.x - 1) << 4) | (n.y - 1);
                                if (!allowedToMoveThere.has(unitKeyLeftDown)) {
                                    allowedToMoveThere.add(unitKeyLeftDown);
                                    allowed.push({ x: n.x - 1, y: n.y - 1 });
                                }
                                const unitKeyDown = (n.x << 4) | (n.y - 1);
                                if (!allowedToMoveThere.has(unitKeyDown)) {
                                    allowedToMoveThere.add(unitKeyDown);
                                    allowed.push({ x: n.x, y: n.y - 1 });
                                }
                            }
                        }
                        queue.push(weightedRoute);
                        visited.add(keyNeighbor);
                    }
                } else {
                    let moveCost: number;
                    if (isSmallUnit) {
                        if (canFly) {
                            moveCost = 1;
                        } else {
                            moveCost = aggr([n], curWeightedRoute);
                        }
                    } else if (canFly) {
                        moveCost = 1;
                    } else {
                        moveCost = aggr(
                            [n, { x: n.x - 1, y: n.y }, { x: n.x - 1, y: n.y - 1 }, { x: n.x, y: n.y - 1 }],
                            curWeightedRoute,
                        );
                    }
                    if (remaining >= moveCost) {
                        stepsRemaining.set(keyNeighbor, remaining - moveCost);
                        const weightedRoute = {
                            cell: { x: n.x, y: n.y },
                            route: [...curWeightedRoute.route, n],
                            weight: curWeightedRoute.weight + moveCost,
                            firstAggrMet: curWeightedRoute.firstAggrMet,
                        };

                        if (this.captureRoute(knownPaths, keyNeighbor, weightedRoute)) {
                            if (!allowedToMoveThere.has(keyNeighbor)) {
                                allowedToMoveThere.add(keyNeighbor);
                                allowed.push({ x: n.x, y: n.y });
                            }
                            if (!isSmallUnit) {
                                const unitKeyLeft = ((n.x - 1) << 4) | n.y;
                                if (!allowedToMoveThere.has(unitKeyLeft)) {
                                    allowedToMoveThere.add(unitKeyLeft);
                                    allowed.push({ x: n.x - 1, y: n.y });
                                }
                                const unitKeyLeftDown = ((n.x - 1) << 4) | (n.y - 1);
                                if (!allowedToMoveThere.has(unitKeyLeftDown)) {
                                    allowedToMoveThere.add(unitKeyLeftDown);
                                    allowed.push({ x: n.x - 1, y: n.y - 1 });
                                }
                                const unitKeyDown = (n.x << 4) | (n.y - 1);
                                if (!allowedToMoveThere.has(unitKeyDown)) {
                                    allowedToMoveThere.add(unitKeyDown);
                                    allowed.push({ x: n.x, y: n.y - 1 });
                                }
                            }
                        }
                        queue.push(weightedRoute);
                        visited.add(keyNeighbor);

                        //          console.log(`${n.x}:${n.y} is diag: ${isDiagMove} stepsRemaining: ${stepsRemaining.get(keyNeighbor)}`);
                    }
                }
            }
        }

        const closestMoves = this.getNeighborCells(
            currentCell,
            new Set([(currentCell.x << 4) | currentCell.y]),
            isSmallUnit,
            false,
        );
        for (const c of closestMoves) {
            const pos = { x: c.x, y: c.y };
            const key = (c.x << 4) | c.y;
            if (isSmallUnit) {
                if (HoCMath.matrixElementOrDefault(matrix, c.x, c.y, 0) || allowedToMoveThere.has(key)) {
                    continue;
                }

                allowed.push({ x: c.x, y: c.y });
                allowedToMoveThere.add(key);

                knownPaths.set(key, [
                    {
                        cell: c,
                        route: [currentCell, pos],
                        weight: 1,
                        firstAggrMet: false,
                    },
                ]);
            } else if (c.x < currentCell.x) {
                const unitKeyLeft = ((c.x - 1) << 4) | c.y;
                const unitKeyLeftDown = ((c.x - 1) << 4) | (c.y - 1);
                if (
                    !allowedToMoveThere.has(unitKeyLeft) &&
                    !HoCMath.matrixElementOrDefault(matrix, c.x - 1, c.y, 0) &&
                    !allowedToMoveThere.has(unitKeyLeftDown) &&
                    !HoCMath.matrixElementOrDefault(matrix, c.x - 1, c.y - 1, 0)
                ) {
                    allowedToMoveThere.add(unitKeyLeft);
                    allowed.push({ x: c.x - 1, y: c.y });
                    allowedToMoveThere.add(unitKeyLeftDown);
                    allowed.push({ x: c.x - 1, y: c.y - 1 });

                    knownPaths.set(key, [
                        {
                            cell: c,
                            route: [currentCell, pos],
                            weight: 1,
                            firstAggrMet: false,
                        },
                    ]);
                }
            } else if (c.x > currentCell.x) {
                const unitKeyRight = (c.x << 4) | c.y;
                const unitKeyRightDown = (c.x << 4) | (c.y - 1);
                if (
                    !allowedToMoveThere.has(unitKeyRight) &&
                    !HoCMath.matrixElementOrDefault(matrix, c.x, c.y, 0) &&
                    !allowedToMoveThere.has(unitKeyRightDown) &&
                    !HoCMath.matrixElementOrDefault(matrix, c.x, c.y - 1, 0)
                ) {
                    allowedToMoveThere.add(unitKeyRight);
                    allowed.push({ x: c.x, y: c.y });
                    allowedToMoveThere.add(unitKeyRightDown);
                    allowed.push({ x: c.x, y: c.y - 1 });

                    knownPaths.set(key, [
                        {
                            cell: c,
                            route: [currentCell, pos],
                            weight: 1,
                            firstAggrMet: false,
                        },
                    ]);
                }
            } else if (c.y < currentCell.y) {
                const unitKeyDown = (c.x << 4) | (c.y - 1);
                const unitKeyDownLeft = ((c.x - 1) << 4) | (c.y - 1);
                if (
                    !allowedToMoveThere.has(unitKeyDown) &&
                    !HoCMath.matrixElementOrDefault(matrix, c.x, c.y - 1, 0) &&
                    !allowedToMoveThere.has(unitKeyDownLeft) &&
                    !HoCMath.matrixElementOrDefault(matrix, c.x - 1, c.y - 1, 0)
                ) {
                    allowedToMoveThere.add(unitKeyDown);
                    allowed.push({ x: c.x, y: c.y - 1 });
                    allowedToMoveThere.add(unitKeyDownLeft);
                    allowed.push({ x: c.x - 1, y: c.y - 1 });

                    knownPaths.set(key, [
                        {
                            cell: c,
                            route: [currentCell, pos],
                            weight: 1,
                            firstAggrMet: false,
                        },
                    ]);
                }
            } else {
                const unitKeyUp = (c.x << 4) | c.y;
                const unitKeyUpLeft = ((c.x - 1) << 4) | c.y;
                if (
                    !allowedToMoveThere.has(unitKeyUp) &&
                    !HoCMath.matrixElementOrDefault(matrix, c.x, c.y, 0) &&
                    !allowedToMoveThere.has(unitKeyUpLeft) &&
                    !HoCMath.matrixElementOrDefault(matrix, c.x - 1, c.y, 0)
                ) {
                    allowedToMoveThere.add(unitKeyUp);
                    allowed.push({ x: c.x, y: c.y });
                    allowedToMoveThere.add(unitKeyUpLeft);
                    allowed.push({ x: c.x - 1, y: c.y });

                    knownPaths.set(key, [
                        {
                            cell: c,
                            route: [currentCell, pos],
                            weight: 1,
                            firstAggrMet: false,
                        },
                    ]);
                }
            }
        }

        return this.filterUnallowedDestinations(
            {
                cells: allowed,
                hashes: allowedToMoveThere,
                knownPaths,
            },
            matrix,
            isSmallUnit,
        );
    }
}
