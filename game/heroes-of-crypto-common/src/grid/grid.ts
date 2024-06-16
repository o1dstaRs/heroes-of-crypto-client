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

import { ObstacleType } from "../obstacles/obstacle_type";
import { TeamType } from "../units/unit_stats";
import { getRandomInt } from "../utils/lib";
import { getCellForPosition, getCellsAroundPoint, isCellWithinGrid } from "./grid_math";
import { GridSettings } from "./grid_settings";
import { XY } from "../utils/math";

const UPDATE_DOWN_LEFT = 0b01000001;
const UPDATE_UP_LEFT = 0b00010010;
const UPDATE_DOWN_RIGHT = 0b00100100;
const UPDATE_UP_RIGHT = 0b10001000;

const OBSTACLE_SHORTS = ["B", "L", "W", "H"];

export enum GridType {
    NORMAL,
    WATER_CENTER,
    LAVA_CENTER,
    BLOCK_CENTER,
}

export class Grid {
    private cellsByUnitId: { [unitId: string]: XY[] } = {};

    private unitIdToTeam: { [unitId: string]: number } = {};

    private boardAggrPerTeam: Map<number, number[][]> = new Map();

    private readonly gridType: GridType;

    private readonly boardCoord: string[][];

    private readonly gridSize: number;

    private readonly targetBoardCoord: string[][];

    private readonly numberOfLapsTillNarrowingBlock: number;

    private readonly numberOfLapsTillNarrowingNormal: number;

    private readonly availableCenterStart: number;

    private readonly availableCenterEnd: number;

    public constructor(
        gridSize: number,
        numberOfLapsTillNarrowingBlock: number,
        numberOfLapsTillNarrowingNormal: number,
    ) {
        this.gridSize = gridSize;
        this.numberOfLapsTillNarrowingBlock = numberOfLapsTillNarrowingBlock;
        this.numberOfLapsTillNarrowingNormal = numberOfLapsTillNarrowingNormal;
        this.gridType = this.getRandomGridType();
        if (this.gridType === GridType.NORMAL) {
            this.availableCenterStart = this.gridSize >> 1;
            this.availableCenterEnd = this.availableCenterStart;
        } else {
            const quarter = this.gridSize >> 2;
            const halfQuarter = quarter >> 1;
            this.availableCenterStart = quarter + halfQuarter;
            this.availableCenterEnd = this.availableCenterStart + quarter;
        }
        this.boardCoord = new Array(gridSize);
        this.targetBoardCoord = new Array(gridSize);
        const boardAggTeamLower: number[][] = new Array(gridSize);
        const boardAggTeamUpper: number[][] = new Array(gridSize);

        for (let row = 0; row < gridSize; row++) {
            this.boardCoord[row] = new Array(gridSize);
            this.targetBoardCoord[row] = new Array(gridSize);
            boardAggTeamLower[row] = new Array(gridSize);
            boardAggTeamUpper[row] = new Array(gridSize);
        }

        for (let row = 0; row < gridSize; row++) {
            for (let column = 0; column < gridSize; column++) {
                if (
                    row >= this.availableCenterStart &&
                    row < this.availableCenterEnd &&
                    column >= this.availableCenterStart &&
                    column < this.availableCenterEnd
                ) {
                    const obstacleType = this.getObstacleTypePerGrid();
                    if (obstacleType === undefined) {
                        this.boardCoord[row][column] = "";
                        this.targetBoardCoord[row][column] = "";
                    } else if (obstacleType === ObstacleType.BLOCK) {
                        this.boardCoord[row][column] = "B";
                        this.targetBoardCoord[row][column] = "B";
                    } else if (obstacleType === ObstacleType.LAVA) {
                        this.boardCoord[row][column] = "L";
                        this.targetBoardCoord[row][column] = "L";
                    } else if (obstacleType === ObstacleType.WATER) {
                        this.boardCoord[row][column] = "W";
                        this.targetBoardCoord[row][column] = "W";
                    }
                }

                boardAggTeamLower[row][column] = 1;
                boardAggTeamUpper[row][column] = 1;
            }
        }

        this.boardAggrPerTeam.set(1, boardAggTeamUpper);
        this.boardAggrPerTeam.set(2, boardAggTeamLower);
    }

