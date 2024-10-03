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
    Grid,
    GridSettings,
    IWeightedRoute,
    GridMath,
    HoCMath,
    GridConstants,
    TeamType,
    HoCConstants,
} from "@heroesofcrypto/common";

import { Unit } from "../units/units";
import { UnitsFactory } from "../units/units_factory";
import { UnitsHolder } from "../units/units_holder";

export interface ISystemMoveResult {
    log: string;
    unitIdsDestroyed: string[];
}

export class MoveHandler {
    public readonly gridSettings: GridSettings;

    private readonly grid: Grid;

    private readonly unitsHolder: UnitsHolder;

    private readonly unitsFactory: UnitsFactory;

    private readonly largeUnitsXtoY: Map<number, number[]>;

    private readonly largeUnitsYtoX: Map<number, number[]>;

    public constructor(gridSettings: GridSettings, grid: Grid, unitsHolder: UnitsHolder, unitsFactory: UnitsFactory) {
        this.gridSettings = gridSettings;
        this.grid = grid;
        this.unitsHolder = unitsHolder;
        this.unitsFactory = unitsFactory;
        this.largeUnitsXtoY = new Map();
        this.largeUnitsYtoX = new Map();
    }

    public moveUnitTowardsCenter(
        cell: HoCMath.XY,
        updatePositionMask: number,
        lapsNarrowed: number,
    ): ISystemMoveResult {
        const possibleUnitId = this.grid.getOccupantUnitId(cell);
        const logs: string[] = [];
        const unitIdsDestroyed: string[] = [];

        if (possibleUnitId) {
            const unit = this.unitsHolder.getAllUnits().get(possibleUnitId);
            // nothing to move
            if (!unit) {
                return { log: "", unitIdsDestroyed };
            }

            const currentPosition = unit.getPosition();
            let cells: HoCMath.XY[];
            if (unit.isSmallSize()) {
                cells = [cell];
            } else {
                cells = GridMath.getCellsAroundPosition(this.gridSettings, currentPosition);
            }

            let targetCells = [];
            for (const c of cells) {
                if (updatePositionMask & GridConstants.UPDATE_UP) {
                    targetCells.push({ x: c.x, y: c.y + 1 });
                } else if (updatePositionMask & GridConstants.UPDATE_DOWN) {
                    targetCells.push({ x: c.x, y: c.y - 1 });
                } else if (updatePositionMask & GridConstants.UPDATE_LEFT) {
                    targetCells.push({ x: c.x - 1, y: c.y });
                } else if (updatePositionMask & GridConstants.UPDATE_RIGHT) {
                    targetCells.push({ x: c.x + 1, y: c.y });
                }
            }

            if (this.grid.areAllCellsEmpty(targetCells, unit.getId())) {
                const systemMoveResult = this.finishDirectedUnitMove(unit, targetCells, undefined, updatePositionMask);
                if (systemMoveResult.log) {
                    logs.push(systemMoveResult.log);
                }
                for (const uId in systemMoveResult.unitIdsDestroyed) {
                    unitIdsDestroyed.push(uId);
                }
            } else {
                let moveX = false;
                let moveY = false;
                let priorityShift = 0;
                if (updatePositionMask & GridConstants.UPDATE_UP) {
                    // bodyNewPosition = { x: bodyPosition.x, y: bodyPosition.y + STEP };
                    priorityShift = unit.getTeam() === TeamType.LOWER ? 1 : -1;
                    moveX = true;
                } else if (updatePositionMask & GridConstants.UPDATE_DOWN) {
                    priorityShift = unit.getTeam() === TeamType.LOWER ? 1 : -1;
                    moveX = true;
                } else if (updatePositionMask & GridConstants.UPDATE_LEFT) {
                    priorityShift = unit.getTeam() === TeamType.LOWER ? 1 : -1;
                    moveY = true;
                } else if (updatePositionMask & GridConstants.UPDATE_RIGHT) {
                    priorityShift = unit.getTeam() === TeamType.LOWER ? 1 : -1;
                    moveY = true;
                }
                const initialTargetCells = structuredClone(targetCells);
                let flippedDirection = false;
                let movedUnit = false;
                while (priorityShift) {
                    if (moveX) {
                        const shiftedCells = this.getShiftedCells(targetCells, priorityShift, lapsNarrowed, true);
                        if (shiftedCells) {
                            if (this.grid.areAllCellsEmpty(shiftedCells, unit.getId())) {
                                const position = GridMath.getPositionForCells(this.gridSettings, shiftedCells);
                                if (!position) {
                                    targetCells = shiftedCells;
                                    continue;
                                }
                                const systemMoveResult = this.finishDirectedUnitMove(
                                    unit,
                                    shiftedCells,
                                    position,
                                    GridConstants.NO_UPDATE,
                                );
                                if (systemMoveResult.log) {
                                    logs.push(systemMoveResult.log);
                                }
                                for (const uId in systemMoveResult.unitIdsDestroyed) {
                                    unitIdsDestroyed.push(uId);
                                }
                                priorityShift = 0;
                                movedUnit = true;
                            } else {
                                targetCells = shiftedCells;
                            }
                        } else if (flippedDirection) {
                            priorityShift = 0;
                        } else {
                            priorityShift = -priorityShift;
                            targetCells = initialTargetCells;
                            flippedDirection = true;
                        }
                    }
                    if (moveY) {
                        const shiftedCells = this.getShiftedCells(targetCells, priorityShift, lapsNarrowed, false);
                        if (shiftedCells) {
                            if (this.grid.areAllCellsEmpty(shiftedCells, unit.getId())) {
                                const position = GridMath.getPositionForCells(this.gridSettings, shiftedCells);
                                if (!position) {
                                    targetCells = shiftedCells;
                                    continue;
                                }
                                const systemMoveResult = this.finishDirectedUnitMove(
                                    unit,
                                    shiftedCells,
                                    position,
                                    GridConstants.NO_UPDATE,
                                );
                                if (systemMoveResult.log) {
                                    logs.push(systemMoveResult.log);
                                }
                                for (const uId in systemMoveResult.unitIdsDestroyed) {
                                    unitIdsDestroyed.push(uId);
                                }
                                priorityShift = 0;
                                movedUnit = true;
                            } else {
                                targetCells = shiftedCells;
                            }
                        } else if (flippedDirection) {
                            priorityShift = 0;
                        } else {
                            priorityShift = -priorityShift;
                            targetCells = initialTargetCells;
                            flippedDirection = true;
                        }
                    }
                }

                if (!movedUnit) {
                    unitIdsDestroyed.push(unit.getId());
                    logs.push(`${unit.getName()} destroyed`);
                }
            }
        }

        return { log: logs.join("\n"), unitIdsDestroyed };
    }

