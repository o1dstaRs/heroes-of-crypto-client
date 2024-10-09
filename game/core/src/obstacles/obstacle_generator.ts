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

import { XY, b2World, b2BodyType, b2PolygonShape, b2Draw } from "@box2d/core";
import { GridSettings, ObstacleType } from "@heroesofcrypto/common";

import { Obstacle } from "./obstacle";
import { Sprite } from "../utils/gl/Sprite";
import { PreloadedTextures } from "../utils/gl/preload";
import { DefaultShader } from "../utils/gl/defaultShader";

export class ObstacleGenerator {
    private readonly world: b2World;

    private readonly textures: PreloadedTextures;

    private readonly draw: b2Draw;

    private readonly gridSettings: GridSettings;

    public constructor(world: b2World, textures: PreloadedTextures, draw: b2Draw, gridSettings: GridSettings) {
        this.world = world;
        this.textures = textures;
        this.draw = draw;
        this.gridSettings = gridSettings;
    }

    public generateHole(position: XY, sizePixels: number, sizeCells: number): Obstacle {
        const halfSize = sizePixels >> 1;

        const body = this.world.CreateBody({
            type: b2BodyType.b2_staticBody,
            position: {
                x: position.x + halfSize,
                y: position.y + halfSize,
            },
            fixedRotation: true,
            userData: { id: "BLOCK", size: sizeCells },
        });

        const unitShape = new b2PolygonShape();
        const fixtureDef = {
            shape: unitShape,
            density: 1,
            friction: 0,
            restitution: 0.0,
        };
        unitShape.SetAsBox(halfSize, halfSize);
        body.CreateFixture(fixtureDef);

        return new Obstacle(ObstacleType.BLOCK, position, sizePixels, sizePixels, this.draw, this.gridSettings);
    }

    public generateLava(
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        position: XY,
        sizeX: number,
        sizeY: number,
    ): Obstacle {
        return new Obstacle(
            ObstacleType.LAVA,
            position,
            sizeX,
            sizeY,
            this.draw,
            this.gridSettings,
            new Sprite(gl, shader, this.textures.lava_256.texture),
            new Sprite(gl, shader, this.textures.lava_256.texture),
        );
    }

    public generateMountain(
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        position: XY,
        spriteSizeX: number,
        spriteSizeY: number,
        sizeX: number,
        sizeY: number,
        spriteEnlargeX: number,
        spriteEnlargeY: number,
    ): Obstacle {
        const body = this.world.CreateBody({
            type: b2BodyType.b2_staticBody,
            position: {
                x: position.x + sizeX + spriteEnlargeX,
                y: position.y + sizeY + spriteEnlargeY,
            },
            fixedRotation: true,
            userData: { id: "BLOCK", size: 4 },
        });

        const unitShape = new b2PolygonShape();
        const fixtureDef = {
            shape: unitShape,
            density: 1,
            friction: 0,
            restitution: 0.0,
        };
        unitShape.SetAsBox(sizeX, sizeY);
        body.CreateFixture(fixtureDef);

        return new Obstacle(
            ObstacleType.BLOCK,
            position,
            spriteSizeX,
            spriteSizeY,
            this.draw,
            this.gridSettings,
            new Sprite(gl, shader, this.textures.mountain_432_412.texture),
            new Sprite(gl, shader, this.textures.mountain_432_412.texture),
        );
    }

    public generateWater(
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        position: XY,
        sizeX: number,
        sizeY: number,
    ): Obstacle {
        return new Obstacle(
            ObstacleType.WATER,
            position,
            sizeX,
            sizeY,
            this.draw,
            this.gridSettings,
            new Sprite(gl, shader, this.textures.water_256.texture),
            new Sprite(gl, shader, this.textures.water_256.texture),
        );
    }
}