    private getRandomGridType(): GridType {
        const randomValue = getRandomInt(0, 12);
        if (randomValue < 4) {
            return GridType.NORMAL;
        }
        if (randomValue > 7) {
            return GridType.BLOCK_CENTER;
        }
        if (randomValue < 6) {
            return GridType.WATER_CENTER;
        }

        return GridType.LAVA_CENTER;
    }

    public hasTarget(unitId: string): boolean {
        const occupiedCells = this.cellsByUnitId[unitId];
        if (!occupiedCells?.length) {
            return false;
        }

        let allCellsDoHaveTarget = false;
        for (const oc of occupiedCells) {
            if (this.targetBoardCoord[oc.x][oc.y]) {
                allCellsDoHaveTarget = true;
            } else {
                allCellsDoHaveTarget = false;
                break;
            }
        }

        return allCellsDoHaveTarget;
    }

    public targetToCell(unitId: string, team: number, currentCell?: XY, targetCell?: XY) {
        if (!currentCell || !targetCell) {
            return;
        }
        this.targetBoardCoord[targetCell.x][targetCell.y] = unitId;

        this.unitIdToTeam[unitId] = team;

        let lookRight = false;
        let lookUp = false;
        let lookLeft = false;
        let lookDown = false;
        if (targetCell.x + 1 < this.gridSize) {
            lookRight = true;
        }
        if (targetCell.y + 1 < this.gridSize) {
            lookUp = true;
        }
        if (targetCell.x - 1 >= 0) {
            lookLeft = true;
        }
        if (targetCell.y - 1 >= 0) {
            lookDown = true;
        }

        const cleanupReleaseForOwners: string[] = [];
        if (lookRight) {
            const targetOwnerId = this.targetBoardCoord[targetCell.x + 1][targetCell.y];
            if (targetOwnerId && this.unitIdToTeam[targetOwnerId] && this.unitIdToTeam[targetOwnerId] !== team) {
                cleanupReleaseForOwners.push(targetOwnerId);
            }
        }
        if (lookUp) {
            const targetOwnerId = this.targetBoardCoord[targetCell.x][targetCell.y + 1];
            if (targetOwnerId && this.unitIdToTeam[targetOwnerId] && this.unitIdToTeam[targetOwnerId] !== team) {
                cleanupReleaseForOwners.push(targetOwnerId);
            }
        }
        if (lookLeft) {
            const targetOwnerId = this.targetBoardCoord[targetCell.x - 1][targetCell.y];
            if (targetOwnerId && this.unitIdToTeam[targetOwnerId] && this.unitIdToTeam[targetOwnerId] !== team) {
                cleanupReleaseForOwners.push(targetOwnerId);
            }
        }
        if (lookDown) {
            const targetOwnerId = this.targetBoardCoord[targetCell.x][targetCell.y - 1];
            if (targetOwnerId && this.unitIdToTeam[targetOwnerId] && this.unitIdToTeam[targetOwnerId] !== team) {
                cleanupReleaseForOwners.push(targetOwnerId);
            }
        }
        if (lookUp && lookRight) {
            const targetOwnerId = this.targetBoardCoord[targetCell.x + 1][targetCell.y + 1];
            if (targetOwnerId && this.unitIdToTeam[targetOwnerId] && this.unitIdToTeam[targetOwnerId] !== team) {
                cleanupReleaseForOwners.push(targetOwnerId);
            }
        }
        if (lookUp && lookLeft) {
            const targetOwnerId = this.targetBoardCoord[targetCell.x - 1][targetCell.y + 1];
            if (targetOwnerId && this.unitIdToTeam[targetOwnerId] && this.unitIdToTeam[targetOwnerId] !== team) {
                cleanupReleaseForOwners.push(targetOwnerId);
            }
        }
        if (lookDown && lookRight) {
            const targetOwnerId = this.targetBoardCoord[targetCell.x + 1][targetCell.y - 1];
            if (targetOwnerId && this.unitIdToTeam[targetOwnerId] && this.unitIdToTeam[targetOwnerId] !== team) {
                cleanupReleaseForOwners.push(targetOwnerId);
            }
        }
        if (lookDown && lookLeft) {
            const targetOwnerId = this.targetBoardCoord[targetCell.x - 1][targetCell.y - 1];
            if (targetOwnerId && this.unitIdToTeam[targetOwnerId] && this.unitIdToTeam[targetOwnerId] !== team) {
                cleanupReleaseForOwners.push(targetOwnerId);
            }
        }

        if (cleanupReleaseForOwners.length) {
            console.log(`${unitId} cleanupReleaseForOwners ${JSON.stringify(cleanupReleaseForOwners)}`);
        } else {
            console.log(`${unitId} cleanupReleaseForOwners is empty`);
        }
    }