    public applyMoveModifiers(
        toCell: HoCMath.XY,
        stepsMoraleMultiplier: number,
        unit: Unit,
        currentActiveKnownPaths?: Map<number, IWeightedRoute[]>,
    ): boolean {
        if (!currentActiveKnownPaths) {
            return false;
        }

        const bodyPosition = unit.getPosition();

        const yPositions = this.largeUnitsXtoY.get(bodyPosition.x);
        const yPositionUpdated = [];
        if (yPositions?.length) {
            for (const y of yPositions) {
                if (y !== bodyPosition.y) {
                    yPositionUpdated.push(y);
                }
            }
        }
        this.largeUnitsXtoY.set(bodyPosition.x, yPositionUpdated);

        const xPositions = this.largeUnitsYtoX.get(bodyPosition.y);
        const xPositionUpdated = [];
        if (xPositions?.length) {
            for (const x of xPositions) {
                if (x !== bodyPosition.x) {
                    xPositionUpdated.push(x);
                }
            }
        }
        this.largeUnitsYtoX.set(bodyPosition.y, xPositionUpdated);

        const movePaths = currentActiveKnownPaths.get((toCell.x << 4) | toCell.y);
        if (movePaths?.length) {
            const path = movePaths[0].route;
            const targetPos = GridMath.getPositionForCell(
                path[path.length - 1],
                this.gridSettings.getMinX(),
                this.gridSettings.getStep(),
                this.gridSettings.getHalfStep(),
            );
            const distanceBefore = this.unitsHolder.getDistanceToClosestEnemy(unit.getOppositeTeam(), bodyPosition);
            const distanceAfter = this.unitsHolder.getDistanceToClosestEnemy(unit.getOppositeTeam(), targetPos);
            if (distanceAfter < distanceBefore) {
                unit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_DISTANCE);
                unit.applyMoraleStepsModifier(stepsMoraleMultiplier);
            } else if (distanceAfter > distanceBefore) {
                unit.decreaseMorale(HoCConstants.MORALE_CHANGE_FOR_DISTANCE);
                unit.applyMoraleStepsModifier(stepsMoraleMultiplier);
            }
        } else {
            return false;
        }

