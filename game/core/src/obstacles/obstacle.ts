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

import { XY } from "@box2d/core";

import { Sprite } from "../utils/gl/Sprite";

export enum ObstacleType {
    BLOCK = -1,
    HOLE = -2,
    WATER = -3,
    LAVA = -4,
}

export class Obstacle {
    private readonly type: ObstacleType;

    private readonly position: XY;

    private readonly sizeX: number;

    private readonly sizeY: number;

    private readonly lightSprite?: Sprite;

    private readonly darkSprite?: Sprite;

    public constructor(
        type: ObstacleType,
        position: XY,
        sizeX: number,
        sizeY: number,
        lightSprite?: Sprite,
        darkSprite?: Sprite,
    ) {
        this.type = type;
        this.position = position;
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.lightSprite = lightSprite;
        this.darkSprite = darkSprite;
    }

    public getSizeX(): number {
        return this.sizeX;
    }

    public getSizeY(): number {
        return this.sizeY;
    }

    public getType(): ObstacleType {
        return this.type;
    }

    public render(isLightMode: boolean): void {
        let sprite: Sprite | undefined;
        if (isLightMode) {
            sprite = this.lightSprite;
        } else {
            sprite = this.darkSprite;
        }

        if (sprite) {
            sprite.setRect(this.position.x, this.position.y, this.sizeX, this.sizeY);

            sprite.render();
        }
    }
}
