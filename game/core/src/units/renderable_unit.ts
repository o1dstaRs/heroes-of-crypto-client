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

import { b2BodyDef, b2BodyType, b2ChainShape, b2Color, b2FixtureDef, b2PolygonShape } from "@box2d/core";
import Denque from "denque";
import {
    HoCLib,
    UnitProperties,
    GridSettings,
    HoCMath,
    UnitType,
    TeamType,
    FactionType,
    ToFactionType,
    AllFactionsType,
    HoCConfig,
    AbilityFactory,
    SpellHelper,
    EffectFactory,
} from "@heroesofcrypto/common";

import { DAMAGE_ANIMATION_TICKS, HP_BAR_DELTA, MAX_FPS, RESURRECTION_ANIMATION_TICKS } from "../statics";
import { Unit } from "./units";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";
import { DefaultShader } from "../utils/gl/defaultShader";
import { SceneLog } from "../menu/scene_log";
import { RenderableSpell } from "../spells/renderable_spell";

interface IDamageTaken {
    animationTicks: number;
    unitsDied: number;
}

export class RenderableUnit extends Unit {
    protected readonly sceneStepCount: HoCLib.RefNumber;

    protected readonly textures: PreloadedTextures;

    protected readonly gl: WebGLRenderingContext;

    protected readonly shader: DefaultShader;

    protected readonly digitNormalTextures: Map<number, WebGLTexture>;

    protected readonly digitDamageTextures: Map<number, WebGLTexture>;

    protected readonly smallSprite: Sprite;

    protected readonly tagSprite: Sprite;

    protected readonly hourglassSprite: Sprite;

    protected readonly damageAnimationTicks: Denque<IDamageTaken> = new Denque<IDamageTaken>();

    protected resurrectionAnimationTick = 0;

    protected readonly bodyDef: b2BodyDef;

    protected readonly fixtureDef: b2FixtureDef;

    protected readonly stackPowerBarFixtureDefs: b2FixtureDef[];

    protected readonly stackPowerBarBoundFixtureDefs: b2FixtureDef[];