        return true;
    }

    public clearLargeUnitsCache(): void {
        this.largeUnitsXtoY.clear();
        this.largeUnitsYtoX.clear();
    }

    public updateLargeUnitsCache(bodyPosition: HoCMath.XY): void {
        const existingArrayXtoY = this.largeUnitsXtoY.get(bodyPosition.x);
        if (existingArrayXtoY) {
            existingArrayXtoY.push(bodyPosition.y);
        } else {
            this.largeUnitsXtoY.set(bodyPosition.x, [bodyPosition.y]);
        }

        const existingArrayYtoX = this.largeUnitsYtoX.get(bodyPosition.y);
        if (existingArrayYtoX) {
            existingArrayYtoX.push(bodyPosition.x);
        } else {
            this.largeUnitsYtoX.set(bodyPosition.y, [bodyPosition.x]);
        }
    }

    public getLargeUnitsCache(): [Map<number, number[]>, Map<number, number[]>] {
        return [this.largeUnitsXtoY, this.largeUnitsYtoX];
    }

    public finishDirectedUnitMove(
        unit: Unit,
        targetCells: HoCMath.XY[],
        bodyNewPosition?: HoCMath.XY,
        updatePositionMask: number = GridConstants.NO_UPDATE,
    ): ISystemMoveResult {
        const unitIdsDestroyed: string[] = [];
        if (!targetCells?.length) {
            return {
                log: "",
                unitIdsDestroyed,
            };
        }

        // this.grid.cleanupAll(unit.getId(), unit.getAttackRange(), unit.isSmallSize());
        if (unit.isSmallSize()) {
            this.grid.occupyCell(targetCells[0], unit.getId(), unit.getTeam(), unit.getAttackRange());
        } else {
            this.grid.occupyCells(targetCells, unit.getId(), unit.getTeam(), unit.getAttackRange());
        }
        const body = this.unitsFactory.getUnitBody(unit.getId());
        let deleteUnit = false;
        if (body) {
            const bodyPosition = body.GetPosition();
            if (!bodyNewPosition) {
                if (updatePositionMask & GridConstants.UPDATE_UP) {
                    bodyNewPosition = { x: bodyPosition.x, y: bodyPosition.y + this.gridSettings.getStep() };
                } else if (updatePositionMask & GridConstants.UPDATE_DOWN) {
                    bodyNewPosition = { x: bodyPosition.x, y: bodyPosition.y - this.gridSettings.getStep() };
                } else if (updatePositionMask & GridConstants.UPDATE_LEFT) {
                    bodyNewPosition = { x: bodyPosition.x - this.gridSettings.getStep(), y: bodyPosition.y };
                } else if (updatePositionMask & GridConstants.UPDATE_RIGHT) {
                    bodyNewPosition = { x: bodyPosition.x + this.gridSettings.getStep(), y: bodyPosition.y };
                }
            }
            if (bodyNewPosition) {
                unit.setPosition(bodyNewPosition.x, bodyNewPosition.y);
                body.SetTransformXY(bodyNewPosition.x, bodyNewPosition.y, body.GetAngle());
            } else {
                deleteUnit = true;
            }
        } else {
            deleteUnit = true;
        }
        if (deleteUnit) {
            unitIdsDestroyed.push(unit.getId());
            return { log: `${unit.getId()} destroyed`, unitIdsDestroyed };
        }

        return { log: "", unitIdsDestroyed };
    }

    private getShiftedCells(
        cells: HoCMath.XY[],
        shiftFactor: number,
        lapsNarrowed: number,
        isMovingX = true,
    ): HoCMath.XY[] | undefined {
        const shiftedCells: HoCMath.XY[] = new Array(cells.length);
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            if (isMovingX) {
                const newX = cell.x + shiftFactor;
                if (newX < lapsNarrowed || newX >= this.gridSettings.getGridSize() - lapsNarrowed) {
                    return undefined;
                }

                shiftedCells[i] = { x: newX, y: cell.y };
            } else {
                const newY = cell.y + shiftFactor;
                if (newY < lapsNarrowed || newY >= this.gridSettings.getGridSize() - lapsNarrowed) {
                    return undefined;
                }

                shiftedCells[i] = { x: cell.x, y: newY };
            }
        }

        return shiftedCells;
    }
}
