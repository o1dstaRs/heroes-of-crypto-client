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
    HoCScene,
    HoCConstants,
    Unit,
} from "@heroesofcrypto/common";

import { DAMAGE_ANIMATION_TICKS, HP_BAR_DELTA, MAX_FPS, RESURRECTION_ANIMATION_TICKS } from "../statics";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";
import { DefaultShader } from "../utils/gl/defaultShader";
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

    protected lastKnownTick = 0;

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

    public render(fps: number, isDamageAnimationLocked: boolean, sceneLog: HoCScene.SceneLog) {
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

    public handleResurrectionAnimation(): void {
        this.resurrectionAnimationTick = Math.max(
            this.resurrectionAnimationTick,
            this.lastKnownTick + RESURRECTION_ANIMATION_TICKS,
        );
    }

    /**
     * Refreshes the abilities descriptions for the UI, according to current unit stats.
     **/
    protected refreshAbilitiesDescriptions(): void {
        // Heavy Armor
        const heavyArmorAbility = this.getAbility("Heavy Armor");
        if (heavyArmorAbility) {
            const percentage = Number(
                (
                    ((heavyArmorAbility.getPower() + this.getLuck()) / 100 / HoCConstants.MAX_UNIT_STACK_POWER) *
                    this.getStackPower() *
                    100
                ).toFixed(2),
            );
            this.refreshAbiltyDescription(
                heavyArmorAbility.getName(),
                heavyArmorAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Lightning Spin
        const lightningSpinAbility = this.getAbility("Lightning Spin");
        if (lightningSpinAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(lightningSpinAbility) * 100).toFixed(2));
            this.refreshAbiltyDescription(
                lightningSpinAbility.getName(),
                lightningSpinAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Fire Breath
        const fireBreathAbility = this.getAbility("Fire Breath");
        if (fireBreathAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(fireBreathAbility) * 100).toFixed(2));
            this.refreshAbiltyDescription(
                fireBreathAbility.getName(),
                fireBreathAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Skewer Strike
        const skewerStrikeAbility = this.getAbility("Skewer Strike");
        if (skewerStrikeAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(skewerStrikeAbility) * 100).toFixed(2));
            this.refreshAbiltyDescription(
                skewerStrikeAbility.getName(),
                skewerStrikeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Fire Shield
        const fireShieldAbility = this.getAbility("Fire Shield");
        if (fireShieldAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(fireShieldAbility) * 100).toFixed(2));
            this.refreshAbiltyDescription(
                fireShieldAbility.getName(),
                fireShieldAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Backstab
        const backstabAbility = this.getAbility("Backstab");
        if (backstabAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(backstabAbility) * 100).toFixed(2)) - 100;
            this.refreshAbiltyDescription(
                backstabAbility.getName(),
                backstabAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Stun
        const stunAbility = this.getAbility("Stun");
        if (stunAbility) {
            const percentage = Number(this.calculateAbilityApplyChance(stunAbility).toFixed(2));
            this.refreshAbiltyDescription(
                stunAbility.getName(),
                stunAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Double Punch
        const doublePunchAbility = this.getAbility("Double Punch");
        if (doublePunchAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(doublePunchAbility) * 100).toFixed(2));
            this.refreshAbiltyDescription(
                doublePunchAbility.getName(),
                doublePunchAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Piercing Spear
        const piercingSpearAbility = this.getAbility("Piercing Spear");
        if (piercingSpearAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(piercingSpearAbility) * 100).toFixed(2));
            this.refreshAbiltyDescription(
                piercingSpearAbility.getName(),
                piercingSpearAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Boost Health
        const boostHealthAbility = this.getAbility("Boost Health");
        if (boostHealthAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(boostHealthAbility) * 100).toFixed(2));
            this.refreshAbiltyDescription(
                boostHealthAbility.getName(),
                boostHealthAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Double Shot
        const doubleShotAbility = this.getAbility("Double Shot");
        if (doubleShotAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(doubleShotAbility) * 100).toFixed(2));
            this.refreshAbiltyDescription(
                doubleShotAbility.getName(),
                doubleShotAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Blindness
        const blindnessAbility = this.getAbility("Blindness");
        if (blindnessAbility) {
            const percentage = Number(this.calculateAbilityApplyChance(blindnessAbility).toFixed(2));
            this.refreshAbiltyDescription(
                blindnessAbility.getName(),
                blindnessAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Sharpened Weapons Aura
        const sharpenedWeaponsAuraAbility = this.getAbility("Sharpened Weapons Aura");
        if (sharpenedWeaponsAuraAbility) {
            const percentage = (this.calculateAbilityMultiplier(sharpenedWeaponsAuraAbility) * 100 - 100).toFixed(2);
            this.refreshAbiltyDescription(
                sharpenedWeaponsAuraAbility.getName(),
                sharpenedWeaponsAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage),
            );
        }

        // War Anger Aura
        const warAngerAuraAbility = this.getAbility("War Anger Aura");
        if (warAngerAuraAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(warAngerAuraAbility) * 100).toFixed(2)) - 100;
            this.refreshAbiltyDescription(
                warAngerAuraAbility.getName(),
                warAngerAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Arrows Wingshield Aura
        const arrowsWingshieldAuraAbility = this.getAbility("Arrows Wingshield Aura");
        if (arrowsWingshieldAuraAbility) {
            const percentage =
                Number((this.calculateAbilityMultiplier(arrowsWingshieldAuraAbility) * 100).toFixed(2)) - 100;
            this.refreshAbiltyDescription(
                arrowsWingshieldAuraAbility.getName(),
                arrowsWingshieldAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Limited Supply
        const limitedSupplyAbility = this.getAbility("Limited Supply");
        if (limitedSupplyAbility) {
            const percentage = Number(
                ((this.getStackPower() / HoCConstants.MAX_UNIT_STACK_POWER) * limitedSupplyAbility.getPower()).toFixed(
                    2,
                ),
            );
            this.refreshAbiltyDescription(
                limitedSupplyAbility.getName(),
                limitedSupplyAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Boar Saliva
        const boarSalivaAbility = this.getAbility("Boar Saliva");
        if (boarSalivaAbility) {
            const percentage = Number(this.calculateAbilityApplyChance(boarSalivaAbility).toFixed(2));
            this.refreshAbiltyDescription(
                boarSalivaAbility.getName(),
                boarSalivaAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Aggr
        const aggrAbility = this.getAbility("Aggr");
        if (aggrAbility) {
            const percentage = Number(this.calculateAbilityApplyChance(aggrAbility).toFixed(2));
            this.refreshAbiltyDescription(
                aggrAbility.getName(),
                aggrAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Wardguard
        const wardguardAbility = this.getAbility("Wardguard");
        if (wardguardAbility) {
            const percentage = Number(this.calculateAbilityApplyChance(wardguardAbility).toFixed(2));
            this.refreshAbiltyDescription(
                wardguardAbility.getName(),
                wardguardAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Magic Shield
        const magicShieldAbility = this.getAbility("Magic Shield");
        if (magicShieldAbility) {
            const percentage = Number(this.calculateAbilityApplyChance(magicShieldAbility).toFixed(2));
            this.refreshAbiltyDescription(
                magicShieldAbility.getName(),
                magicShieldAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Dodge
        const dodgeAbility = this.getAbility("Dodge");
        if (dodgeAbility) {
            const percentage = Number(this.calculateAbilityApplyChance(dodgeAbility).toFixed(2));
            this.refreshAbiltyDescription(
                dodgeAbility.getName(),
                dodgeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Small Specie
        const smallSpecieAbility = this.getAbility("Small Specie");
        if (smallSpecieAbility) {
            const percentage = Number(this.calculateAbilityApplyChance(smallSpecieAbility).toFixed(2));
            this.refreshAbiltyDescription(
                smallSpecieAbility.getName(),
                smallSpecieAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Absorb Penalties Aura
        const absorbPenaltiesAuraAbility = this.getAbility("Absorb Penalties Aura");
        if (absorbPenaltiesAuraAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(absorbPenaltiesAuraAbility) * 100).toFixed(2));
            this.refreshAbiltyDescription(
                absorbPenaltiesAuraAbility.getName(),
                absorbPenaltiesAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Petrifying Gaze
        const petrifyingGazeAbility = this.getAbility("Petrifying Gaze");
        if (petrifyingGazeAbility) {
            const percentage = Number(this.calculateAbilityApplyChance(petrifyingGazeAbility).toFixed(2));
            this.refreshAbiltyDescription(
                petrifyingGazeAbility.getName(),
                petrifyingGazeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Spit Ball
        const spitBallAbility = this.getAbility("Spit Ball");
        if (spitBallAbility) {
            const percentage = Number(this.calculateAbilityApplyChance(spitBallAbility).toFixed(2));
            this.refreshAbiltyDescription(
                spitBallAbility.getName(),
                spitBallAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Large Caliber
        const largeCaliberAbility = this.getAbility("Large Caliber");
        if (largeCaliberAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(largeCaliberAbility) * 100).toFixed(2));
            this.refreshAbiltyDescription(
                largeCaliberAbility.getName(),
                largeCaliberAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Area Throw
        const areaThrowAbility = this.getAbility("Area Throw");
        if (areaThrowAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(areaThrowAbility) * 100).toFixed(2));
            this.refreshAbiltyDescription(
                areaThrowAbility.getName(),
                areaThrowAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Through Shot
        const throughShotAbility = this.getAbility("Through Shot");
        if (throughShotAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(throughShotAbility) * 100).toFixed(2));
            this.refreshAbiltyDescription(
                throughShotAbility.getName(),
                throughShotAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Sky Runner
        const skyRunnerAbility = this.getAbility("Sky Runner");
        if (skyRunnerAbility) {
            this.refreshAbiltyDescription(
                skyRunnerAbility.getName(),
                skyRunnerAbility
                    .getDesc()
                    .join("\n")
                    .replace(/\{\}/g, this.calculateAbilityCount(skyRunnerAbility).toString()),
            );
        }

        // Lucky Strike
        const luckyStrikeAbility = this.getAbility("Lucky Strike");
        if (luckyStrikeAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(luckyStrikeAbility) * 100).toFixed(2)) - 100;
            this.refreshAbiltyDescription(
                luckyStrikeAbility.getName(),
                luckyStrikeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Shatter Armor
        const shatterArmorAbility = this.getAbility("Shatter Armor");
        if (shatterArmorAbility) {
            this.refreshAbiltyDescription(
                shatterArmorAbility.getName(),
                shatterArmorAbility
                    .getDesc()
                    .join("\n")
                    .replace(/\{\}/g, this.calculateAbilityCount(shatterArmorAbility).toString()),
            );
        }

        // Rapid Charge
        const rapidChargeAbility = this.getAbility("Rapid Charge");
        if (rapidChargeAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(rapidChargeAbility) * 100).toFixed(2)) - 100;
            this.refreshAbiltyDescription(
                rapidChargeAbility.getName(),
                rapidChargeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Wolf Trail Aura
        const wolfTrailAuraAbility = this.getAbility("Wolf Trail Aura");
        if (wolfTrailAuraAbility) {
            this.refreshAbiltyDescription(
                wolfTrailAuraAbility.getName(),
                wolfTrailAuraAbility
                    .getDesc()
                    .join("\n")
                    .replace(/\{\}/g, this.calculateAbilityCount(wolfTrailAuraAbility).toString()),
            );
        }

        // Penetrating Bite
        const penetratingBiteAbility = this.getAbility("Penetrating Bite");
        if (penetratingBiteAbility) {
            const percentage = Number((this.calculateAbilityMultiplier(penetratingBiteAbility) * 100).toFixed(2)) - 100;
            this.refreshAbiltyDescription(
                penetratingBiteAbility.getName(),
                penetratingBiteAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Pegasus Light
        const pegasusLightAbility = this.getAbility("Pegasus Light");
        if (pegasusLightAbility) {
            const percentage = Number(this.calculateAbilityApplyChance(pegasusLightAbility).toFixed(2));
            this.refreshAbiltyDescription(
                pegasusLightAbility.getName(),
                pegasusLightAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Paralysis
        const paralysisAbility = this.getAbility("Paralysis");
        if (paralysisAbility) {
            const description = paralysisAbility.getDesc().join("\n");
            const reduction = this.calculateAbilityApplyChance(paralysisAbility);
            const chance = Math.min(100, reduction * 2);
            const updatedDescription = description
                .replace("{}", Number(chance.toFixed(2)).toString())
                .replace("{}", Number(reduction.toFixed(2)).toString());
            this.refreshAbiltyDescription(paralysisAbility.getName(), updatedDescription);
        }

        // Deep Wounds Level 1
        const deepWoundsLevel1Ability = this.getAbility("Deep Wounds Level 1");
        if (deepWoundsLevel1Ability) {
            this.refreshAbiltyDescription(
                deepWoundsLevel1Ability.getName(),
                deepWoundsLevel1Ability
                    .getDesc()
                    .join("\n")
                    .replace(/\{\}/g, this.calculateAbilityCount(deepWoundsLevel1Ability).toString()),
            );
        }

        // Deep Wounds Level 2
        const deepWoundsLevel2Ability = this.getAbility("Deep Wounds Level 2");
        if (deepWoundsLevel2Ability) {
            this.refreshAbiltyDescription(
                deepWoundsLevel2Ability.getName(),
                deepWoundsLevel2Ability
                    .getDesc()
                    .join("\n")
                    .replace(/\{\}/g, this.calculateAbilityCount(deepWoundsLevel2Ability).toString()),
            );
        }

        // Deep Wounds Level 3
        const deepWoundsLevel3Ability = this.getAbility("Deep Wounds Level 3");
        if (deepWoundsLevel3Ability) {
            this.refreshAbiltyDescription(
                deepWoundsLevel3Ability.getName(),
                deepWoundsLevel3Ability
                    .getDesc()
                    .join("\n")
                    .replace(/\{\}/g, this.calculateAbilityCount(deepWoundsLevel3Ability).toString()),
            );
        }

        // Blind Fury
        const blindFuryAbility = this.getAbility("Blind Fury");
        if (blindFuryAbility) {
            this.refreshAbiltyDescription(
                blindFuryAbility.getName(),
                blindFuryAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        (
                            (1 -
                                this.unitProperties.amount_alive /
                                    (this.unitProperties.amount_alive + this.unitProperties.amount_died)) *
                            100
                        ).toFixed(1),
                    ),
            );
        }

        // Miner
        const minerAbility = this.getAbility("Miner");
        if (minerAbility) {
            this.refreshAbiltyDescription(
                minerAbility.getName(),
                minerAbility.getDesc().join("\n").replace(/\{\}/g, this.calculateAbilityCount(minerAbility).toString()),
            );
        }

        // Chain Lightning
        const chainLightningAbility = this.getAbility("Chain Lightning");
        if (chainLightningAbility) {
            const percentage = this.calculateAbilityMultiplier(chainLightningAbility) * 100;
            const description = chainLightningAbility.getDesc().join("\n");
            const updatedDescription = description
                .replace("{}", Number(percentage.toFixed()).toString())
                .replace("{}", Number(((percentage * 7) / 8).toFixed()).toString())
                .replace("{}", Number(((percentage * 6) / 8).toFixed()).toString())
                .replace("{}", Number(((percentage * 5) / 8).toFixed()).toString());
            this.refreshAbiltyDescription(chainLightningAbility.getName(), updatedDescription);
        }

        // Crusade
        const crusadeAbility = this.getAbility("Crusade");
        if (crusadeAbility) {
            this.refreshAbiltyDescription(
                crusadeAbility.getName(),
                crusadeAbility
                    .getDesc()
                    .join("\n")
                    .replace(/\{\}/g, Number(this.calculateAbilityCount(crusadeAbility).toFixed(2)).toString()),
            );
        }
    }

    private refreshAbiltyDescription(abilityName: string, abilityDescription: string): void {
        if (
            this.unitProperties.abilities.length === this.unitProperties.abilities_descriptions.length &&
            this.unitProperties.abilities.length === this.unitProperties.abilities_stack_powered.length &&
            this.unitProperties.abilities.length === this.unitProperties.abilities_auras.length
        ) {
            for (let i = 0; i < this.unitProperties.abilities.length; i++) {
                if (
                    this.unitProperties.abilities[i] === abilityName &&
                    (this.unitProperties.abilities_stack_powered[i] || abilityName === "Blind Fury")
                ) {
                    this.unitProperties.abilities_descriptions[i] = abilityDescription;
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
                    this.textures,
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