    public cleanupAll(unitId: string, attackRange: number, isSmallUnit: boolean) {
        const occupiedCells = this.cellsByUnitId[unitId];
        const team = this.unitIdToTeam[unitId];
        delete this.unitIdToTeam[unitId];
        if (occupiedCells) {
            if (occupiedCells.length) {
                let xMin = Number.MAX_SAFE_INTEGER;
                let xMax = Number.MIN_SAFE_INTEGER;
                let yMin = Number.MAX_SAFE_INTEGER;
                let yMax = Number.MIN_SAFE_INTEGER;

                for (const oc of occupiedCells) {
                    this.boardCoord[oc.x][oc.y] = "";
                    let aggrGrid: number[][] | undefined;
                    if (attackRange) {
                        aggrGrid = this.boardAggrPerTeam.get(team);
                    }

                    if (isSmallUnit) {
                        this.updateAggrGrid(oc, attackRange, -1, aggrGrid);
                    } else {
                        xMin = Math.min(xMin, oc.x);
                        xMax = Math.max(xMax, oc.x);
                        yMin = Math.min(yMin, oc.y);
                        yMax = Math.max(yMax, oc.y);
                    }
                }
                if (!isSmallUnit && xMin !== xMax && yMin !== yMax && attackRange) {
                    const aggrGrid = this.boardAggrPerTeam.get(team);
                    if (aggrGrid) {
                        this.updateAggrGrid({ x: xMin, y: yMin }, attackRange, -1, aggrGrid, UPDATE_DOWN_LEFT);
                        this.updateAggrGrid({ x: xMin, y: yMax }, attackRange, -1, aggrGrid, UPDATE_UP_LEFT);
                        this.updateAggrGrid({ x: xMax, y: yMin }, attackRange, -1, aggrGrid, UPDATE_DOWN_RIGHT);
                        this.updateAggrGrid({ x: xMax, y: yMax }, attackRange, -1, aggrGrid, UPDATE_UP_RIGHT);
                    }
                }
            }
            delete this.cellsByUnitId[unitId];
        }
    }

    public occupyCell(cell: XY, unitId: string, team: number, attackRange: number): boolean {
        if (cell.x < 0 || cell.y < 0 || cell.x >= this.gridSize || cell.y >= this.gridSize) {
            return false;
        }

        this.unitIdToTeam[unitId] = team;

        //    console.log(`${unitId} TRY OCCUPY ${cell.x} ${cell.y}`);

        const occupantUnitId = this.getOccupantUnitId(cell);
        if (occupantUnitId) {
            // console.log(`${unitId} ALREADY OCCUPIED ${cellPosition.x} ${cellPosition.y} by ${occupantUnitId}`);
            return false;
        }

        let aggrGrid: number[][] | undefined;
        if (attackRange) {
            aggrGrid = this.boardAggrPerTeam.get(team);
        }

        const occupiedCells = this.cellsByUnitId[unitId];
        if (occupiedCells && occupiedCells.length !== 1) {
            return false;
        }

        if (occupiedCells?.length) {
            for (const oc of occupiedCells) {
                if (this.boardCoord[oc.x][oc.y] === unitId) {
                    //                console.log(`${unitId} tick: ${currentTick} cleaning up ${occupying.x} ${occupying.y}`);
                    this.boardCoord[oc.x][oc.y] = "";
                    this.updateAggrGrid(oc, attackRange, -1, aggrGrid);
                }
            }
        }

        this.boardCoord[cell.x][cell.y] = unitId;
        this.updateAggrGrid(cell, attackRange, 1, aggrGrid);
        this.cellsByUnitId[unitId] = [cell];

        return true;
    }

    public getGridType(): GridType {
        return this.gridType;
    }

    public getNumberOfLapsTillNarrowing(): number {
        return this.gridType === GridType.BLOCK_CENTER
            ? this.numberOfLapsTillNarrowingBlock
            : this.numberOfLapsTillNarrowingNormal;
    }

    public areAllCellsEmpty(cells: XY[], unitId?: string) {
        for (const c of cells) {
            const occupantUnitId = this.getOccupantUnitId(c);
            if (occupantUnitId && OBSTACLE_SHORTS.includes(occupantUnitId)) {
                return false;
            }

            if (occupantUnitId && (!unitId || unitId !== occupantUnitId)) return false;
        }

        return true;
    }

