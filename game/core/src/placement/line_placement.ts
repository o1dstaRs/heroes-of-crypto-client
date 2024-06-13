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

import { b2Vec2, b2EdgeShape, b2Fixture } from "@box2d/core";

export enum PlacementType {
    UPPER = 1,
    LOWER = 2,
}

export class LinePlacement extends b2EdgeShape {
    private readonly size: number;

    private fixture?: b2Fixture;

    public constructor(maxX: number, maxY: number, step: number, placementType: PlacementType, size = 2) {
        super();
        this.size = size;
        if (placementType === PlacementType.LOWER) {
            this.SetTwoSided(new b2Vec2(-maxX, step * this.size), new b2Vec2(maxX, step * this.size));
        } else if (placementType === PlacementType.UPPER) {
            this.SetTwoSided(new b2Vec2(-maxX, maxY - step * this.size), new b2Vec2(maxX, maxY - step * this.size));
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
}
