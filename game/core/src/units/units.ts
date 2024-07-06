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

import {
    b2BodyDef,
    b2BodyType,
    b2ChainShape,
    b2Color,
    b2Draw,
    b2FixtureDef,
    b2PolygonShape,
    b2Vec2,
    XY,
} from "@box2d/core";
import { removeFromArray } from "@box2d/lights/dist/utils/arrayUtils";
import {
    AbilityPowerType,
    AllFactionsType,
    AttackType,
    FactionType,
    ToFaction,
    GridMath,
    GridSettings,
    UnitProperties,
    HoCLib,
    TeamType,
    UnitType,
} from "@heroesofcrypto/common";
import Denque from "denque";

import { Ability } from "../abilities/abilities";
import { AbilitiesFactory } from "../abilities/abilities_factory";
import { AppliedSpell, Spell, calculateBuffsDebuffsEffect } from "../spells/spells";
import { SpellsFactory } from "../spells/spells_factory";
import {
    DAMAGE_ANIMATION_TICKS,
    HP_BAR_DELTA,
    LUCK_MAX_CHANGE_FOR_TURN,
    LUCK_MAX_VALUE_TOTAL,
    MAX_FPS,
    MAX_UNIT_STACK_POWER,
    MIN_UNIT_STACK_POWER,
    MORALE_MAX_VALUE_TOTAL,
} from "../statics";
import { DefaultShader } from "../utils/gl/defaultShader";
import { Sprite } from "../utils/gl/Sprite";
import { Effect } from "../effects/effects";
import { SceneLog } from "../menu/scene_log";

export interface IAttackTargets {
    units: Unit[];
    unitIds: Set<string>;
    attackCells: XY[];
    attackCellHashes: Set<number>;
    attackCellHashesToLargeCells: Map<number, XY[]>;
}

export interface IUnitDistance {
    unit: Unit;
    distance: number;
}

export interface IUnitPropertiesProvider {
    getAllProperties(): UnitProperties;

    getName(): string;

    getFaction(): string;

    getHp(): number;

    getMaxHp(): number;

    getSteps(): number;

    getMorale(): number;

    getLuck(): number;

    getLuckPerTurn(): number;

    getSpeed(): number;

    getArmor(): number;

    getAttackType(): AttackType;

    getAttack(): number;

    getAttackDamageMin(): number;

    getAttackDamageMax(): number;

    getAttackRange(): number;

    getRangeShots(): number;

    getRangeShotDistance(): number;

    getMagicResist(): number;

    getSpellsCount(): number;

    getCanCastSpells(): boolean;

    getCanFly(): boolean;

    getExp(): number;

    getAmountAlive(): number;

    getAmountDied(): number;

    getStackPower(): number;

    getTeam(): TeamType;

    getUnitType(): UnitType;

    getSmallTextureName(): string;

    getLargeTextureName(): string;
}

export interface IUnitAIRepr {
    getId(): string;
    getTeam(): TeamType;
    getSteps(): number;
    getSpeed(): number;
    getSize(): number;
    getCanFly(): boolean;
    isSmallSize(): boolean;
    getCell(): XY | undefined;
    getAllProperties(): UnitProperties | undefined;
}

interface IDamageable {
    applyDamage(minusHp: number, currentTick: number): void;

    calculatePossibleLosses(minusHp: number): number;

    isDead(): boolean;
}

interface IDamager {
    calculateAttackDamageMin(
        enemyUnit: Unit,
        isRangeAttack: boolean,
        divisor: number,
        abilityMultiplier: number,
    ): number;

    calculateAttackDamageMax(
        enemyUnit: Unit,
        isRangeAttack: boolean,
        divisor: number,
        abilityMultiplier: number,
    ): number;

    calculateAttackDamage(enemyUnit: Unit, attackType: AttackType, divisor: number, abilityMultiplier: number): number;

    getAttackTypeSelection(): AttackType;

    selectAttackType(selectedAttackType: AttackType): boolean;
}

interface IDamageTaken {
    animationTicks: number;
    unitsDied: number;
}

export class Unit implements IUnitPropertiesProvider, IDamageable, IDamager, IUnitAIRepr {
    protected readonly gl: WebGLRenderingContext;

