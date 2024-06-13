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

export class GridSettings {
    private readonly gridSize: number;

    private readonly maxY: number;

    private readonly minY: number;

    private readonly maxX: number;

    private readonly minX: number;

    private readonly step: number;

    private readonly twoSteps: number;

    private readonly fourSteps: number;

    private readonly halfStep: number;

    private readonly quarterStep: number;

    private readonly cellSize: number;

    private readonly unitSize: number;

    private readonly diagonalStep: number;

    private readonly movementDelta: number;

    private readonly unitSizeDelta: number;

    public constructor(
        gridSize: number,
        maxY: number,
        minY: number,
        maxX: number,
        minX: number,
        movementDelta: number,
        unitSizeDelta: number,
    ) {
        this.gridSize = gridSize;
        this.maxY = maxY;
        this.minY = minY;
        this.maxX = maxX;
        this.minX = minX;
        this.movementDelta = movementDelta;
        this.unitSizeDelta = unitSizeDelta;
        this.step = this.maxY / this.gridSize;
        this.halfStep = this.step >> 1;
        this.quarterStep = this.halfStep >> 1;
        this.twoSteps = this.step << 1;
        this.fourSteps = this.twoSteps << 1;
        this.diagonalStep = Math.sqrt(this.step * this.step + this.step * this.step);
        this.cellSize = this.maxY / this.gridSize;
        this.unitSize = this.maxX / this.gridSize - unitSizeDelta;
    }

    public getGridSize(): number {
        return this.gridSize;
    }

    public getStep(): number {
        return this.step;
    }

    public getHalfStep(): number {
        return this.halfStep;
    }

    public getQuarterStep(): number {
        return this.quarterStep;
    }

    public getTwoSteps(): number {
        return this.twoSteps;
    }

    public getFourSteps(): number {
        return this.fourSteps;
    }

    public getDiagonalStep(): number {
        return this.diagonalStep;
    }

    public getMovementDelta(): number {
        return this.movementDelta;
    }

    public getUnitSizeDelta(): number {
        return this.unitSizeDelta;
    }

    public getUnitSize(): number {
        return this.unitSize;
    }

    public getMaxY(): number {
        return this.maxY;
    }

    public getMinY(): number {
        return this.minY;
    }

    public getMaxX(): number {
        return this.maxX;
    }

    public getMinX(): number {
        return this.minX;
    }

    public getCellSize(): number {
        return this.cellSize;
    }
}
