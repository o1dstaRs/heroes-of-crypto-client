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

import { b2Draw, b2Color } from "@box2d/core";

import { ObstacleType, HoCMath, GridSettings, HoCConstants } from "@heroesofcrypto/common";

import { Sprite } from "../utils/gl/Sprite";

export class Obstacle {
    private readonly type: ObstacleType;

    private readonly position: HoCMath.XY;

    private readonly sizeX: number;

    private readonly sizeY: number;

    private readonly draw: b2Draw;

    private readonly gridSettings: GridSettings;

    private lightSprite?: Sprite;

    private darkSprite?: Sprite;

    private readonly monitorHits: boolean;

    public constructor(
        type: ObstacleType,
        position: HoCMath.XY,
        sizeX: number,
        sizeY: number,
        draw: b2Draw,
        gridSettings: GridSettings,
        lightSprite?: Sprite,
        darkSprite?: Sprite,
        monitorHits: boolean = false,
    ) {
        this.type = type;
        this.position = position;
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.draw = draw;
        this.gridSettings = gridSettings;
        this.lightSprite = lightSprite;
        this.darkSprite = darkSprite;
        this.monitorHits = monitorHits;
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

    public setLightSprite(lightSprite?: Sprite): void {
        this.lightSprite = lightSprite;
    }

    public setDarkSprite(darkSprite?: Sprite): void {
        this.darkSprite = darkSprite;
    }

    private drawHitbar(hitsRemaining: number): void {
        const startingPositionX =
            ((this.gridSettings.getMinX() + this.gridSettings.getMaxX()) >> 1) - this.gridSettings.getTwoSteps();
        const shiftX = Math.floor(
            (this.gridSettings.getStep() / HoCConstants.MAX_HITS_MOUNTAIN) * (HoCConstants.MAX_HITS_MOUNTAIN - 1),
        );
        while (hitsRemaining--) {
            const polygonStartingPositionX = startingPositionX;

            const polygonStartingPositionY =
                ((this.gridSettings.getMinY() + this.gridSettings.getMaxY()) >> 1) - this.gridSettings.getTwoSteps();
            const currentShiftX = shiftX * hitsRemaining;
            const newX = polygonStartingPositionX + currentShiftX + shiftX;
            const newY = polygonStartingPositionY + 40;

            this.draw.DrawPolygon(
                [
                    { x: polygonStartingPositionX + currentShiftX, y: polygonStartingPositionY },
                    { x: polygonStartingPositionX + currentShiftX, y: newY },
                    { x: newX, y: newY },
                    { x: newX, y: polygonStartingPositionY },
                ],
                4,
                new b2Color(1, 1, 1, 1),
            );

            this.draw.DrawPolygon(
                [
                    { x: polygonStartingPositionX + currentShiftX + 1, y: polygonStartingPositionY + 1 },
                    { x: polygonStartingPositionX + currentShiftX + 1, y: newY - 1 },
                    { x: newX - 1, y: newY - 1 },
                    { x: newX - 1, y: polygonStartingPositionY + 1 },
                ],
                4,
                new b2Color(1, 1, 1, 1),
            );

            this.draw.DrawSolidPolygon(
                [
                    { x: polygonStartingPositionX + currentShiftX + 2, y: polygonStartingPositionY + 2 },
                    { x: polygonStartingPositionX + currentShiftX + 2, y: newY - 2 },
                    { x: newX - 2, y: newY - 2 },
                    { x: newX - 2, y: polygonStartingPositionY + 2 },
                ],
                4,
                new b2Color(253 / 255, 250 / 255, 112 / 255, 1),
            );
        }
    }

    public render(isLightMode: boolean, hitsRemaining = 0): void {
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
        if (this.monitorHits && this.type === ObstacleType.BLOCK && hitsRemaining) {
            this.drawHitbar(hitsRemaining);
        }
    }
}
