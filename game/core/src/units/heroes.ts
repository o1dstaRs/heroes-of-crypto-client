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

import { b2Color, b2Draw, b2FixtureDef } from "@box2d/core";
import { AbilityFactory, TeamType, UnitProperties, GridSettings, UnitType } from "@heroesofcrypto/common";

import { DAMAGE_ANIMATION_TICKS, MAX_FPS } from "../statics";
import { DefaultShader } from "../utils/gl/defaultShader";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";
import { Unit } from "./units";

export class Hero extends Unit {
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
        greenSmallFlagSprite: Sprite,
        redSmallFlagSprite: Sprite,
        abilityFactory: AbilityFactory,
        textures: PreloadedTextures,
    ) {
        super(
            gl,
            shader,
            digitNormalTextures,
            digitDamageTextures,
            unitProperties,
            gridSettings,
            teamType,
            UnitType.HERO,
            smallSprite,
            tagSprite,
            hourglassSprite,
            greenSmallFlagSprite,
            redSmallFlagSprite,
            abilityFactory,
            abilityFactory.getEffectsFactory(),
            false,
            textures,
        );

        this.setStackPower(0);
    }

    public render(
        fps: number,
        currentTick: number,
        isLightMode: boolean,
        isDamageAnimationLocked: boolean,
        draw?: b2Draw,
        upNextPosition = 0,
        shift = 1,
        isActive = false,
    ) {
        const halfUnitStep = this.isSmallSize() ? this.gridSettings.getHalfStep() : this.gridSettings.getStep();
        const fourthUnitStep = this.isSmallSize()
            ? this.gridSettings.getQuarterStep()
            : this.gridSettings.getHalfStep();
        const fullUnitStep = this.isSmallSize() ? this.gridSettings.getStep() : this.gridSettings.getTwoSteps();

        const position = upNextPosition
            ? {
                  x: this.gridSettings.getMinX() - this.gridSettings.getStep() * upNextPosition,
                  y: this.gridSettings.getStep(),
              }
            : this.position;

        let xShift = 0;
        const yShift = this.isSmallSize() ? 0 : this.gridSettings.getStep();
        if (upNextPosition) {
            xShift = (this.isSmallSize() ? shift - 1 : shift) * this.gridSettings.getStep();
        }

        const spritePositionX = position.x - (upNextPosition ? xShift : halfUnitStep);
        const spritePositionY = position.y - (upNextPosition ? yShift : halfUnitStep);

        this.smallSprite.setRect(spritePositionX, spritePositionY, fullUnitStep, fullUnitStep);

        this.smallSprite.render();

        const damageEntry = this.damageAnimationTicks.pop();
        let finishDamageTick = damageEntry?.animationTicks;

        const sixthStep = fullUnitStep / 6;
        const fifthStep = fullUnitStep / 5;

        if (isDamageAnimationLocked || !finishDamageTick || currentTick > finishDamageTick) {
            this.renderAmountSprites(
                this.digitNormalTextures,
                this.unitProperties.amount_alive,
                position,
                upNextPosition,
                xShift,
                yShift,
                fullUnitStep,
                halfUnitStep,
                fifthStep,
                sixthStep,
            );
            if (isDamageAnimationLocked && damageEntry) {
                this.damageAnimationTicks.push({
                    animationTicks: currentTick + DAMAGE_ANIMATION_TICKS,
                    unitsDied: damageEntry?.unitsDied ?? 0,
                });
            }
        } else {
            const ratioToMaxFps = Math.floor(MAX_FPS / fps);

            if (ratioToMaxFps) {
                finishDamageTick -= Math.sqrt(ratioToMaxFps - 1);
            }

            const unitsDied = damageEntry?.unitsDied ?? 0;

            this.damageAnimationTicks.push({
                animationTicks: finishDamageTick,
                unitsDied: damageEntry?.unitsDied ?? 0,
            });

            if (unitsDied) {
                this.renderAmountSprites(
                    this.digitDamageTextures,
                    unitsDied,
                    position,
                    upNextPosition,
                    xShift,
                    yShift,
                    fullUnitStep,
                    halfUnitStep,
                    fifthStep,
                    sixthStep,
                );
            } else {
                const texture = this.digitNormalTextures.get(-1);
                if (texture) {
                    for (let i = 1; i <= this.unitProperties.amount_alive.toString().length; i++) {
                        const sprite = new Sprite(this.gl, this.shader, texture);
                        sprite.setRect(
                            position.x + (upNextPosition ? fullUnitStep - xShift : halfUnitStep) - sixthStep * i,
                            position.y - (upNextPosition ? yShift : halfUnitStep),
                            sixthStep,
                            fifthStep,
                        );
                        sprite.render();
                    }
                }
            }
        }

        if (upNextPosition && isActive && draw) {
            const start = {
                x:
                    spritePositionX -
                    halfUnitStep +
                    (this.isSmallSize() ? this.gridSettings.getHalfStep() : this.gridSettings.getStep()),
                y:
                    spritePositionY -
                    halfUnitStep +
                    (this.isSmallSize() ? this.gridSettings.getHalfStep() : this.gridSettings.getStep()),
            };
            const end = {
                x:
                    spritePositionX +
                    halfUnitStep +
                    (this.isSmallSize() ? this.gridSettings.getHalfStep() : this.gridSettings.getStep()),
                y:
                    spritePositionY +
                    halfUnitStep +
                    (this.isSmallSize() ? this.gridSettings.getHalfStep() : this.gridSettings.getStep()),
            };

            const color = isLightMode ? new b2Color(0, 0, 0, 0.8) : new b2Color(1, 1, 1, 0.8);
            draw.DrawPolygon(
                [
                    { x: start.x, y: start.y },
                    { x: start.x, y: end.y },
                    { x: end.x, y: end.y },
                    { x: end.x, y: start.y },
                ],
                4,
                color,
            );
        }

        if (upNextPosition) {
            if (this.getTeam() === TeamType.LOWER) {
                this.greenSmallFlagSprite.setRect(
                    spritePositionX -
                        halfUnitStep +
                        (this.isSmallSize() ? this.gridSettings.getHalfStep() : this.gridSettings.getStep()),
                    spritePositionY + fourthUnitStep,
                    fourthUnitStep + (fourthUnitStep >> 1),
                    halfUnitStep + fourthUnitStep,
                );
                this.greenSmallFlagSprite.render();
            } else {
                this.redSmallFlagSprite.setRect(
                    spritePositionX -
                        halfUnitStep +
                        (this.isSmallSize() ? this.gridSettings.getHalfStep() : this.gridSettings.getStep()),
                    spritePositionY + fourthUnitStep,
                    fourthUnitStep + (fourthUnitStep >> 1),
                    halfUnitStep + fourthUnitStep,
                );
                this.redSmallFlagSprite.render();
            }
            return;
        }

        if (!damageEntry || (damageEntry && !isDamageAnimationLocked)) {
            if (this.responded) {
                this.tagSprite.setRect(
                    this.position.x + halfUnitStep - fourthUnitStep,
                    this.position.y - fourthUnitStep - 6,
                    fourthUnitStep,
                    fourthUnitStep,
                );
                this.tagSprite.render();
            }

            if (this.onHourglass) {
                this.hourglassSprite.setRect(
                    this.position.x + halfUnitStep - fourthUnitStep + 6,
                    this.position.y,
                    fourthUnitStep,
                    fourthUnitStep,
                );
                this.hourglassSprite.render();
            }
        }
    }

    public getHpBarBoundFixtureDefs(): b2FixtureDef[] {
        return [];
    }

    public getHpBarFixtureDefs(): b2FixtureDef[] {
        return [];
    }
}
