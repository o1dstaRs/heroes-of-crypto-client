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

import { b2Color, b2Draw, b2FixtureDef, b2PolygonShape, b2Vec2, XY } from "@box2d/core";

import { getCellForPosition } from "../grid/grid_math";
import { GridSettings } from "../grid/grid_settings";
import { Sprite } from "../utils/gl/Sprite";

export class Button {
    private readonly gridSettings: GridSettings;

    private readonly fixtureDef: b2FixtureDef;

    private position: b2Vec2;

    private cell?: XY;

    private spriteWhite: Sprite;

    private spriteBlack?: Sprite;

    private spriteActive?: Sprite;

    private isSelected = false;

    public constructor(
        gridSettings: GridSettings,
        spriteWhite: Sprite,
        position: b2Vec2,
        spriteBlack?: Sprite,
        spriteActive?: Sprite,
        isSelected = false,
    ) {
        this.gridSettings = gridSettings;
        this.spriteWhite = spriteWhite;
        this.spriteBlack = spriteBlack;
        this.spriteActive = spriteActive;
        this.position = position;
        this.cell = getCellForPosition(this.gridSettings, position);
        this.isSelected = isSelected;

        //        const unitShape = new b2PolygonShape(this.getTeam() === 1 ? b2Color.BLUE : b2Color.RED);
        const buttonShape = new b2PolygonShape();
        this.fixtureDef = {
            shape: buttonShape,
            density: 1,
            friction: 0,
            restitution: 0.0,
        };
        buttonShape.SetAsBox(this.gridSettings.getUnitSize(), this.gridSettings.getUnitSize());
    }

    public getFixtureDef(): b2FixtureDef {
        return this.fixtureDef;
    }

    public getPosition(): b2Vec2 {
        return this.position;
    }

    public setPosition(position: b2Vec2): void {
        this.position = position;
        this.cell = getCellForPosition(this.gridSettings, position);
    }

    public isHover(cellPosition?: XY): boolean {
        return !!(cellPosition && this.cell && this.cell.x === cellPosition.x && this.cell.y === cellPosition.y);
    }

    public setIsSelected(isSelected: boolean): void {
        this.isSelected = isSelected;
    }

    public switchSprites(spriteWhite: Sprite, spriteBlack?: Sprite, allowDestroy = true): void {
        if (allowDestroy) {
            this.spriteWhite.destroy();
            if (this.spriteBlack) {
                this.spriteBlack.destroy();
            }
        }

        this.spriteWhite = spriteWhite;
        this.spriteBlack = spriteBlack;
    }

    public render(draw: b2Draw, isLightMode: boolean, multiplier = 1, isActive = false) {
        if (isActive && this.spriteActive) {
            this.spriteActive.setRect(
                this.position.x - this.gridSettings.getHalfStep() * multiplier,
                this.position.y - this.gridSettings.getHalfStep() * multiplier,
                this.gridSettings.getStep() * multiplier,
                this.gridSettings.getStep() * multiplier,
            );

            this.spriteActive.render();
        } else if (this.spriteBlack) {
            if (isLightMode) {
                this.spriteBlack.setRect(
                    this.position.x - this.gridSettings.getHalfStep() * multiplier,
                    this.position.y - this.gridSettings.getHalfStep() * multiplier,
                    this.gridSettings.getStep() * multiplier,
                    this.gridSettings.getStep() * multiplier,
                );

                this.spriteBlack.render();
            } else {
                this.spriteWhite.setRect(
                    this.position.x - this.gridSettings.getHalfStep() * multiplier,
                    this.position.y - this.gridSettings.getHalfStep() * multiplier,
                    this.gridSettings.getStep() * multiplier,
                    this.gridSettings.getStep() * multiplier,
                );

                this.spriteWhite.render();
            }
        } else {
            this.spriteWhite.setRect(
                this.position.x - this.gridSettings.getHalfStep() * multiplier,
                this.position.y - this.gridSettings.getHalfStep() * multiplier,
                this.gridSettings.getStep() * multiplier,
                this.gridSettings.getStep() * multiplier,
            );

            this.spriteWhite.render();
        }

        if (this.isSelected) {
            const color = isLightMode ? new b2Color(0, 0, 0, 0.8) : new b2Color(1, 1, 1, 0.8);

            const polygonStartingPosition: XY = {
                x: this.position.x - this.gridSettings.getHalfStep(),
                y: this.position.y - this.gridSettings.getHalfStep(),
            };

            const newX = polygonStartingPosition.x + this.gridSettings.getStep();
            const newY = polygonStartingPosition.y + this.gridSettings.getStep();
            draw.DrawSolidPolygon(
                [
                    { x: polygonStartingPosition.x, y: polygonStartingPosition.y },
                    { x: polygonStartingPosition.x, y: newY },
                    { x: newX, y: newY },
                    { x: newX, y: polygonStartingPosition.y },
                ],
                4,
                color,
            );
        }
    }
}
