/*
 * -----------------------------------------------------------------------------
 * Pixi version of Hero (extends PixiUnit, no Box2D/GL dependencies)
 * -----------------------------------------------------------------------------
 */

import { Container, Sprite as PixiSprite, Texture } from "pixi.js";
import { AbilityFactory, UnitVals, TeamType, UnitProperties, GridSettings, HoCLib } from "@heroesofcrypto/common";

import { PixiUnit } from "./PixiUnit"; // <- your PixiUnit class

type DigitTextureMap = Map<number, Texture>;

export class PixiHero extends PixiUnit {
    public constructor(
        // scene / rendering deps
        layer: Container,
        textures: Record<string, Texture>,
        digitNormalTextures: DigitTextureMap,
        digitDamageTextures: DigitTextureMap,
        digitScrollTextures: DigitTextureMap,

        // unit data
        unitProperties: UnitProperties,
        gridSettings: GridSettings,
        teamType: TeamType,

        // sprites for overlays/icons
        smallSprite: PixiSprite,
        tagSprite: PixiSprite,
        hourglassSprite: PixiSprite,
        stopSprite: PixiSprite,

        // logic
        abilityFactory: AbilityFactory,
        sceneStepCount: HoCLib.RefNumber,
    ) {
        super(
            unitProperties,
            gridSettings,
            teamType,
            UnitVals.HERO,
            abilityFactory,
            abilityFactory.getEffectsFactory(),
            false, // summoned
            sceneStepCount,
            layer,
            textures,
            digitNormalTextures,
            digitDamageTextures,
            digitScrollTextures,
            smallSprite,
            tagSprite,
            hourglassSprite,
            stopSprite,
        );

        // Heroes start with zero stack power in your old implementation
        this.setStackPower(0);
    }
    /** @deprecated Box2D bars not used in Pixi version. */
    public getHpBarBoundFixtureDefs(): unknown[] {
        return [];
    }
    /** @deprecated Box2D bars not used in Pixi version. */
    public getHpBarFixtureDefs(): unknown[] {
        return [];
    }
}
