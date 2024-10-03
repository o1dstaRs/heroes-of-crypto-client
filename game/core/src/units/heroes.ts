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

// import { DAMAGE_ANIMATION_TICKS, MAX_FPS } from "../statics";
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
            smallSprite,
            tagSprite,
            hourglassSprite,
        );

        this.setStackPower(0);
    }

    // public render(fps: number, currentTick: number, isDamageAnimationLocked: boolean) {
    //     if (!this.getAmountAlive() && this.hasAbilityActive("Resurrection") && !isDamageAnimationLocked) {
    //         return;
    //     }

    //     const halfUnitStep = this.isSmallSize() ? this.gridSettings.getHalfStep() : this.gridSettings.getStep();
    //     const fourthUnitStep = this.isSmallSize()
    //         ? this.gridSettings.getQuarterStep()
    //         : this.gridSettings.getHalfStep();
    //     const fullUnitStep = this.isSmallSize() ? this.gridSettings.getStep() : this.gridSettings.getTwoSteps();

    //     const spritePositionX = this.position.x - halfUnitStep;
    //     const spritePositionY = this.position.y - halfUnitStep;

    //     this.smallSprite.setRect(spritePositionX, spritePositionY, fullUnitStep, fullUnitStep);
    //     this.smallSprite.render();

    //     const damageEntry = this.damageAnimationTicks.pop();
    //     let finishDamageTick = damageEntry?.animationTicks;

    //     const sixthStep = fullUnitStep / 6;
    //     const fifthStep = fullUnitStep / 5;

    //     if (isDamageAnimationLocked || !finishDamageTick || currentTick > finishDamageTick) {
    //         this.renderAmountSprites(
    //             this.digitNormalTextures,
    //             this.unitProperties.amount_alive,
    //             this.position,
    //             halfUnitStep,
    //             fifthStep,
    //             sixthStep,
    //         );
    //         if (isDamageAnimationLocked && damageEntry) {
    //             this.damageAnimationTicks.push({
    //                 animationTicks: currentTick + DAMAGE_ANIMATION_TICKS,
    //                 unitsDied: damageEntry?.unitsDied ?? 0,
    //             });
    //         }
    //     } else {
    //         const ratioToMaxFps = Math.floor(MAX_FPS / fps);

    //         if (ratioToMaxFps) {
    //             finishDamageTick -= Math.sqrt(ratioToMaxFps - 1);
    //         }

    //         const unitsDied = damageEntry?.unitsDied ?? 0;

    //         this.damageAnimationTicks.push({
    //             animationTicks: finishDamageTick,
    //             unitsDied: damageEntry?.unitsDied ?? 0,
    //         });

    //         if (unitsDied) {
    //             this.renderAmountSprites(
    //                 this.digitDamageTextures,
    //                 unitsDied,
    //                 this.position,
    //                 halfUnitStep,
    //                 fifthStep,
    //                 sixthStep,
    //             );
    //         } else {
    //             const texture = this.digitNormalTextures.get(-1);
    //             if (texture) {
    //                 for (let i = 1; i <= this.unitProperties.amount_alive.toString().length; i++) {
    //                     const sprite = new Sprite(this.gl, this.shader, texture);
    //                     sprite.setRect(
    //                         this.position.x + halfUnitStep - sixthStep * i,
    //                         this.position.y - halfUnitStep,
    //                         sixthStep,
    //                         fifthStep,
    //                     );
    //                     sprite.render();
    //                 }
    //             }
    //         }
    //     }

    //     if (!damageEntry || (damageEntry && !isDamageAnimationLocked)) {
    //         if (this.responded) {
    //             this.tagSprite.setRect(
    //                 this.position.x + halfUnitStep - fourthUnitStep,
    //                 this.position.y - fourthUnitStep - 6,
    //                 fourthUnitStep,
    //                 fourthUnitStep,
    //             );
    //             this.tagSprite.render();
    //         }

    //         if (this.onHourglass) {
    //             this.hourglassSprite.setRect(
    //                 this.position.x + halfUnitStep - fourthUnitStep + 6,
    //                 this.position.y,
    //                 fourthUnitStep,
    //                 fourthUnitStep,
    //             );
    //             this.hourglassSprite.render();
    //         }
    //     }
    // }

    public getHpBarBoundFixtureDefs(): b2FixtureDef[] {
        return [];
    }

    public getHpBarFixtureDefs(): b2FixtureDef[] {
        return [];
    }
}
