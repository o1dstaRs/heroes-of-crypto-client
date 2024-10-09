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

import { b2FixtureDef } from "@box2d/core";
import { AbilityFactory, TeamType, UnitProperties, GridSettings, UnitType, HoCLib } from "@heroesofcrypto/common";

import { DefaultShader } from "../utils/gl/defaultShader";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";
import { RenderableUnit } from "./renderable_unit";

export class Hero extends RenderableUnit {
    public constructor(
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        digitNormalTextures: Map<number, WebGLTexture>,
        digitDamageTextures: Map<number, WebGLTexture>,
        digitScrollTextures: Map<number, WebGLTexture>,
        unitProperties: UnitProperties,
        gridSettings: GridSettings,
        teamType: TeamType,
        smallSprite: Sprite,
        tagSprite: Sprite,
        hourglassSprite: Sprite,
        abilityFactory: AbilityFactory,
        textures: PreloadedTextures,
        sceneStepCount: HoCLib.RefNumber,
    ) {
        super(
            unitProperties,
            gridSettings,
            teamType,
            UnitType.HERO,
            abilityFactory,
            abilityFactory.getEffectsFactory(),
            false,
            sceneStepCount,
            textures,
            gl,
            shader,
            digitNormalTextures,
            digitDamageTextures,
            digitScrollTextures,
            smallSprite,
            tagSprite,
            hourglassSprite,
        );

        this.setStackPower(0);
    }

    public getHpBarBoundFixtureDefs(): b2FixtureDef[] {
        return [];
    }

    public getHpBarFixtureDefs(): b2FixtureDef[] {
        return [];
    }
}