    protected readonly shader: DefaultShader;

    protected readonly digitNormalTextures: Map<number, WebGLTexture>;

    protected readonly digitDamageTextures: Map<number, WebGLTexture>;

    protected readonly unitProperties: UnitProperties;

    protected readonly initialUnitProperties: UnitProperties;

    protected readonly gridSettings: GridSettings;

    protected readonly teamType: TeamType;

    protected readonly unitType: UnitType;

    protected readonly smallSprite: Sprite;

    protected readonly tagSprite: Sprite;

    protected readonly hourglassSprite: Sprite;

    protected readonly greenSmallFlagSprite: Sprite;

    protected readonly redSmallFlagSprite: Sprite;

    protected readonly summoned: boolean;

    protected readonly bodyDef: b2BodyDef;

    protected readonly fixtureDef: b2FixtureDef;

    protected readonly buffs: AppliedSpell[];

    protected readonly debuffs: AppliedSpell[];

    protected readonly position: b2Vec2;

    protected readonly stackPowerBarFixtureDefs: b2FixtureDef[];

    protected readonly stackPowerBarBoundFixtureDefs: b2FixtureDef[];

    protected readonly damageAnimationTicks: Denque<IDamageTaken> = new Denque<IDamageTaken>();

    protected spells: Spell[];

    protected abilities: Ability[];

    protected effects: Effect[];

    protected selectedAttackType: AttackType;

    protected rangeArmorMultiplier = 1;

    protected maxRangeShots = 0;

    protected responded = false;

    protected onHourglass = false;

    protected stackPower = MAX_UNIT_STACK_POWER;

