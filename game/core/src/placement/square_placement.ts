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

import { HoCMath, GridSettings } from "@heroesofcrypto/common";

export enum PlacementType {
    NO_TYPE = 0,
    UPPER_RIGHT = 1,
    LOWER_LEFT = 2,
    UPPER_LEFT = 3,
    LOWER_RIGHT = 4,
}

export class SquarePlacement {
    private readonly gridSettings: GridSettings;

    private readonly placementType: PlacementType;

    private readonly size: number;

    protected readonly xLeft: number;

    protected readonly xRight: number;

    protected readonly yLower: number;

    protected readonly yUpper: number;

    private readonly possibleCellHashesSet: Set<number>;

    public constructor(gridSettings: GridSettings, placementType: PlacementType, size = 3) {
        this.gridSettings = gridSettings;
        this.placementType = placementType;
        this.size = size;
        this.possibleCellHashesSet = new Set();

        if (placementType === PlacementType.LOWER_LEFT) {
            this.xLeft = -gridSettings.getMaxX() + gridSettings.getStep();
            this.xRight = this.xLeft + this.size * gridSettings.getStep();
            this.yUpper = gridSettings.getStep() * this.size + gridSettings.getStep();
            this.yLower = gridSettings.getStep();
        } else {
            this.xLeft = gridSettings.getMaxX() - gridSettings.getStep() - gridSettings.getStep() * this.size;
            this.xRight = gridSettings.getMaxX() - gridSettings.getStep();
            this.yLower = gridSettings.getMaxY() - gridSettings.getStep() * this.size - gridSettings.getStep();
            this.yUpper = gridSettings.getMaxY() - gridSettings.getStep();
        }

        const possibleCellPositions = this.possibleCellPositions();
        for (const c of possibleCellPositions) {
            this.possibleCellHashesSet.add((c.x << 4) | c.y);
        }
    }

    public getSize(): number {
        return this.size;
    }

    public isAllowed(v: HoCMath.XY): boolean {
        return v.x >= this.xLeft && v.x < this.xRight && v.y >= this.yLower && v.y < this.yUpper;
    }

    public possibleCellHashes(): Set<number> {
        return this.possibleCellHashesSet;
    }

    public possibleCellPositions(isSmallUnit = true): HoCMath.XY[] {
        let x;
        let y;
        let sx;
        let sy;
        let border;
        const diff = isSmallUnit ? 0 : 1;

        if (this.placementType === PlacementType.LOWER_LEFT) {
            x = 1 + diff;
            y = 1 + diff;
            sx = 1;
            sy = 1;
            border = x + this.size - diff;
        } else {
            sx = -1;
            sy = -1;
            x = this.gridSettings.getGridSize() + sx - 1;
            y = this.gridSettings.getGridSize() + sy - 1;
            border = x - this.size + diff;
        }

        const possiblePositions: HoCMath.XY[] = new Array((this.size - diff) * (this.size - diff));
        let possiblePositionsIndex = 0;

        for (let px = x; px !== border; px += sx) {
            for (let py = y; py !== border; py += sy) {
                possiblePositions[possiblePositionsIndex++] = { x: px, y: py };
            }
        }

        return possiblePositions;
    }
}
