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

import { b2Vec2, b2Color, b2ChainShape, b2Fixture, b2Draw, XY } from "@box2d/core";
import { GridSettings } from "@heroesofcrypto/common";

export enum PlacementType {
    UPPER = 1,
    LOWER = 2,
}

export class SquarePlacement extends b2ChainShape {
    private readonly gridSettings: GridSettings;

    private readonly placementType: PlacementType;

    private readonly size: number;

    private readonly verticles: XY[];

    private readonly xLeft: number;

    private readonly xRight: number;

    private readonly yLower: number;

    private readonly yUpper: number;

    private readonly possibleCellHashesSet: Set<number>;

    private isDestroyed: boolean;

    private fixture?: b2Fixture;

    public constructor(gridSettings: GridSettings, placementType: PlacementType, size = 3) {
        super();
        this.gridSettings = gridSettings;
        this.placementType = placementType;
        this.size = size;
        this.isDestroyed = false;
        this.possibleCellHashesSet = new Set();

        if (placementType === PlacementType.LOWER) {
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

        this.CreateLoop([
            new b2Vec2(this.xLeft, this.yUpper),
            new b2Vec2(this.xRight, this.yUpper),
            new b2Vec2(this.xRight, this.yLower),
            new b2Vec2(this.xLeft, this.yLower),
        ]);
        // use 1 as a border to avoid collision with aura areas
        this.verticles = [
            { x: this.xLeft + 1, y: this.yUpper - 1 },
            { x: this.xRight - 1, y: this.yUpper - 1 },
            { x: this.xRight - 1, y: this.yLower + 1 },
            { x: this.xLeft + 1, y: this.yLower + 1 },
        ];

        const possibleCellPositions = this.possibleCellPositions();
        for (const c of possibleCellPositions) {
            this.possibleCellHashesSet.add((c.x << 4) | c.y);
        }
    }

    public getSize(): number {
        return this.size;
    }

    public setFixture(fixture: b2Fixture): void {
        this.fixture = fixture;
    }

    public getFixture(): b2Fixture | undefined {
        return this.fixture;
    }

    public setDestroyed(): void {
        this.isDestroyed = true;
    }

    public draw(drawInstance: b2Draw): void {
        drawInstance.DrawSolidPolygon(this.verticles, 4, new b2Color(0.5, 0.5, 0.5));
    }

    public isAllowed(v: b2Vec2): boolean {
        return !this.isDestroyed && v.x >= this.xLeft && v.x < this.xRight && v.y >= this.yLower && v.y < this.yUpper;
    }

    public possibleCellHashes(): Set<number> {
        return this.possibleCellHashesSet;
    }

    public possibleCellPositions(isSmallUnit = true): XY[] {
        let x;
        let y;
        let sx;
        let sy;
        let border;
        const diff = isSmallUnit ? 0 : 1;

        if (this.placementType === PlacementType.LOWER) {
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

        const possiblePositions: XY[] = new Array((this.size - diff) * (this.size - diff));
        let possiblePositionsIndex = 0;

        for (let px = x; px !== border; px += sx) {
            for (let py = y; py !== border; py += sy) {
                possiblePositions[possiblePositionsIndex++] = { x: px, y: py };
            }
        }

        return possiblePositions;
    }
}