    public occupyByHole(gridSettings: GridSettings, cell: XY) {
        if (isCellWithinGrid(gridSettings, cell)) {
            this.boardCoord[cell.x][cell.y] = "H";
            this.targetBoardCoord[cell.x][cell.y] = "H";
        }
    }

    public getAggrMatrixByTeam(team: number): number[][] | undefined {
        return this.boardAggrPerTeam.get(team);
    }

    public getEnemyAggrMatrixByUnitId(unitId: string): number[][] | undefined {
        const team = this.unitIdToTeam[unitId];
        if (!team) {
            return undefined;
        }

        return this.getAggrMatrixByTeam(team === TeamType.LOWER ? TeamType.UPPER : TeamType.LOWER);
    }

    public occupyCells(cells: XY[], unitId: string, team: number, attackRange: number): boolean {
        if (!cells.length) {
            return false;
        }

        this.unitIdToTeam[unitId] = team;

        // for (const cell of cells) {
        // console.log(`${unitId} TRY OCCUPY MANY ${cell.x} ${cell.y}`);
        // }

        let allOccupied = false;
        for (const c of cells) {
            const occupantUnitId = this.getOccupantUnitId(c);
            if (occupantUnitId) {
                allOccupied = true;
            } else {
                allOccupied = false;
                break;
            }
        }
        if (allOccupied) {
            console.log(`${unitId} ALREADY OCCUPIED cells`);
            return false;
        }

        const occupiedCells = this.cellsByUnitId[unitId];
        if (occupiedCells && occupiedCells.length !== 4) {
            return false;
        }

        let aggrGrid: number[][] | undefined;
        if (attackRange) {
            aggrGrid = this.boardAggrPerTeam.get(team);
        }

        if (occupiedCells?.length) {
            const processed: Set<number> = new Set();
            let xMin = Number.MAX_SAFE_INTEGER;
            let xMax = Number.MIN_SAFE_INTEGER;
            let yMin = Number.MAX_SAFE_INTEGER;
            let yMax = Number.MIN_SAFE_INTEGER;
            for (const oc of occupiedCells) {
                const key = (oc.x << 4) | oc.y;
                if (processed.has(key)) {
                    continue;
                }
                if (this.boardCoord[oc.x][oc.y] === unitId) {
                    this.boardCoord[oc.x][oc.y] = "";
                }
                xMin = Math.min(xMin, oc.x);
                xMax = Math.max(xMax, oc.x);
                yMin = Math.min(yMin, oc.y);
                yMax = Math.max(yMax, oc.y);
                processed.add(key);
            }
            if (xMin !== xMax && yMin !== yMax) {
                this.updateAggrGrid({ x: xMin, y: yMin }, attackRange, -1, aggrGrid, UPDATE_DOWN_LEFT);
                this.updateAggrGrid({ x: xMin, y: yMax }, attackRange, -1, aggrGrid, UPDATE_UP_LEFT);
                this.updateAggrGrid({ x: xMax, y: yMin }, attackRange, -1, aggrGrid, UPDATE_DOWN_RIGHT);
                this.updateAggrGrid({ x: xMax, y: yMax }, attackRange, -1, aggrGrid, UPDATE_UP_RIGHT);
            }
        }

        const processed: Set<number> = new Set();
        let xMin = Number.MAX_SAFE_INTEGER;
        let xMax = Number.MIN_SAFE_INTEGER;
        let yMin = Number.MAX_SAFE_INTEGER;
        let yMax = Number.MIN_SAFE_INTEGER;
        for (const c of cells) {
            if (c.x < 0 || c.y < 0 || c.x >= this.gridSize || c.y >= this.gridSize) {
                continue;
            }

            const key = (c.x << 4) | c.y;
            if (processed.has(key)) {
                continue;
            }
            this.boardCoord[c.x][c.y] = unitId;
            xMin = Math.min(xMin, c.x);
            xMax = Math.max(xMax, c.x);
            yMin = Math.min(yMin, c.y);
            yMax = Math.max(yMax, c.y);
            processed.add(key);
        }
        if (xMin !== xMax && yMin !== yMax) {
            this.updateAggrGrid({ x: xMin, y: yMin }, attackRange, 1, aggrGrid, UPDATE_DOWN_LEFT);
            this.updateAggrGrid({ x: xMin, y: yMax }, attackRange, 1, aggrGrid, UPDATE_UP_LEFT);
            this.updateAggrGrid({ x: xMax, y: yMin }, attackRange, 1, aggrGrid, UPDATE_DOWN_RIGHT);
            this.updateAggrGrid({ x: xMax, y: yMax }, attackRange, 1, aggrGrid, UPDATE_UP_RIGHT);
        }
        this.cellsByUnitId[unitId] = cells;

        return true;
    }

