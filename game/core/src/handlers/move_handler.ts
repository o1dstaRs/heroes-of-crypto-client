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
import { Grid, GridSettings, GridMath, GridConstants } from "@heroesofcrypto/common";

import { Drawer } from "../draw/drawer";
import { IWeightedRoute } from "../path/path_helper";
import { MORALE_CHANGE_FOR_DISTANCE } from "../statics";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";
import { TeamType } from "../units/units_stats";

export class MoveHandler {
    public readonly gridSettings: GridSettings;

    private readonly grid: Grid;

    private readonly unitsHolder: UnitsHolder;

    private readonly largeUnitsXtoY: Map<number, number[]>;

    private readonly largeUnitsYtoX: Map<number, number[]>;

    public constructor(gridSettings: GridSettings, grid: Grid, unitsHolder: UnitsHolder) {
        this.gridSettings = gridSettings;
        this.grid = grid;
        this.unitsHolder = unitsHolder;
        this.largeUnitsXtoY = new Map();
        this.largeUnitsYtoX = new Map();
    }

    public moveUnitTowardsCenter(cell: XY, updatePositionMask: number, lapsNarrowed: number): string {
        const possibleUnitId = this.grid.getOccupantUnitId(cell);
        const logs: string[] = [];

        if (possibleUnitId) {
            const unit = this.unitsHolder.getAllUnits().get(possibleUnitId);
            // nothing to move
            if (!unit) {
                return "";
            }

            const currentPosition = unit.getPosition();
            let cells: XY[];
            if (unit.isSmallSize()) {
                cells = [cell];
            } else {
                cells = GridMath.getCellsAroundPoint(this.gridSettings, currentPosition);
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
                const log = this.finishDirectedUnitMove(unit, targetCells, undefined, updatePositionMask);
                if (log) {
                    logs.push(log);
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
                                const point = GridMath.getPointForCells(this.gridSettings, shiftedCells);
                                if (!point) {
                                    targetCells = shiftedCells;
                                    continue;
                                }
                                const log = this.finishDirectedUnitMove(
                                    unit,
                                    shiftedCells,
                                    point,
                                    GridConstants.NO_UPDATE,
                                );
                                if (log) {
                                    logs.push(log);
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
                                const point = GridMath.getPointForCells(this.gridSettings, shiftedCells);
                                if (!point) {
                                    targetCells = shiftedCells;
                                    continue;
                                }
                                const log = this.finishDirectedUnitMove(
                                    unit,
                                    shiftedCells,
                                    point,
                                    GridConstants.NO_UPDATE,
                                );
                                if (log) {
                                    logs.push(log);
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
                    this.unitsHolder.deleteUnitById(this.grid, unit.getId());
                    logs.push(`${unit.getName()} destroyed`);
                }
            }
        }

        return logs.join("\n");
    }

    public startMoving(
        toCell: XY,
        drawer: Drawer,
        stepsMoraleMultiplier: number,
        body?: b2Body,
        currentActiveKnownPaths?: Map<number, IWeightedRoute[]>,
    ): boolean {
        if (!currentActiveKnownPaths || !body) {
            return false;
        }

        const bodyPosition = body.GetPosition();

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
            const targetPos = GridMath.getPointForCell(
                path[path.length - 1],
                this.gridSettings.getMinX(),
                this.gridSettings.getStep(),
                this.gridSettings.getHalfStep(),
            );
            const distanceBefore = this.unitsHolder.getDistanceToClosestEnemy(body.GetUserData(), bodyPosition);
            const unit = this.unitsHolder.getAllUnits().get(body.GetUserData().id);

            if (!unit) {
                return false;
            }

            drawer.startMoveAnimation(body, unit, path);
            const distanceAfter = this.unitsHolder.getDistanceToClosestEnemy(body.GetUserData(), targetPos);
            if (distanceAfter < distanceBefore) {
                unit.increaseMorale(MORALE_CHANGE_FOR_DISTANCE);
                unit.applyMoraleStepsModifier(stepsMoraleMultiplier);
            } else if (distanceAfter > distanceBefore) {
                unit.decreaseMorale(MORALE_CHANGE_FOR_DISTANCE);
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

    public updateLargeUnitsCache(bodyPosition: XY): void {
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
        targetCells: XY[],
        bodyNewPosition?: XY,
        updatePositionMask: number = GridConstants.NO_UPDATE,
    ): string | undefined {
        if (!targetCells?.length) {
            return undefined;
        }

        // this.grid.cleanupAll(unit.getId(), unit.getAttackRange(), unit.isSmallSize());
        if (unit.isSmallSize()) {
            this.grid.occupyCell(targetCells[0], unit.getId(), unit.getTeam(), unit.getAttackRange());
        } else {
            this.grid.occupyCells(targetCells, unit.getId(), unit.getTeam(), unit.getAttackRange());
        }
        const body = this.unitsHolder.getUnitBody(unit.getId());
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
            this.unitsHolder.deleteUnitById(this.grid, unit.getId());
            return `${unit.getId()} destroyed`;
        }

        return undefined;
    }

    private getShiftedCells(
        cells: XY[],
        shiftFactor: number,
        lapsNarrowed: number,
        isMovingX = true,
    ): XY[] | undefined {
        const shiftedCells: XY[] = new Array(cells.length);
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