    public constructor(
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        digitNormalTextures: Map<number, WebGLTexture>,
        digitDamageTextures: Map<number, WebGLTexture>,
        unitProperties: UnitProperties,
        gridSettings: GridSettings,
        teamType: TeamType,
        unitType: UnitType,
        smallSprite: Sprite,
        tagSprite: Sprite,
        hourglassSprite: Sprite,
        greenSmallFlagSprite: Sprite,
        redSmallFlagSprite: Sprite,
        spellsFactory: SpellsFactory,
        abilitiesFactory: AbilitiesFactory,
        summoned: boolean,
    ) {
        this.gl = gl;
        this.shader = shader;
        this.digitNormalTextures = digitNormalTextures;
        this.digitDamageTextures = digitDamageTextures;
        this.unitProperties = unitProperties;
        this.initialUnitProperties = structuredClone(unitProperties);
        this.gridSettings = gridSettings;
        this.teamType = teamType;
        this.unitType = unitType;
        this.smallSprite = smallSprite;
        this.tagSprite = tagSprite;
        this.hourglassSprite = hourglassSprite;
        this.greenSmallFlagSprite = greenSmallFlagSprite;
        this.redSmallFlagSprite = redSmallFlagSprite;
        this.summoned = summoned;

        if (this.unitProperties.attack_type === AttackType.MELEE) {
            this.selectedAttackType = AttackType.MELEE;
        } else if (this.unitProperties.attack_type === AttackType.RANGE) {
            this.selectedAttackType = AttackType.RANGE;
        } else {
            this.selectedAttackType = AttackType.MAGIC;
        }

        const position = (this.position = new b2Vec2());

        this.bodyDef = {
            type: b2BodyType.b2_dynamicBody,
            position,
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
                new b2Vec2(this.position.x - halfUnitStep, yTop),
                new b2Vec2(this.position.x - halfUnitStep + fullUnitStep / 7, yTop),
                new b2Vec2(this.position.x - halfUnitStep + fullUnitStep / 7, yBottom),
                new b2Vec2(this.position.x - halfUnitStep, yBottom),
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
                new b2Vec2(this.position.x - halfUnitStep + HP_BAR_DELTA, yTop),
                new b2Vec2(this.position.x - halfUnitStep + fullUnitStep / 7 - HP_BAR_DELTA, yTop),
                new b2Vec2(this.position.x - halfUnitStep + HP_BAR_DELTA, yBottom),
                new b2Vec2(this.position.x - halfUnitStep + fullUnitStep / 7 - HP_BAR_DELTA, yBottom),
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
        this.spells = [];
        this.parseSpells(spellsFactory);
        this.buffs = [];
        this.debuffs = [];

        this.abilities = [];
        this.maxRangeShots = this.unitProperties.range_shots;
        this.parseAbilities(abilitiesFactory);
        this.unitProperties.range_armor = Number(
            (this.unitProperties.base_armor * this.rangeArmorMultiplier).toFixed(2),
        );

        this.effects = [];
    }

    protected getDistanceToFurthestCorner(position: XY): number {
        return Math.max(
            b2Vec2.Distance(position, { x: this.gridSettings.getMinX(), y: this.gridSettings.getMinY() }),
            b2Vec2.Distance(position, { x: this.gridSettings.getMinX(), y: this.gridSettings.getMaxY() }),
            b2Vec2.Distance(position, { x: this.gridSettings.getMaxX(), y: this.gridSettings.getMinY() }),
            b2Vec2.Distance(position, { x: this.gridSettings.getMaxX(), y: this.gridSettings.getMaxY() }),
        );
    }

    protected parseSpells(spellsFactory: SpellsFactory): void {
        const spells: Map<string, number> = new Map();
        for (const sp of this.unitProperties.spells) {
            if (!spells.has(sp)) {
                spells.set(sp, 1);
            } else {
                const amount = spells.get(sp);
                if (amount) {
                    spells.set(sp, amount + 1);
                } else {
                    spells.set(sp, 1);
                }
            }
        }

        for (const [k, v] of spells.entries()) {
            const spArr = k.split(":");
            if (spArr.length !== 2) {
                continue;
            }
            // can return us undefined
            const faction = ToFaction[spArr[0] as AllFactionsType];
            if (faction === undefined) {
                continue;
            }

            const spellName = spArr[1];
            this.spells.push(spellsFactory.makeSpell(faction, spellName, v));
        }
    }

    public getSpells(): Spell[] {
        return this.spells;
    }

    public getBuffs(): AppliedSpell[] {
        return this.buffs;
    }

    public getDebuffs(): AppliedSpell[] {
        return this.debuffs;
    }

    protected parseAbilities(abilitiesFactory: AbilitiesFactory): void {
        for (const abilityName of this.unitProperties.abilities) {
            const ability = abilitiesFactory.makeAbility(abilityName);
            this.abilities.push(ability);
            if (abilityName === "Endless Quiver") {
                this.unitProperties.range_shots_mod = ability.getPower();
            } else if (abilityName === "Enchanted Skin") {
                this.unitProperties.magic_resist_mod = ability.getPower();
            } else if (abilityName === "Leather Armor") {
                this.rangeArmorMultiplier = ability.getPower() / 100;
            } else if (abilityName === "Limited Supply") {
                this.adjustRangeShotsNumber(true);
            }
        }
    }

    public getAbilities(): Ability[] {
        return this.abilities;
    }

    public getAbility(abilityName: string): Ability | undefined {
        for (const a of this.abilities) {
            if (abilityName === a.getName()) {
                return a;
            }
        }

        return undefined;
    }

    public getEffects(): Effect[] {
        return this.effects;
    }

    public isSkippingThisTurn(): boolean {
        const effects = this.getEffects();
        for (const e of effects) {
            if (e.getName() === "Stun") {
                return true;
            }
        }

        return false;
    }

    public applyEffect(toUnit: Unit, effectName: string | undefined, extended = false): boolean {
        if (!effectName || toUnit.hasEffectActive(effectName)) {
            return false;
        }

        for (const a of this.getAbilities()) {
            if (a.getEffectName() === effectName) {
                const ef = a.getEffect();
                if (ef) {
                    if (extended) {
                        ef.extend();
                    }
                    toUnit.effects.push(ef);
                    return true;
                }
            }
        }

        return false;
    }

    public refreshPreTurnState(sceneLog: SceneLog) {
        if (this.unitProperties.hp !== this.unitProperties.max_hp && this.hasAbilityActive("Wild Regeneration")) {
            const healedHp = this.unitProperties.max_hp - this.unitProperties.hp;
            this.unitProperties.hp = this.unitProperties.max_hp;
            sceneLog.updateLog(`${this.getName()} auto regenerated to its maximum hp (+${healedHp})`);
        }
    }

    public deleteEffect(effect: Effect) {
        this.effects = this.effects.filter((x) => x !== effect);
    }

    public minusLap() {
        for (const ef of this.effects) {
            if (ef.getLaps() > 0) {
                ef.minusLap();
            }

            if (!ef.getLaps()) {
                this.deleteEffect(ef);
            }
        }
    }

    public hasEffectActive(effectName: string): boolean {
        for (const ef of this.getEffects()) {
            if (ef.getName() === effectName) {
                return true;
            }
        }

        return false;
    }

    public hasAbilityActive(abilityName: string): boolean {
        for (const ab of this.abilities) {
            if (ab.getName() === abilityName) {
                return true;
            }
        }

        return false;
    }

    public getAbilityPower(abilityName: string): number {
        for (const ab of this.abilities) {
            if (ab.getName() === abilityName) {
                return ab.getPower();
            }
        }

        return 0;
    }

    public getAllProperties(): UnitProperties {
        return this.unitProperties;
    }

    public getFaction(): FactionType {
        return this.unitProperties.faction;
    }

    public getName(): string {
        return this.unitProperties.name;
    }

    public getHp(): number {
        return this.unitProperties.hp;
    }

    public getMaxHp(): number {
        return this.unitProperties.max_hp;
    }

    public getSteps(): number {
        return this.unitProperties.steps + this.unitProperties.steps_morale;
    }

    public getMorale(): number {
        const { morale } = this.unitProperties;
        if (morale > MORALE_MAX_VALUE_TOTAL) {
            return MORALE_MAX_VALUE_TOTAL;
        }
        if (morale < -MORALE_MAX_VALUE_TOTAL) {
            return -MORALE_MAX_VALUE_TOTAL;
        }
        return morale;
    }

    public getLuck(): number {
        const luck = this.unitProperties.luck + this.unitProperties.luck_per_turn;
        if (luck > LUCK_MAX_VALUE_TOTAL) {
            return LUCK_MAX_VALUE_TOTAL;
        }
        if (luck < -LUCK_MAX_VALUE_TOTAL) {
            return -LUCK_MAX_VALUE_TOTAL;
        }
        return luck;
    }

    public getLuckPerTurn(): number {
        return this.unitProperties.luck_per_turn;
    }

    public getSpeed(): number {
        return this.unitProperties.speed;
    }

    public getArmor(): number {
        return this.unitProperties.base_armor + this.unitProperties.armor_mod;
    }

    public getRangeArmor(): number {
        return this.unitProperties.range_armor + this.unitProperties.armor_mod;
    }

    public getAttackType(): AttackType {
        return this.unitProperties.attack_type;
    }

    public getAttack(): number {
        return this.unitProperties.attack;
    }

    public getAttackDamageMin(): number {
        return this.unitProperties.attack_damage_min;
    }

    public getAttackDamageMax(): number {
        return this.unitProperties.attack_damage_max;
    }

    public getAttackRange(): number {
        return this.unitProperties.attack_range;
    }

    public getRangeShots(): number {
        return this.unitProperties.range_shots_mod
            ? this.unitProperties.range_shots_mod
            : this.unitProperties.range_shots;
    }

    public getRangeShotDistance(): number {
        return this.unitProperties.shot_distance;
    }

    public getMagicResist(): number {
        return this.unitProperties.magic_resist_mod
            ? this.unitProperties.magic_resist_mod
            : this.unitProperties.magic_resist;
    }

    public getSpellsCount(): number {
        return this.unitProperties.spells.length;
    }

    public getCanCastSpells(): boolean {
        return this.unitProperties.can_cast_spells;
    }

    public getCanFly(): boolean {
        return this.unitProperties.can_fly;
    }

    public getExp(): number {
        return this.unitProperties.exp;
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

    public getTeam(): TeamType {
        return this.teamType;
    }

    public getUnitType(): UnitType {
        return this.unitType;
    }

    public getSmallTextureName(): string {
        return this.unitProperties.small_texture_name;
    }

    public getLargeTextureName(): string {
        return this.unitProperties.large_texture_name;
    }

    public getAmountAlive(): number {
        return this.unitProperties.amount_alive;
    }

    public getAmountDied(): number {
        return this.unitProperties.amount_died;
    }

    public getStackPower(): number {
        if (this.stackPower > MAX_UNIT_STACK_POWER) {
            return MAX_UNIT_STACK_POWER;
        }
        if (this.stackPower < MIN_UNIT_STACK_POWER) {
            return MIN_UNIT_STACK_POWER;
        }
        return this.stackPower;
    }

    public getId(): string {
        return this.unitProperties.id;
    }

    public setPosition(x: number, y: number) {
        if (this.hasAbilityActive("Sniper")) {
            this.setRangeShotDistance(
                Number((this.getDistanceToFurthestCorner(this.getPosition()) / this.gridSettings.getStep()).toFixed(2)),
            );
        }
        this.position.Set(x, y);
    }

    public getPosition(): b2Vec2 {
        return this.position;
    }

    public getCell(): XY | undefined {
        return GridMath.getCellForPosition(this.gridSettings, this.getPosition());
    }

    public getSize(): number {
        return this.unitProperties.size;
    }

    public isSmallSize(): boolean {
        return this.unitProperties.size === 1;
    }

    public isSummoned(): boolean {
        return this.summoned;
    }

    public getLevel(): number {
        return this.unitProperties.level;
    }

    public increaseAmountAlive(increaseBy: number): void {
        if (!this.isDead() && this.isSummoned()) {
            this.unitProperties.amount_alive += increaseBy;
        }
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

    public getHoveredSpell(mousePosition: XY): Spell | undefined {
        for (const s of this.spells) {
            if (s.isHover(mousePosition)) {
                return s;
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
            if (i in this.spells && this.spells[i] && this.spells[i].isRemaining()) {
                this.spells[i].renderOnPage(bookPosition++);
                rendered.push(i);
            }
        }

        for (let i = 0; i < this.spells.length; i++) {
            if (!rendered.includes(i)) {
                this.spells[i].cleanupPagePosition();
            }
        }
    }

    public randomizeLuckPerTurn(): void {
        let calculatedLuck = HoCLib.getRandomInt(-LUCK_MAX_CHANGE_FOR_TURN, LUCK_MAX_CHANGE_FOR_TURN + 1);
        if (calculatedLuck + this.unitProperties.luck > LUCK_MAX_VALUE_TOTAL) {
            calculatedLuck = LUCK_MAX_VALUE_TOTAL - this.unitProperties.luck;
        } else if (calculatedLuck + this.unitProperties.luck < -LUCK_MAX_VALUE_TOTAL) {
            calculatedLuck = -LUCK_MAX_VALUE_TOTAL - this.unitProperties.luck;
        }
        this.unitProperties.luck_per_turn = calculatedLuck;
    }

    public cleanupLuckPerTurn(): void {
        this.unitProperties.luck_per_turn = 0;
    }

    public applyDamage(minusHp: number, currentTick: number): void {
        const damageTakenEntry = this.damageAnimationTicks.peekFront();
        const nextAnimationTick = damageTakenEntry?.animationTicks ?? 0;
        if (minusHp < this.unitProperties.hp) {
            this.unitProperties.hp -= minusHp;
            this.damageAnimationTicks.unshift({
                animationTicks: Math.max(currentTick, nextAnimationTick) + DAMAGE_ANIMATION_TICKS,
                unitsDied: 0,
            });
            return;
        }

        this.unitProperties.amount_died += 1;
        this.unitProperties.amount_alive -= 1;
        minusHp -= this.unitProperties.hp;
        this.unitProperties.hp = this.unitProperties.max_hp;

        const amountDied = Math.floor(minusHp / this.unitProperties.max_hp);
        if (amountDied >= this.unitProperties.amount_alive) {
            this.unitProperties.amount_died += this.unitProperties.amount_alive;
            this.unitProperties.amount_alive = 0;
            return;
        }

        this.unitProperties.amount_died += amountDied;
        this.unitProperties.amount_alive -= amountDied;
        this.unitProperties.hp -= minusHp % this.unitProperties.max_hp;
        this.damageAnimationTicks.unshift({
            animationTicks: Math.max(currentTick, nextAnimationTick) + DAMAGE_ANIMATION_TICKS,
            unitsDied: amountDied + 1,
        });
    }

    public isDead(): boolean {
        return this.unitProperties.amount_alive <= 0;
    }

    public increaseMorale(moraleAmount: number): void {
        this.unitProperties.morale += moraleAmount;
        if (this.unitProperties.morale > MORALE_MAX_VALUE_TOTAL) {
            this.unitProperties.morale = MORALE_MAX_VALUE_TOTAL;
        }
    }

    public decreaseMorale(moraleAmount: number): void {
        this.unitProperties.morale -= moraleAmount;
        if (this.unitProperties.morale < -MORALE_MAX_VALUE_TOTAL) {
            this.unitProperties.morale = -MORALE_MAX_VALUE_TOTAL;
        }
    }

    public applyMoraleStepsModifier(stepsMoraleMultiplier = 0): void {
        this.unitProperties.steps_morale = Number((stepsMoraleMultiplier * this.getMorale()).toFixed(2));
    }

    public setAttackMultiplier(multiplier: number) {
        this.unitProperties.attack_multiplier = multiplier;
    }

    public calculatePossibleLosses(minusHp: number): number {
        let amountDied = 0;
        const currentHp = this.unitProperties.hp;

        if (minusHp < currentHp) {
            return amountDied;
        }

        amountDied++;
        minusHp -= currentHp;

        amountDied += Math.floor(minusHp / this.unitProperties.max_hp);
        if (amountDied >= this.unitProperties.amount_alive) {
            return this.unitProperties.amount_alive;
        }

        return amountDied;
    }

    public calculateAbilityMultiplier(ability: Ability): number {
        let calculatedCoeff = 1;
        if (ability.getPowerType() === AbilityPowerType.TOTAL_DAMAGE_PERCENTAGE) {
            let combinedPower = ability.getPower() + this.getLuck();
            if (combinedPower < 0) {
                combinedPower = 1;
            }

            calculatedCoeff *= (combinedPower / 100 / MAX_UNIT_STACK_POWER) * this.getStackPower();
        } else if (ability.getPowerType() === AbilityPowerType.ADDITIONAL_DAMAGE_PERCENTAGE) {
            calculatedCoeff +=
                (ability.getPower() / 100 / MAX_UNIT_STACK_POWER) * this.getStackPower() + this.getLuck() / 100;
        }

        return calculatedCoeff;
    }

    public calculateAbilityApplyChance(ability: Ability): number {
        const combinedPower = ability.getPower() + this.getLuck();
        if (combinedPower < 0) {
            return 0;
        }
        return (combinedPower / MAX_UNIT_STACK_POWER) * this.getStackPower();
    }

    public calculateAttackDamageMin(
        enemyUnit: Unit,
        isRangeAttack: boolean,
        divisor = 1,
        abilityMultiplier = 1,
    ): number {
        if (divisor <= 0) {
            divisor = 1;
        }

        return Math.ceil(
            ((((this.unitProperties.attack_damage_min * this.unitProperties.attack * this.unitProperties.amount_alive) /
                this.getEnemyArmor(enemyUnit, isRangeAttack)) *
                (1 - enemyUnit.getLuck() / 100)) /
                divisor) *
                this.unitProperties.attack_multiplier *
                abilityMultiplier,
        );
    }

    public calculateAttackDamageMax(
        enemyUnit: Unit,
        isRangeAttack: boolean,
        divisor = 1,
        abilityMultiplier = 1,
    ): number {
        if (divisor <= 0) {
            divisor = 1;
        }
        return Math.ceil(
            ((((this.unitProperties.attack_damage_max * this.unitProperties.attack * this.unitProperties.amount_alive) /
                this.getEnemyArmor(enemyUnit, isRangeAttack)) *
                (1 - (enemyUnit.getLuck() + enemyUnit.getLuckPerTurn()) / 100)) /
                divisor) *
                this.unitProperties.attack_multiplier *
                abilityMultiplier,
        );
    }

    public calculateAttackDamage(enemyUnit: Unit, attackType: AttackType, divisor = 1, abilityMultiplier = 1): number {
        const min = this.calculateAttackDamageMin(enemyUnit, attackType === AttackType.RANGE, divisor);
        const max = this.calculateAttackDamageMax(enemyUnit, attackType === AttackType.RANGE, divisor);
        const attackingByMelee = attackType === AttackType.MELEE;
        if (!attackingByMelee && attackType === AttackType.RANGE) {
            if (this.unitProperties.range_shots <= 0) {
                return 0;
            }
            let gotUnlimitedSupplies = false;
            for (const abil of this.getAbilities()) {
                if (abil.getPowerType() === AbilityPowerType.UNLIMITED_SUPPLIES) {
                    gotUnlimitedSupplies = true;
                }
            }
            if (!gotUnlimitedSupplies) {
                this.unitProperties.range_shots -= 1;
            }
        }

        const attackTypeMultiplier =
            attackingByMelee &&
            this.unitProperties.attack_type === AttackType.RANGE &&
            !this.hasAbilityActive("Handyman")
                ? 0.5
                : 1;
        return Math.floor((Math.random() * (max - min) + min) * attackTypeMultiplier * abilityMultiplier);
    }

    public canSkipResponse(): boolean {
        for (const a of this.abilities) {
            if (a.getSkipResponse()) {
                return true;
            }
        }

        return false;
    }

    public canRespond(): boolean {
        for (const e of this.effects) {
            if (e.getName() === "Stun") {
                return false;
            }
        }

        return true;
    }

    public setResponded(hasResponded: boolean) {
        this.responded = hasResponded;
    }

    public setOnHourglass(onHourglass: boolean) {
        this.onHourglass = onHourglass;
    }

    public getAttackTypeSelection(): AttackType {
        if (this.selectedAttackType === AttackType.RANGE && this.unitProperties.range_shots <= 0) {
            this.selectedAttackType = AttackType.MELEE;
            this.unitProperties.attack_type_selected = AttackType.MELEE;
        } else if (this.selectedAttackType === AttackType.MAGIC && this.unitProperties.spells.length <= 0) {
            this.selectedAttackType = AttackType.MELEE;
            this.unitProperties.attack_type_selected = AttackType.MELEE;
        }

        return this.selectedAttackType;
    }

    public selectAttackType(selectedAttackType: AttackType): boolean {
        if (selectedAttackType === AttackType.MELEE && this.selectedAttackType !== selectedAttackType) {
            this.selectedAttackType = selectedAttackType;
            this.unitProperties.attack_type_selected = AttackType.MELEE;
            return true;
        }

        if (
            selectedAttackType === AttackType.RANGE &&
            this.unitProperties.attack_type === AttackType.RANGE &&
            this.unitProperties.range_shots &&
            this.selectedAttackType !== selectedAttackType
        ) {
            this.selectedAttackType = selectedAttackType;
            this.unitProperties.attack_type_selected = AttackType.RANGE;
            return true;
        }

        if (
            selectedAttackType === AttackType.MAGIC &&
            this.unitProperties.attack_type === AttackType.MAGIC &&
            this.unitProperties.spells.length &&
            this.selectedAttackType !== selectedAttackType
        ) {
            this.selectedAttackType = selectedAttackType;
            this.unitProperties.attack_type_selected = AttackType.MAGIC;
            return true;
        }

        return false;
    }

    public applyBuff(buff: Spell, casterMaxHp: number, casterBaseArmor: number): void {
        this.buffs.push(
            new AppliedSpell(buff.getSprite(), buff.getName(), buff.getLapsTotal(), casterMaxHp, casterBaseArmor),
        );
    }

    public applyDebuff(debuff: Spell, casterMaxHp: number, casterBaseArmor: number): void {
        this.debuffs.push(
            new AppliedSpell(debuff.getSprite(), debuff.getName(), debuff.getLapsTotal(), casterMaxHp, casterBaseArmor),
        );
    }

    public useSpell(spell: Spell): void {
        const spellsUpdated: Spell[] = [];
        for (const s of this.spells) {
            if (s.getName() === spell.getName()) {
                s.decreaseAmount();
                removeFromArray(this.unitProperties.spells, `${s.getFaction()}:${s.getName()}`);
            }
            if (s.isRemaining()) {
                spellsUpdated.push(s);
            }
        }
        this.spells = spellsUpdated;
    }

    public adjustBaseStats() {
        const baseStatsDiff = calculateBuffsDebuffsEffect(this.getBuffs(), this.getDebuffs());
        this.unitProperties.max_hp = this.refreshAndGetAdjustedMaxHp() + baseStatsDiff.baseStats.hp;
        if (this.unitProperties.max_hp < this.unitProperties.hp) {
            this.unitProperties.hp = this.unitProperties.max_hp;
        }
        this.unitProperties.base_armor = this.initialUnitProperties.base_armor + baseStatsDiff.baseStats.armor;
        this.unitProperties.range_armor = Number(
            (this.unitProperties.base_armor * this.rangeArmorMultiplier).toFixed(2),
        );

        const heavyArmorAbility = this.getAbility("Heavy Armor");
        if (heavyArmorAbility) {
            this.unitProperties.base_armor += Number(
                (
                    this.unitProperties.base_armor *
                    ((heavyArmorAbility.getPower() + this.getLuck()) / 100 / MAX_UNIT_STACK_POWER) *
                    this.getStackPower()
                ).toFixed(2),
            );
            this.unitProperties.range_armor += Number(
                (
                    this.unitProperties.range_armor *
                    ((heavyArmorAbility.getPower() + this.getLuck()) / 100 / MAX_UNIT_STACK_POWER) *
                    this.getStackPower()
                ).toFixed(2),
            );
        }
    }

    public adjustRangeShotsNumber(force: boolean) {
        if (!force && !this.hasAbilityActive("Limited Supply")) {
            return;
        }

        const actualStackPowerCoeff = this.getStackPower() / MAX_UNIT_STACK_POWER;
        this.unitProperties.range_shots = Math.min(
            this.unitProperties.range_shots,
            Math.floor(this.maxRangeShots * actualStackPowerCoeff),
        );
    }

    public setRangeShotDistance(distance: number) {
        this.unitProperties.shot_distance = distance;
    }

    public setStackPower(stackPower: number): void {
        this.stackPower = stackPower;
    }

    protected getEnemyArmor(enemyUnit: Unit, isRangeAttack: boolean): number {
        if (this.hasAbilityActive("Piercing Spear")) {
            return 1;
        }

        return isRangeAttack ? enemyUnit.getRangeArmor() : enemyUnit.getArmor();
    }

    protected refreshAndGetAdjustedMaxHp(): number {
        const boostHpPower = this.getAbilityPower("Boost Health");
        if (boostHpPower) {
            const actualStackPowerCoeff = this.getStackPower() / MAX_UNIT_STACK_POWER;
            let adjustActualHp = false;
            if (this.unitProperties.hp === this.unitProperties.max_hp) {
                adjustActualHp = true;
            }
            this.unitProperties.max_hp = Math.floor(
                this.initialUnitProperties.max_hp +
                    ((this.initialUnitProperties.max_hp * boostHpPower) / 100) * actualStackPowerCoeff,
            );
            if (adjustActualHp) {
                this.unitProperties.hp = this.unitProperties.max_hp;
            }
            return this.unitProperties.max_hp;
        }

        return this.initialUnitProperties.max_hp;
    }

    protected renderAmountSprites(
        digitTextures: Map<number, WebGLTexture>,
        amountToRender: number,
        position: XY,
        upNextPosition: number,
        xShift: number,
        yShift: number,
        fullUnitStep: number,
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

            s.setRect(
                position.x + (upNextPosition ? fullUnitStep - xShift : halfUnitStep) - sixthStep * i++,
                position.y - (upNextPosition ? yShift : halfUnitStep),
                sixthStep,
                fifthStep,
            );
            s.render();
        }
    }
}