    public getOccupantUnitId(cell: XY): string | undefined {
        const subArray = this.boardCoord[cell.x];
        if (!subArray) {
            return undefined;
        }
        return subArray[cell.y];
    }

    public canBeAttackedByMelee(
        unitPosition: XY,
        unitId: string,
        isSmallUnit: boolean,
        gridSettings: GridSettings,
    ): boolean {
        let cells: XY[];
        if (isSmallUnit) {
            const cell = getCellForPosition(gridSettings, unitPosition);
            if (cell) {
                cells = [cell];
            } else {
                cells = [];
            }
        } else {
            cells = getCellsAroundPoint(gridSettings, unitPosition);
        }
        const enemyAggrMatrix: number[][] | undefined = this.getEnemyAggrMatrixByUnitId(unitId);

        for (const cell of cells) {
            if (enemyAggrMatrix && enemyAggrMatrix[cell.x][cell.y] > 1) {
                return true;
            }
        }

        return false;
    }

    public canMoveThere(cell: XY): boolean {
        console.log(
            `canMoveThere ${cell.x} ${cell.y} -> x:${this.boardCoord[cell.x][cell.y]} t:${
                this.targetBoardCoord[cell.x][cell.y]
            }`,
        );
        return (
            (!this.boardCoord[cell.x][cell.y] || !!this.boardCoord[cell.x][cell.y]) &&
            !this.targetBoardCoord[cell.x][cell.y]
        );
    }

    public print(unitId: string, printAggrGrids = true) {
        let msg = "";
        for (let column = this.gridSize - 1; column >= 0; column--) {
            const rowElements: string[] = [];
            for (let row = 0; row < this.gridSize; row++) {
                const occupantUnitId = this.boardCoord[row][column];
                const tgt = this.targetBoardCoord[row][column];
                if (occupantUnitId === unitId) {
                    rowElements.push(".");
                } else if (occupantUnitId && occupantUnitId.length !== 1) {
                    rowElements.push("x");
                } else if (tgt && tgt.length !== 1) {
                    rowElements.push("t");
                } else if (occupantUnitId) {
                    rowElements.push(occupantUnitId[0]);
                } else {
                    rowElements.push("o");
                }
            }
            msg += rowElements.join(" ");
            msg += "\n";
        }
        console.log(msg);

        if (printAggrGrids) {
            const aggrUpper = this.getAggrMatrixByTeam(1);
            if (aggrUpper) {
                msg = "";
                for (let column = this.gridSize - 1; column >= 0; column--) {
                    const rowElements: string[] = [];
                    for (let row = 0; row < this.gridSize; row++) {
                        rowElements.push(`${aggrUpper[row][column]}`);
                    }
                    msg += rowElements.join(" ");
                    msg += "\n";
                }
                console.log(msg);
            }

            const aggrLower = this.getAggrMatrixByTeam(2);
            if (aggrLower) {
                msg = "";
                for (let column = this.gridSize - 1; column >= 0; column--) {
                    const rowElements: string[] = [];
                    for (let row = 0; row < this.gridSize; row++) {
                        rowElements.push(`${aggrLower[row][column]}`);
                    }
                    msg += rowElements.join(" ");
                    msg += "\n";
                }
                console.log(msg);
            }
        }
    }

    /**
     * Always generates a new two-dimensional array
     */
    public getMatrix(): number[][] {
        const matrix: number[][] = new Array(this.gridSize);
        for (let column = this.gridSize - 1; column >= 0; column--) {
            const rowNumbers: number[] = new Array(this.gridSize);
            for (let row = 0; row < this.gridSize; row++) {
                rowNumbers[row] = this.getOccupantNumeric(row, column);
            }
            matrix[column] = rowNumbers;
        }
        return matrix;
    }