    protected constructor(
        unitProperties: UnitProperties,
        gridSettings: GridSettings,
        teamType: TeamType,
        unitType: UnitType,
        abilityFactory: AbilityFactory,
        effectFactory: EffectFactory,
        summoned: boolean,
        sceneStepCount: HoCLib.RefNumber,
        textures: PreloadedTextures,
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        digitNormalTextures: Map<number, WebGLTexture>,
        digitDamageTextures: Map<number, WebGLTexture>,
        smallSprite: Sprite,
        tagSprite: Sprite,
        hourglassSprite: Sprite,
    ) {
        super(unitProperties, gridSettings, teamType, unitType, abilityFactory, effectFactory, summoned);
        this.damageAnimationTicks = new Denque();
        this.sceneStepCount = sceneStepCount;
        this.textures = textures;
        this.gl = gl;
        this.shader = shader;
        this.digitNormalTextures = digitNormalTextures;
        this.digitDamageTextures = digitDamageTextures;
        this.smallSprite = smallSprite;
        this.tagSprite = tagSprite;
        this.hourglassSprite = hourglassSprite;

        this.bodyDef = {
            type: b2BodyType.b2_dynamicBody,
            position: this.position,
            fixedRotation: true,
            userData: unitProperties,
        };

        const unitShape = new b2PolygonShape();
        this.fixtureDef = {
            shape: unitShape,
            density: 1,
            friction: 0,
            restitution: 0.0,
        };
        unitShape.SetAsBox(
            this.gridSettings.getUnitSize() * this.unitProperties.size,
            this.gridSettings.getUnitSize() * this.unitProperties.size,
        );

        const halfUnitStep = this.isSmallSize() ? this.gridSettings.getHalfStep() : this.gridSettings.getStep();
        const fullUnitStep = this.isSmallSize() ? this.gridSettings.getStep() : this.gridSettings.getTwoSteps();

        this.stackPowerBarBoundFixtureDefs = new Array(5);
        let i = 0;
        while (i < this.stackPowerBarBoundFixtureDefs.length) {
            const hpBoundShape = new b2ChainShape(b2Color.WHITE);
            const step = fullUnitStep / this.stackPowerBarBoundFixtureDefs.length;
            const yOffset = i * step;
            const yBottom = this.position.y - halfUnitStep + yOffset;
            const yTop = yBottom + step;
            hpBoundShape.CreateLoop([
                { x: this.position.x - halfUnitStep, y: yTop },
                { x: this.position.x - halfUnitStep + fullUnitStep / 7, y: yTop },
                { x: this.position.x - halfUnitStep + fullUnitStep / 7, y: yBottom },
                { x: this.position.x - halfUnitStep, y: yBottom },
            ]);
            this.stackPowerBarBoundFixtureDefs[i++] = {
                shape: hpBoundShape,
                density: 1,
                friction: 0,
                restitution: 0.0,
                isSensor: true,
            };
        }

        this.stackPowerBarFixtureDefs = new Array(5);
        let j = 0;
        while (j < this.stackPowerBarFixtureDefs.length) {
            const hpBarShape = new b2PolygonShape();
            const step = fullUnitStep / this.stackPowerBarBoundFixtureDefs.length;
            const yOffset = j * step;
            const yBottom = this.position.y - halfUnitStep + yOffset + HP_BAR_DELTA;
            const yTop = yBottom + step - HP_BAR_DELTA;
            hpBarShape.Set([
                { x: this.position.x - halfUnitStep + HP_BAR_DELTA, y: yTop },
                { x: this.position.x - halfUnitStep + fullUnitStep / 7 - HP_BAR_DELTA, y: yTop },
                { x: this.position.x - halfUnitStep + HP_BAR_DELTA, y: yBottom },
                { x: this.position.x - halfUnitStep + fullUnitStep / 7 - HP_BAR_DELTA, y: yBottom },
            ]);
            this.stackPowerBarFixtureDefs[j++] = {
                shape: hpBarShape,
                density: 1,
                friction: 0,
                restitution: 0.0,
                isSensor: true,
                userData: { team: this.teamType },
            };
        }
    }

    public static createRenderableUnit(
        unitProperties: UnitProperties,
        gridSettings: GridSettings,
        teamType: TeamType,
        unitType: UnitType,
        abilityFactory: AbilityFactory,
        effectFactory: EffectFactory,
        summoned: boolean,
        sceneStepCount: HoCLib.RefNumber,
        textures: PreloadedTextures,
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        digitNormalTextures: Map<number, WebGLTexture>,
        digitDamageTextures: Map<number, WebGLTexture>,
        smallSprite: Sprite,
        tagSprite: Sprite,
        hourglassSprite: Sprite,
    ): RenderableUnit {
        const renderableUnit = new RenderableUnit(
            unitProperties,
            gridSettings,
            teamType,
            unitType,
            abilityFactory,
            effectFactory,
            summoned,
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

        renderableUnit.parseSpells();
        return renderableUnit;
    }

    public getHoveredSpell(mousePosition: HoCMath.XY): RenderableSpell | undefined {
        for (const s of this.spells) {
            const renderableSpell = s as RenderableSpell;
            if (renderableSpell.isHover(mousePosition)) {
                return renderableSpell;
            }
        }

        return undefined;
    }

    public renderSpells(pageNumber: number): void {
        const windowLeft = (pageNumber - 1) * 6;
        const windowRight = (pageNumber - 1) * 6 + 6;
        let bookPosition = 1;
        const rendered: number[] = [];
        for (let i = windowLeft; i < windowRight; i++) {
            if (
                i in this.spells &&
                this.spells[i] &&
                this.spells[i].isRemaining() &&
                this.spells[i].getMinimalCasterStackPower() <= this.getStackPower()
            ) {
                (this.spells[i] as RenderableSpell).renderOnPage(bookPosition++);
                rendered.push(i);
            }
        }

        for (let i = 0; i < this.spells.length; i++) {
            if (!rendered.includes(i)) {
                (this.spells[i] as RenderableSpell).cleanupPagePosition();
            }
        }
    }

    public getBodyDef(): b2BodyDef {
        return this.bodyDef;
    }

    public getFixtureDef(): b2FixtureDef {
        return this.fixtureDef;
    }

    public getHpBarBoundFixtureDefs(): b2FixtureDef[] {
        return this.stackPowerBarBoundFixtureDefs.slice(0, this.getStackPower());
    }

    public getHpBarFixtureDefs(): b2FixtureDef[] {
        return this.stackPowerBarFixtureDefs.slice(0, this.getStackPower());
    }

    public updateTick(currentTick: number): void {
        this.lastKnownTick = currentTick;
    }

    public render(fps: number, isDamageAnimationLocked: boolean, sceneLog: SceneLog) {
        this.lastKnownTick = Math.max(this.sceneStepCount.getValue(), this.lastKnownTick);

        if (this.lastKnownTick < this.resurrectionAnimationTick) {
            return;
        }

        if (this.resurrectionAnimationTick) {
            sceneLog.updateLog(`${this.getName()} resurrected as ${this.getAmountAlive()}`);
            this.resurrectionAnimationTick = 0;
        }

        const halfUnitStep = this.isSmallSize() ? this.gridSettings.getHalfStep() : this.gridSettings.getStep();
        const fourthUnitStep = this.isSmallSize()
            ? this.gridSettings.getQuarterStep()
            : this.gridSettings.getHalfStep();
        const fullUnitStep = this.isSmallSize() ? this.gridSettings.getStep() : this.gridSettings.getTwoSteps();

        const spritePositionX = this.renderPosition.x - halfUnitStep;
        const spritePositionY = this.renderPosition.y - halfUnitStep;

        this.smallSprite.setRect(spritePositionX, spritePositionY, fullUnitStep, fullUnitStep);
        this.smallSprite.render();

        const damageEntry = this.damageAnimationTicks.pop();
        let finishDamageTick = damageEntry?.animationTicks;

        const sixthStep = fullUnitStep / 6;
        const fifthStep = fullUnitStep / 5;

        if (isDamageAnimationLocked || !finishDamageTick || this.sceneStepCount.getValue() > finishDamageTick) {
            this.renderAmountSprites(
                this.digitNormalTextures,
                this.unitProperties.amount_alive,
                this.renderPosition,
                halfUnitStep,
                fifthStep,
                sixthStep,
            );
            if (isDamageAnimationLocked && damageEntry) {
                this.damageAnimationTicks.push({
                    animationTicks: this.sceneStepCount.getValue() + DAMAGE_ANIMATION_TICKS,
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
                    this.renderPosition,
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
                            this.renderPosition.x + halfUnitStep - sixthStep * i,
                            this.renderPosition.y - halfUnitStep,
                            sixthStep,
                            fifthStep,
                        );
                        sprite.render();
                    }
                }
            }
        }

        if (!damageEntry || (damageEntry && !isDamageAnimationLocked)) {
            if (this.responded) {
                this.tagSprite.setRect(
                    this.renderPosition.x + halfUnitStep - fourthUnitStep,
                    this.renderPosition.y - fourthUnitStep - 6,
                    fourthUnitStep,
                    fourthUnitStep,
                );
                this.tagSprite.render();
            }

            if (this.onHourglass) {
                this.hourglassSprite.setRect(
                    this.renderPosition.x + halfUnitStep - fourthUnitStep + 6,
                    this.renderPosition.y,
                    fourthUnitStep,
                    fourthUnitStep,
                );
                this.hourglassSprite.render();
            }
        }
    }