    private getOccupantNumeric(row: number, column: number): number {
        const r = this.boardCoord[row];
        if (r === undefined) {
            return 0;
        }
        const tr = this.targetBoardCoord[row];
        if (tr === undefined) {
            return 0;
        }

        if (r[column] || tr[column]) {
            const team = this.unitIdToTeam[r[column]];
            if (team) {
                return team;
            }
        }

        if (
            row >= this.availableCenterStart &&
            row < this.availableCenterEnd &&
            column >= this.availableCenterStart &&
            column < this.availableCenterEnd
        ) {
            const obstacleType = this.getObstacleTypePerGrid();
            if (obstacleType !== undefined) {
                return obstacleType;
            }
        }

        if (r[column] === "H" && tr[column] === "H") {
            return ObstacleType.HOLE;
        }

        return 0;
    }

    // private getCenterCells(): XY[] {
    //     const quarter = this.gridSize >> 2;
    //     const halfQuarter = quarter >> 1;
    //     const start = quarter + halfQuarter;
    //     const end = start + quarter;
    //     const centerCells: XY[] = [];

    //     for (let x = start; x < end; x++) {
    //         for (let y = start; y < end; y++) {
    //             centerCells.push({ x, y });
    //         }
    //     }

    //     return centerCells;
    // }

    private getObstacleTypePerGrid(): ObstacleType | undefined {
        if (this.gridType === GridType.BLOCK_CENTER) {
            return ObstacleType.BLOCK;
        }

        if (this.gridType === GridType.LAVA_CENTER) {
            return ObstacleType.LAVA;
        }

        if (this.gridType === GridType.WATER_CENTER) {
            return ObstacleType.WATER;
        }

        return undefined;
    }

    private updateAggrGrid(
        cell: XY,
        range: number,
        updBy: number,
        aggrGrid?: number[][],
        updatePositionMask?: number,
    ): void {
        if (!aggrGrid || !updBy) {
            return;
        }
        let lookRight = false;
        let lookUp = false;
        let lookLeft = false;
        let lookDown = false;

        if (
            cell.x + range < this.gridSize &&
            (!updatePositionMask ||
                (updatePositionMask &&
                    (updatePositionMask & UPDATE_DOWN_RIGHT || updatePositionMask & UPDATE_UP_RIGHT)))
        ) {
            lookRight = true;
        }
        if (
            cell.y + range < this.gridSize &&
            (!updatePositionMask ||
                (updatePositionMask && (updatePositionMask & UPDATE_UP_RIGHT || updatePositionMask & UPDATE_UP_LEFT)))
        ) {
            lookUp = true;
        }
        if (
            cell.x - range >= 0 &&
            (!updatePositionMask ||
                (updatePositionMask && (updatePositionMask & UPDATE_DOWN_LEFT || updatePositionMask & UPDATE_UP_LEFT)))
        ) {
            lookLeft = true;
        }
        if (
            cell.y - range >= 0 &&
            (!updatePositionMask ||
                (updatePositionMask &&
                    (updatePositionMask & UPDATE_DOWN_RIGHT || updatePositionMask & UPDATE_DOWN_LEFT)))
        ) {
            lookDown = true;
        }

        if (lookRight) {
            aggrGrid[cell.x + 1][cell.y] += updBy;
        }
        if (lookUp) {
            aggrGrid[cell.x][cell.y + 1] += updBy;
        }
        if (lookLeft) {
            aggrGrid[cell.x - 1][cell.y] += updBy;
        }
        if (lookDown) {
            aggrGrid[cell.x][cell.y - 1] += updBy;
        }
        if (
            lookUp &&
            lookRight &&
            (!updatePositionMask || (updatePositionMask && updatePositionMask & UPDATE_UP_RIGHT))
        ) {
            aggrGrid[cell.x + 1][cell.y + 1] += updBy;
        }
        if (
            lookUp &&
            lookLeft &&
            (!updatePositionMask || (updatePositionMask && updatePositionMask & UPDATE_UP_LEFT))
        ) {
            aggrGrid[cell.x - 1][cell.y + 1] += updBy;
        }
        if (
            lookDown &&
            lookRight &&
            (!updatePositionMask || (updatePositionMask && updatePositionMask & UPDATE_DOWN_RIGHT))
        ) {
            aggrGrid[cell.x + 1][cell.y - 1] += updBy;
        }
        if (
            lookDown &&
            lookLeft &&
            (!updatePositionMask || (updatePositionMask && updatePositionMask & UPDATE_DOWN_LEFT))
        ) {
            aggrGrid[cell.x - 1][cell.y - 1] += updBy;
        }
    }
}