    public enqueueResurrectionAnimation(): void {
        this.resurrectionAnimationTick = Math.max(
            this.resurrectionAnimationTick,
            this.lastKnownTick + RESURRECTION_ANIMATION_TICKS,
        );
    }

    protected refreshAbiltyDescription(_abilityName: string, _abilityDescription: string): void {
        if (
            this.unitProperties.abilities.length === this.unitProperties.abilities_descriptions.length &&
            this.unitProperties.abilities.length === this.unitProperties.abilities_stack_powered.length &&
            this.unitProperties.abilities.length === this.unitProperties.abilities_auras.length
        ) {
            for (let i = 0; i < this.unitProperties.abilities.length; i++) {
                if (
                    this.unitProperties.abilities[i] === _abilityName &&
                    (this.unitProperties.abilities_stack_powered[i] || _abilityName === "Blind Fury")
                ) {
                    this.unitProperties.abilities_descriptions[i] = _abilityDescription;
                }
            }
        }
    }

    protected parseSpells(): void {
        const spells: Map<string, number> = this.parseSpellData(this.unitProperties.spells);

        for (const [k, v] of spells.entries()) {
            const spArr = k.split(":");
            if (spArr.length !== 2) {
                continue;
            }
            // can return us undefined
            const faction = ToFactionType[spArr[0] as AllFactionsType] ?? FactionType.NO_TYPE;
            if (faction === undefined) {
                continue;
            }

            const spellName = spArr[1];
            const spellProperties = HoCConfig.getSpellConfig(faction, spellName);
            const textureNames = SpellHelper.spellToTextureNames(spellName);
            this.spells.push(
                new RenderableSpell(
                    { spellProperties: spellProperties, amount: v },
                    this.gl,
                    this.shader,
                    new Sprite(this.gl, this.shader, this.textures[textureNames[0] as keyof PreloadedTextures].texture),
                    new Sprite(this.gl, this.shader, this.textures[textureNames[1] as keyof PreloadedTextures].texture),
                    this.digitNormalTextures,
                ),
            );
        }
    }

    protected handleDamageAnimation(unitsDied: number): void {
        const damageTakenEntry = this.damageAnimationTicks.peekFront();
        const nextAnimationTick = damageTakenEntry?.animationTicks ?? 0;

        this.damageAnimationTicks.unshift({
            animationTicks: Math.max(this.sceneStepCount.getValue(), nextAnimationTick) + DAMAGE_ANIMATION_TICKS,
            unitsDied,
        });
    }

    protected renderAmountSprites(
        digitTextures: Map<number, WebGLTexture>,
        amountToRender: number,
        position: HoCMath.XY,
        halfUnitStep: number,
        fifthStep: number,
        sixthStep: number,
    ): void {
        const isDamage = digitTextures === this.digitDamageTextures;
        const amountSprites: Sprite[] = new Array(amountToRender.toString().length + (isDamage ? 1 : 0));
        let index = 0;
        if (amountToRender < 10) {
            const texture = digitTextures.get(amountToRender);
            if (texture) {
                amountSprites[index] = new Sprite(this.gl, this.shader, texture);
            }
        } else {
            while (amountToRender) {
                const digit = amountToRender % 10;
                const texture = digitTextures.get(digit);
                if (texture) {
                    amountSprites[index++] = new Sprite(this.gl, this.shader, texture);
                }
                amountToRender = Math.floor(amountToRender / 10);
            }
        }
        if (isDamage) {
            const texture = digitTextures.get(-1);
            if (texture) {
                amountSprites[index + 1] = new Sprite(this.gl, this.shader, texture);
            }
        }

        let i = 1;
        for (const s of amountSprites) {
            if (!s) {
                continue;
            }

            s.setRect(position.x + halfUnitStep - sixthStep * i++, position.y - halfUnitStep, sixthStep, fifthStep);
            s.render();
        }
    }
}
