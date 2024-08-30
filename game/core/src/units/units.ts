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
    AppliedSpell,
    AbilityPowerType,
    Ability,
    Effect,
    EffectFactory,
    AbilityFactory,
    AllFactionsType,
    AuraEffect,
    HoCConfig,
    AttackType,
    HoCConstants,
    FactionType,
    ToFactionType,
    SpellHelper,
    GridMath,
    Spell,
    GridSettings,
    UnitProperties,
    HoCLib,
    HoCMath,
    TeamType,
    UnitType,
} from "@heroesofcrypto/common";
import Denque from "denque";

import { DAMAGE_ANIMATION_TICKS, HP_BAR_DELTA, MAX_FPS } from "../statics";
import { DefaultShader } from "../utils/gl/defaultShader";
import { Sprite } from "../utils/gl/Sprite";
import { SceneLog } from "../menu/scene_log";
import { RenderableSpell } from "../spells/renderable_spell";
import { PreloadedTextures } from "../utils/gl/preload";

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
    getBaseCell(): XY | undefined;
    getCells(): XY[];
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

    protected readonly textures: PreloadedTextures;

    protected readonly bodyDef: b2BodyDef;

    protected readonly fixtureDef: b2FixtureDef;

    protected buffs: AppliedSpell[];

    protected debuffs: AppliedSpell[];

    protected readonly position: b2Vec2;

    protected readonly stackPowerBarFixtureDefs: b2FixtureDef[];

    protected readonly stackPowerBarBoundFixtureDefs: b2FixtureDef[];

    protected readonly damageAnimationTicks: Denque<IDamageTaken> = new Denque<IDamageTaken>();

    protected spells: RenderableSpell[];

    protected effects: Effect[];

    protected readonly abilities: Ability[] = [];

    protected readonly auraEffects: AuraEffect[] = [];

    protected readonly effectFactory: EffectFactory;

    protected selectedAttackType: AttackType;

    protected maxRangeShots = 0;

    protected responded = false;

    protected onHourglass = false;

    protected adjustedBaseStatsRounds: number[] = [];

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
        abilityFactory: AbilityFactory,
        effectFactory: EffectFactory,
        summoned: boolean,
        textures: PreloadedTextures,
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
        this.effectFactory = effectFactory;
        this.summoned = summoned;
        this.textures = textures;

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
        this.parseSpells();
        this.buffs = [];
        this.debuffs = [];
        this.maxRangeShots = this.unitProperties.range_shots;
        this.parseAbilities(abilityFactory);
        this.effects = [];
        this.parseAuraEffects();
    }

    protected getDistanceToFurthestCorner(position: XY): number {
        return Math.max(
            b2Vec2.Distance(position, { x: this.gridSettings.getMinX(), y: this.gridSettings.getMinY() }),
            b2Vec2.Distance(position, { x: this.gridSettings.getMinX(), y: this.gridSettings.getMaxY() }),
            b2Vec2.Distance(position, { x: this.gridSettings.getMaxX(), y: this.gridSettings.getMinY() }),
            b2Vec2.Distance(position, { x: this.gridSettings.getMaxX(), y: this.gridSettings.getMaxY() }),
        );
    }

    protected parseSpells(): void {
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
            const faction = ToFactionType[spArr[0] as AllFactionsType];
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

    public getSpells(): RenderableSpell[] {
        return this.spells;
    }

    public getBuff(buffName: string): AppliedSpell | undefined {
        for (const b of this.buffs) {
            if (buffName === b.getName()) {
                return b;
            }
        }

        return undefined;
    }

    public getBuffs(): AppliedSpell[] {
        return this.buffs;
    }

    public getDebuff(debuffName: string): AppliedSpell | undefined {
        for (const db of this.debuffs) {
            if (debuffName === db.getName()) {
                return db;
            }
        }

        return undefined;
    }

    public getDebuffs(): AppliedSpell[] {
        return this.debuffs;
    }

    protected parseAbilities(abilityFactory: AbilityFactory): void {
        for (const abilityName of this.unitProperties.abilities) {
            const ability = abilityFactory.makeAbility(abilityName);
            this.abilities.push(ability);
        }
    }

    protected parseAuraEffects(): void {
        for (const auraEffectName of this.unitProperties.aura_effects) {
            const auraEffect = this.effectFactory.makeAuraEffect(auraEffectName);
            if (auraEffect) {
                this.auraEffects.push(auraEffect);
            }
        }
    }

    public getAbilities(): Ability[] {
        return this.abilities;
    }

    public getAuraEffects(): AuraEffect[] {
        return this.auraEffects;
    }

    public getAbility(abilityName: string): Ability | undefined {
        for (const a of this.abilities) {
            if (abilityName === a.getName()) {
                return a;
            }
        }

        return undefined;
    }

    public getEffect(effectName: string): Effect | undefined {
        for (const e of this.effects) {
            if (effectName === e.getName()) {
                return e;
            }
        }

        return undefined;
    }

    public getAuraEffect(auraEffectName: string): AuraEffect | undefined {
        for (const ae of this.auraEffects) {
            if (auraEffectName === ae.getName()) {
                return ae;
            }
        }

        return undefined;
    }

    public getCumulativeHp(): number {
        if (this.isDead()) {
            return 0;
        }

        let cumulativeHp = this.unitProperties.hp;
        if (cumulativeHp < 0) {
            cumulativeHp = 0;
        }

        return (this.unitProperties.amount_alive - 1) * this.unitProperties.max_hp + cumulativeHp;
    }

    public getEffects(): Effect[] {
        return this.effects;
    }

    public isSkippingThisTurn(): boolean {
        const effects = this.getEffects();
        for (const e of effects) {
            if (e.getName() === "Stun" || e.getName() === "Blindness") {
                return true;
            }
        }

        return false;
    }

    public applyEffect(effect: Effect): boolean {
        // not checking for duplicates here, do it on a caller side
        if (
            this.unitProperties.applied_effects.length === this.unitProperties.applied_effects_laps.length &&
            this.unitProperties.applied_effects.length === this.unitProperties.applied_effects_powers.length &&
            this.unitProperties.applied_effects.length === this.unitProperties.applied_effects_descriptions.length
        ) {
            this.deleteEffect(effect.getName());
            this.effects.push(effect);
            this.unitProperties.applied_effects.push(effect.getName());
            this.unitProperties.applied_effects_laps.push(effect.getLaps());
            this.unitProperties.applied_effects_powers.push(effect.getPower());
            this.unitProperties.applied_effects_descriptions.push(
                effect.getDesc().replace(/\{\}/g, effect.getPower().toString()),
            );
            return true;
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

    public deleteEffect(effectName: string) {
        this.effects = this.effects.filter((e) => e.getName() !== effectName);

        if (
            this.unitProperties.applied_effects.length === this.unitProperties.applied_effects_laps.length &&
            this.unitProperties.applied_effects.length === this.unitProperties.applied_effects_descriptions.length &&
            this.unitProperties.applied_effects.length === this.unitProperties.applied_effects_powers.length
        ) {
            for (let i = this.unitProperties.applied_effects.length - 1; i >= 0; i--) {
                if (this.unitProperties.applied_effects[i] === effectName) {
                    this.unitProperties.applied_effects.splice(i, 1);
                    this.unitProperties.applied_effects_laps.splice(i, 1);
                    this.unitProperties.applied_effects_descriptions.splice(i, 1);
                    this.unitProperties.applied_effects_powers.splice(i, 1);
                }
            }
        }
    }

    public deleteBuff(buffName: string) {
        this.buffs = this.buffs.filter((b) => b.getName() !== buffName);

        if (
            this.unitProperties.applied_buffs.length === this.unitProperties.applied_buffs_laps.length &&
            this.unitProperties.applied_buffs.length == this.unitProperties.applied_buffs_descriptions.length &&
            this.unitProperties.applied_buffs.length == this.unitProperties.applied_buffs_powers.length
        ) {
            for (let i = this.unitProperties.applied_buffs.length - 1; i >= 0; i--) {
                if (this.unitProperties.applied_buffs[i] === buffName) {
                    this.unitProperties.applied_buffs.splice(i, 1);
                    this.unitProperties.applied_buffs_laps.splice(i, 1);
                    this.unitProperties.applied_buffs_descriptions.splice(i, 1);
                    this.unitProperties.applied_buffs_powers.splice(i, 1);
                }
            }
        }
    }

    public deleteDebuff(debuffName: string) {
        this.debuffs = this.debuffs.filter((d) => d.getName() !== debuffName);

        if (
            this.unitProperties.applied_debuffs.length === this.unitProperties.applied_debuffs_laps.length &&
            this.unitProperties.applied_debuffs.length == this.unitProperties.applied_debuffs_descriptions.length &&
            this.unitProperties.applied_debuffs.length == this.unitProperties.applied_debuffs_powers.length
        ) {
            for (let i = this.unitProperties.applied_debuffs.length - 1; i >= 0; i--) {
                if (this.unitProperties.applied_debuffs[i] === debuffName) {
                    this.unitProperties.applied_debuffs.splice(i, 1);
                    this.unitProperties.applied_debuffs_laps.splice(i, 1);
                    this.unitProperties.applied_debuffs_descriptions.splice(i, 1);
                    this.unitProperties.applied_debuffs_powers.splice(i, 1);
                }
            }
        }
    }

    public minusLap() {
        const dismoraleDebuff = this.getDebuff("Dismorale");
        if (!dismoraleDebuff) {
            for (const ef of this.effects) {
                if (ef.getLaps() > 0) {
                    ef.minusLap();
                }

                if (ef.getLaps()) {
                    if (
                        this.unitProperties.applied_effects.length ===
                            this.unitProperties.applied_effects_laps.length &&
                        this.unitProperties.applied_effects.length ===
                            this.unitProperties.applied_effects_descriptions.length &&
                        this.unitProperties.applied_effects.length === this.unitProperties.applied_effects_powers.length
                    ) {
                        for (let i = 0; i < this.unitProperties.applied_effects.length; i++) {
                            if (
                                this.unitProperties.applied_effects[i] === ef.getName() &&
                                this.unitProperties.applied_effects_laps[i] !== Number.MAX_SAFE_INTEGER
                            ) {
                                this.unitProperties.applied_effects_laps[i]--;
                            }
                        }
                    }
                } else {
                    this.deleteEffect(ef.getName());
                }
            }
        }

        const moraleBuff = this.getBuff("Morale");
        if (moraleBuff) {
            this.deleteBuff("Morale");
        } else {
            for (const b of this.buffs) {
                if (b.getLaps() > 0 && b) {
                    b.minusLap();
                }

                if (b.getLaps()) {
                    if (this.unitProperties.applied_buffs.length === this.unitProperties.applied_buffs_laps.length) {
                        for (let i = 0; i < this.unitProperties.applied_buffs.length; i++) {
                            if (
                                this.unitProperties.applied_buffs[i] === b.getName() &&
                                this.unitProperties.applied_buffs_laps[i] !== Number.MAX_SAFE_INTEGER
                            ) {
                                this.unitProperties.applied_buffs_laps[i]--;
                            }
                        }
                    }
                } else {
                    this.deleteBuff(b.getName());
                }
            }
        }

        if (dismoraleDebuff) {
            this.deleteDebuff("Dismorale");
        } else {
            for (const d of this.debuffs) {
                if (d.getLaps() > 0) {
                    d.minusLap();
                }

                if (d.getLaps()) {
                    if (
                        this.unitProperties.applied_debuffs.length === this.unitProperties.applied_debuffs_laps.length
                    ) {
                        for (let i = 0; i < this.unitProperties.applied_debuffs.length; i++) {
                            if (
                                this.unitProperties.applied_debuffs[i] === d.getName() &&
                                this.unitProperties.applied_debuffs_laps[i] !== Number.MAX_SAFE_INTEGER
                            ) {
                                this.unitProperties.applied_debuffs_laps[i]--;
                            }
                        }
                    }
                } else {
                    this.deleteDebuff(d.getName());
                }
            }
        }
    }

    public hasDebuffActive(debuffName: string): boolean {
        for (const b of this.getDebuffs()) {
            if (b.getName() === debuffName) {
                return true;
            }
        }

        return false;
    }

    public hasBuffActive(buffName: string): boolean {
        for (const b of this.getBuffs()) {
            if (b.getName() === buffName) {
                return true;
            }
        }

        return false;
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

    public getAppliedAuraEffect(auraEffectName: string): AuraEffect | undefined {
        if (
            this.unitProperties.applied_buffs.length === this.unitProperties.applied_buffs_laps.length &&
            this.unitProperties.applied_buffs.length === this.unitProperties.applied_buffs_descriptions.length &&
            this.unitProperties.applied_buffs.length === this.unitProperties.applied_buffs_powers.length
        ) {
            for (let i = this.unitProperties.applied_buffs.length - 1; i >= 0; i--) {
                if (
                    auraEffectName === this.unitProperties.applied_buffs[i] &&
                    this.unitProperties.applied_buffs_laps[i] === Number.MAX_SAFE_INTEGER
                ) {
                    const auraEffectWords = auraEffectName.split(/\s+/);
                    const auraEffectString = auraEffectWords.slice(0, -1).join(" ");
                    const auraEffect = this.effectFactory.makeAuraEffect(auraEffectString);
                    if (auraEffect) {
                        auraEffect.setPower(this.unitProperties.applied_buffs_powers[i]);
                        return auraEffect;
                    }
                }
            }
        }

        return undefined;
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
        if (morale > HoCConstants.MORALE_MAX_VALUE_TOTAL) {
            return HoCConstants.MORALE_MAX_VALUE_TOTAL;
        }
        if (morale < -HoCConstants.MORALE_MAX_VALUE_TOTAL) {
            return -HoCConstants.MORALE_MAX_VALUE_TOTAL;
        }
        return morale;
    }

    public getLuck(): number {
        const luck = this.unitProperties.luck + this.unitProperties.luck_per_turn;
        if (luck > HoCConstants.LUCK_MAX_VALUE_TOTAL) {
            return HoCConstants.LUCK_MAX_VALUE_TOTAL;
        }
        if (luck < -HoCConstants.LUCK_MAX_VALUE_TOTAL) {
            return -HoCConstants.LUCK_MAX_VALUE_TOTAL;
        }
        return luck;
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
        return this.unitProperties.base_attack + this.unitProperties.attack_mod;
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

    public decreaseNumberOfShots(): void {
        this.unitProperties.range_shots -= 1;
        if (this.unitProperties.range_shots < 0) {
            this.unitProperties.range_shots = 0;
        }
        this.unitProperties.range_shots = Math.floor(this.unitProperties.range_shots);
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

    public getOppositeTeam(): TeamType {
        if (this.teamType === TeamType.LOWER) {
            return TeamType.UPPER;
        }

        return TeamType.LOWER;
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
        if (this.unitProperties.stack_power > HoCConstants.MAX_UNIT_STACK_POWER) {
            return HoCConstants.MAX_UNIT_STACK_POWER;
        }
        if (this.unitProperties.stack_power < HoCConstants.MIN_UNIT_STACK_POWER) {
            return HoCConstants.MIN_UNIT_STACK_POWER;
        }
        return this.unitProperties.stack_power;
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

    public getBaseCell(): XY | undefined {
        return GridMath.getCellForPosition(this.gridSettings, this.getPosition());
    }

    public getCells(): XY[] {
        if (this.isSmallSize()) {
            const bodyCellPos = GridMath.getCellForPosition(this.gridSettings, this.getPosition());
            if (!bodyCellPos) {
                return [];
            }

            return [bodyCellPos];
        }

        return GridMath.getCellsAroundPosition(this.gridSettings, this.getPosition());
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

    public getHoveredSpell(mousePosition: XY): RenderableSpell | undefined {
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
            if (
                i in this.spells &&
                this.spells[i] &&
                this.spells[i].isRemaining() &&
                this.spells[i].getMinimalCasterStackPower() <= this.getStackPower()
            ) {
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
        let calculatedLuck = HoCLib.getRandomInt(
            -HoCConstants.LUCK_MAX_CHANGE_FOR_TURN,
            HoCConstants.LUCK_MAX_CHANGE_FOR_TURN + 1,
        );
        if (calculatedLuck + this.unitProperties.luck > HoCConstants.LUCK_MAX_VALUE_TOTAL) {
            calculatedLuck = HoCConstants.LUCK_MAX_VALUE_TOTAL - this.unitProperties.luck;
        } else if (calculatedLuck + this.unitProperties.luck < -HoCConstants.LUCK_MAX_VALUE_TOTAL) {
            calculatedLuck = -HoCConstants.LUCK_MAX_VALUE_TOTAL - this.unitProperties.luck;
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
        // dead
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

        if (this.hasAbilityActive("Bitter Experience")) {
            this.unitProperties.base_armor += 1;
            this.initialUnitProperties.base_armor += 1;
            this.unitProperties.steps += 1;
            this.initialUnitProperties.steps += 1;
        }
    }

    public isDead(): boolean {
        return this.unitProperties.amount_alive <= 0;
    }

    public increaseMorale(moraleAmount: number): void {
        if (
            this.hasBuffActive("Courage") ||
            this.hasBuffActive("Morale") ||
            this.hasDebuffActive("Sadness") ||
            this.hasDebuffActive("Dismorale")
        ) {
            return;
        }

        this.unitProperties.morale += moraleAmount;
        if (this.unitProperties.morale > HoCConstants.MORALE_MAX_VALUE_TOTAL) {
            this.unitProperties.morale = HoCConstants.MORALE_MAX_VALUE_TOTAL;
        }
        this.initialUnitProperties.morale = this.unitProperties.morale;
    }

    public decreaseMorale(moraleAmount: number): void {
        if (
            this.hasBuffActive("Courage") ||
            this.hasBuffActive("Morale") ||
            this.hasDebuffActive("Sadness") ||
            this.hasDebuffActive("Dismorale")
        ) {
            return;
        }

        this.unitProperties.morale -= moraleAmount;
        if (this.unitProperties.morale < -HoCConstants.MORALE_MAX_VALUE_TOTAL) {
            this.unitProperties.morale = -HoCConstants.MORALE_MAX_VALUE_TOTAL;
        }
        this.initialUnitProperties.morale = this.unitProperties.morale;
    }

    public applyMoraleStepsModifier(stepsMoraleMultiplier = 0): void {
        this.unitProperties.steps_morale = Number((stepsMoraleMultiplier * this.getMorale()).toFixed(2));
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

    public calculateAuraEffectMultiplier(auraEffect: AuraEffect): number {
        let calculatedCoeff = 1;

        if (
            auraEffect.getPowerType() === AbilityPowerType.ADDITIONAL_MELEE_DAMAGE_PERCENTAGE ||
            auraEffect.getPowerType() === AbilityPowerType.ADDITIONAL_RANGE_ARMOR_PERCENTAGE ||
            auraEffect.getPowerType() === AbilityPowerType.ABSORB_DEBUFF
        ) {
            calculatedCoeff +=
                (auraEffect.getPower() / 100 / HoCConstants.MAX_UNIT_STACK_POWER) * this.getStackPower() +
                this.getLuck() / 100;
        }

        return calculatedCoeff;
    }

    public calculateEffectMultiplier(effect: Effect): number {
        let calculatedCoeff = 1;
        let combinedPower = effect.getPower() + this.getLuck();
        if (combinedPower < 0) {
            combinedPower = 1;
        }

        calculatedCoeff *= (combinedPower / 100 / HoCConstants.MAX_UNIT_STACK_POWER) * this.getStackPower();

        return calculatedCoeff;
    }

    public calculateAbilityCount(ability: Ability): number {
        if (ability.getPowerType() !== AbilityPowerType.ADDITIONAL_STEPS) {
            return 0;
        }

        return Number(((ability.getPower() / HoCConstants.MAX_UNIT_STACK_POWER) * this.getStackPower()).toFixed(2));
    }

    public calculateAbilityMultiplier(ability: Ability): number {
        let calculatedCoeff = 1;
        if (
            ability.getPowerType() === AbilityPowerType.TOTAL_DAMAGE_PERCENTAGE ||
            ability.getPowerType() === AbilityPowerType.KILL_RANDOM_AMOUNT ||
            ability.getPowerType() === AbilityPowerType.IGNORE_ARMOR ||
            ability.getPowerType() === AbilityPowerType.MAGIC_RESIST_50 ||
            ability.getPowerType() === AbilityPowerType.MAGIC_RESIST_25 ||
            ability.getPowerType() === AbilityPowerType.ABSORB_DEBUFF ||
            ability.getPowerType() === AbilityPowerType.BOOST_HEALTH
        ) {
            let combinedPower = ability.getPower() + this.getLuck();
            if (combinedPower < 0) {
                combinedPower = 1;
            }

            calculatedCoeff *= (combinedPower / 100 / HoCConstants.MAX_UNIT_STACK_POWER) * this.getStackPower();
        } else if (
            ability.getPowerType() === AbilityPowerType.ADDITIONAL_DAMAGE_PERCENTAGE ||
            ability.getPowerType() === AbilityPowerType.ADDITIONAL_MELEE_DAMAGE_PERCENTAGE ||
            ability.getPowerType() === AbilityPowerType.ADDITIONAL_RANGE_ARMOR_PERCENTAGE
        ) {
            calculatedCoeff +=
                (ability.getPower() / 100 / HoCConstants.MAX_UNIT_STACK_POWER) * this.getStackPower() +
                this.getLuck() / 100;
        }

        return calculatedCoeff;
    }

    public calculateMissChance(enemyUnit: Unit): number {
        const combinedMissChances = [];
        const selfBoarSalivaEffect = this.getEffect("Boar Saliva");

        if (selfBoarSalivaEffect) {
            combinedMissChances.push(selfBoarSalivaEffect.getPower() / 100);
        }

        const enemyDodgeAbility = enemyUnit.getAbility("Dodge");
        if (enemyDodgeAbility) {
            const dodgeChance = this.calculateAbilityApplyChance(enemyDodgeAbility) / 100;
            combinedMissChances.push(dodgeChance);
        }

        if (!this.isSmallSize()) {
            const smallSpecieAbility = enemyUnit.getAbility("Small Specie");
            if (smallSpecieAbility) {
                const dodgeChance = this.calculateAbilityApplyChance(smallSpecieAbility) / 100;
                combinedMissChances.push(dodgeChance);
            }
        }

        if (combinedMissChances.length) {
            return Math.floor(HoCMath.winningAtLeastOneEventProbability(combinedMissChances) * 100);
        }

        return 0;
    }

    public calculateAbilityApplyChance(ability: Ability): number {
        const combinedPower = ability.getPower() + this.getLuck();
        if (combinedPower < 0) {
            return 0;
        }
        return (combinedPower / HoCConstants.MAX_UNIT_STACK_POWER) * this.getStackPower();
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
            ((((this.unitProperties.attack_damage_min * this.getAttack() * this.unitProperties.amount_alive) /
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
            ((((this.unitProperties.attack_damage_max * this.getAttack() * this.unitProperties.amount_alive) /
                this.getEnemyArmor(enemyUnit, isRangeAttack)) *
                (1 - enemyUnit.getLuck() / 100)) /
                divisor) *
                this.unitProperties.attack_multiplier *
                abilityMultiplier,
        );
    }

    public calculateAttackDamage(
        enemyUnit: Unit,
        attackType: AttackType,
        divisor = 1,
        abilityMultiplier = 1,
        decreaseNumberOfShots = true,
    ): number {
        const min = this.calculateAttackDamageMin(enemyUnit, attackType === AttackType.RANGE, divisor);
        const max = this.calculateAttackDamageMax(enemyUnit, attackType === AttackType.RANGE, divisor);
        const attackingByMelee = attackType === AttackType.MELEE;
        if (!attackingByMelee && attackType === AttackType.RANGE) {
            if (this.getRangeShots() <= 0) {
                return 0;
            }
            let gotUnlimitedSupplies = false;
            for (const abil of this.getAbilities()) {
                if (abil.getPowerType() === AbilityPowerType.UNLIMITED_SUPPLIES) {
                    gotUnlimitedSupplies = true;
                }
            }
            if (decreaseNumberOfShots && !gotUnlimitedSupplies) {
                this.decreaseNumberOfShots();
            }
        }

        const attackTypeMultiplier =
            attackingByMelee &&
            this.unitProperties.attack_type === AttackType.RANGE &&
            !this.hasAbilityActive("Handyman")
                ? 0.5
                : 1;

        return Math.floor(HoCLib.getRandomInt(min, max) * attackTypeMultiplier * abilityMultiplier);
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
            if (e.getName() === "Stun" || e.getName() === "Blindness") {
                return false;
            }
        }

        for (const a of this.abilities) {
            if (a.getName() === "No Melee" || a.getName() === "Through Shot") {
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
        if (this.selectedAttackType === AttackType.RANGE && this.getRangeShots() <= 0) {
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
            this.getRangeShots() &&
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

    public cleanAuraEffects(): void {
        if (
            this.unitProperties.applied_buffs.length === this.unitProperties.applied_buffs_laps.length &&
            this.unitProperties.applied_buffs.length === this.unitProperties.applied_buffs_descriptions.length &&
            this.unitProperties.applied_buffs.length === this.unitProperties.applied_buffs_powers.length
        ) {
            for (let i = this.unitProperties.applied_buffs.length - 1; i >= 0; i--) {
                if (this.unitProperties.applied_buffs_laps[i] === Number.MAX_SAFE_INTEGER) {
                    this.deleteBuff(this.unitProperties.applied_buffs[i]);
                }
            }
        }

        if (
            this.unitProperties.applied_debuffs.length === this.unitProperties.applied_debuffs_laps.length &&
            this.unitProperties.applied_debuffs.length === this.unitProperties.applied_debuffs_descriptions.length &&
            this.unitProperties.applied_debuffs.length === this.unitProperties.applied_debuffs_powers.length
        ) {
            for (let i = this.unitProperties.applied_debuffs.length - 1; i >= 0; i--) {
                if (this.unitProperties.applied_debuffs_laps[i] === Number.MAX_SAFE_INTEGER) {
                    this.deleteDebuff(this.unitProperties.applied_debuffs[i]);
                }
            }
        }
    }

    public applyAuraEffect(
        auraEffectName: string,
        auraEffectDescription: string,
        isBuff: boolean,
        power: number,
        sourceCellString: string,
    ): void {
        let firstSpellProperty: number | undefined = undefined;
        let secondSpellProperty: number | undefined = undefined;
        const sourceCellStringSplit = sourceCellString.split(";");
        if (sourceCellStringSplit.length === 2) {
            firstSpellProperty = parseInt(sourceCellStringSplit[0]);
            secondSpellProperty = parseInt(sourceCellStringSplit[1]);
        }

        const lapsTotal = Number.MAX_SAFE_INTEGER;
        const applied = new AppliedSpell(auraEffectName, power, lapsTotal, firstSpellProperty, secondSpellProperty);
        if (isBuff) {
            this.deleteBuff(auraEffectName);
            this.buffs.push(applied);
            this.unitProperties.applied_buffs.push(auraEffectName);
            this.unitProperties.applied_buffs_laps.push(lapsTotal);
            this.unitProperties.applied_buffs_descriptions.push(`${auraEffectDescription};${sourceCellString}`);
            this.unitProperties.applied_buffs_powers.push(power);
        } else {
            this.deleteDebuff(auraEffectName);
            this.debuffs.push(applied);
            this.unitProperties.applied_debuffs.push(auraEffectName);
            this.unitProperties.applied_debuffs_laps.push(lapsTotal);
            this.unitProperties.applied_debuffs_descriptions.push(`${auraEffectDescription};${sourceCellString}`);
            this.unitProperties.applied_debuffs_powers.push(power);
        }
    }

    public applyBuff(
        buff: Spell,
        firstBuffProperty?: number,
        secondBuffProperty?: number,
        extend: boolean = false,
    ): void {
        // not checking for duplicates here, do it on a caller side
        const lapsTotal = buff.getLapsTotal() + (extend ? 1 : 0);
        const firstBuffPropertyString = firstBuffProperty === undefined ? "" : firstBuffProperty.toString();
        const secondBuffPropertyString = secondBuffProperty === undefined ? "" : secondBuffProperty.toString();

        this.buffs.push(
            new AppliedSpell(buff.getName(), buff.getPower(), lapsTotal, firstBuffProperty, secondBuffProperty),
        );
        this.unitProperties.applied_buffs.push(buff.getName());
        this.unitProperties.applied_buffs_laps.push(lapsTotal);
        this.unitProperties.applied_buffs_descriptions.push(
            `${buff
                .getDesc()
                .slice(0, buff.getDesc().length - 1)
                .join(" ")};${firstBuffPropertyString};${secondBuffPropertyString}`,
        );
        this.unitProperties.applied_buffs_powers.push(0);
    }

    public applyDebuff(
        debuff: Spell,
        firstDebuffProperty?: number,
        secondDebuffProperty?: number,
        extend: boolean = false,
    ): void {
        // not checking for duplicates here, do it on a caller side
        const lapsTotal = debuff.getLapsTotal() + (extend ? 1 : 0);
        const firstDebuffPropertyString = firstDebuffProperty === undefined ? "" : firstDebuffProperty.toString();
        const secondDebuffPropertyString = secondDebuffProperty === undefined ? "" : secondDebuffProperty.toString();

        this.debuffs.push(
            new AppliedSpell(debuff.getName(), debuff.getPower(), lapsTotal, firstDebuffProperty, secondDebuffProperty),
        );
        this.unitProperties.applied_debuffs.push(debuff.getName());
        this.unitProperties.applied_debuffs_laps.push(lapsTotal);
        this.unitProperties.applied_debuffs_descriptions.push(
            `${debuff
                .getDesc()
                .slice(0, debuff.getDesc().length - 1)
                .join(" ")};${firstDebuffPropertyString};${secondDebuffPropertyString}`,
        );
        this.unitProperties.applied_debuffs_powers.push(0);
    }

    public useSpell(spellName: string): void {
        const spellsUpdated: RenderableSpell[] = [];
        for (const s of this.spells) {
            if (s.getName() === spellName) {
                s.decreaseAmount();
                removeFromArray(this.unitProperties.spells, `${s.getFaction()}:${s.getName()}`);
            }
            if (s.isRemaining()) {
                spellsUpdated.push(s);
            }
        }
        this.spells = spellsUpdated;
    }

    private refreshAbiltyDescription(abilityName: string, abilityDescription: string): void {
        if (
            this.unitProperties.abilities.length === this.unitProperties.abilities_descriptions.length &&
            this.unitProperties.abilities.length === this.unitProperties.abilities_stack_powered.length
        ) {
            for (let i = 0; i < this.unitProperties.abilities.length; i++) {
                if (
                    this.unitProperties.abilities[i] === abilityName &&
                    this.unitProperties.abilities_stack_powered[i]
                ) {
                    this.unitProperties.abilities_descriptions[i] = abilityDescription;
                }
            }
        }
    }

    public adjustBaseStats(currentLap: number) {
        // HP
        const baseStatsDiff = SpellHelper.calculateBuffsDebuffsEffect(this.getBuffs(), this.getDebuffs());
        const hasUnyieldingPower = this.hasAbilityActive("Unyielding Power");

        this.unitProperties.max_hp = this.refreshAndGetAdjustedMaxHp(currentLap) + baseStatsDiff.baseStats.hp;

        if (hasUnyieldingPower && !this.adjustedBaseStatsRounds.includes(currentLap)) {
            this.unitProperties.hp += 5;
        }

        if (this.unitProperties.max_hp < this.unitProperties.hp) {
            this.unitProperties.hp = this.unitProperties.max_hp;
        }

        // LUCK
        if (baseStatsDiff.baseStats.luck === Number.MAX_SAFE_INTEGER) {
            this.unitProperties.luck = HoCConstants.LUCK_MAX_VALUE_TOTAL;
            this.unitProperties.luck_per_turn = 0;
        } else {
            if (this.unitProperties.luck !== this.initialUnitProperties.luck) {
                this.unitProperties.luck = this.initialUnitProperties.luck;
                this.randomizeLuckPerTurn();
            }
        }

        // MORALE
        this.unitProperties.attack_multiplier = 1;
        this.unitProperties.morale = this.initialUnitProperties.morale;
        let lockedMorale = false;
        if (this.hasDebuffActive("Sadness")) {
            if (this.hasBuffActive("Courage")) {
                this.unitProperties.morale = 0;
                lockedMorale = true;
            } else {
                this.unitProperties.morale = -HoCConstants.MORALE_MAX_VALUE_TOTAL;
            }
        }
        if (this.hasBuffActive("Courage")) {
            if (this.hasDebuffActive("Sadness")) {
                this.unitProperties.morale = 0;
                lockedMorale = true;
            } else {
                this.unitProperties.morale = HoCConstants.MORALE_MAX_VALUE_TOTAL;
            }
        }
        if (this.hasBuffActive("Morale")) {
            this.unitProperties.attack_multiplier = 1.25;
            if (!lockedMorale) {
                this.unitProperties.morale = HoCConstants.MORALE_MAX_VALUE_TOTAL;
            }
        } else if (this.hasDebuffActive("Dismorale")) {
            this.unitProperties.attack_multiplier = 0.8;
            if (!lockedMorale) {
                this.unitProperties.morale = -HoCConstants.MORALE_MAX_VALUE_TOTAL;
            }
        }

        // ARMOR
        this.unitProperties.base_armor = Number(
            (this.initialUnitProperties.base_armor + baseStatsDiff.baseStats.armor).toFixed(2),
        );

        const leatherArmorAbility = this.getAbility("Leather Armor");
        let rangeArmorMultiplier = leatherArmorAbility ? leatherArmorAbility.getPower() / 100 : 1;

        const arrowsWingshieldAura = this.getAppliedAuraEffect("Arrows Wingshield Aura");
        if (arrowsWingshieldAura) {
            rangeArmorMultiplier = rangeArmorMultiplier * (1 + arrowsWingshieldAura.getPower() / 100);
        }

        // MDEF
        this.unitProperties.magic_resist = this.initialUnitProperties.magic_resist;
        const enchantedSkinAbility = this.getAbility("Enchanted Skin");
        if (enchantedSkinAbility) {
            this.unitProperties.magic_resist_mod = enchantedSkinAbility.getPower();
        } else {
            const magicResists: number[] = [this.getMagicResist() / 100];
            const magicShieldAbility = this.getAbility("Magic Shield");
            if (magicShieldAbility) {
                magicResists.push(this.calculateAbilityMultiplier(magicShieldAbility));
            }

            const wardguardAbility = this.getAbility("Wardguard");
            if (wardguardAbility) {
                magicResists.push(this.calculateAbilityMultiplier(wardguardAbility));
            }

            this.unitProperties.magic_resist = Number(
                (HoCMath.winningAtLeastOneEventProbability(magicResists) * 100).toFixed(2),
            );
        }

        // SHOTS
        this.adjustRangeShotsNumber(true);
        const endlessQuiverAbility = this.getAbility("Endless Quiver");
        if (endlessQuiverAbility) {
            this.unitProperties.range_shots_mod = endlessQuiverAbility.getPower();
        }

        // STEPS
        const skyRunnerAbility = this.getAbility("Sky Runner");
        this.unitProperties.steps = this.initialUnitProperties.steps;
        if (skyRunnerAbility) {
            this.unitProperties.steps += this.calculateAbilityCount(skyRunnerAbility);
        }
        const quagmireDebuff = this.getDebuff("Quagmire");
        let stepsMultiplier = 1;
        if (quagmireDebuff) {
            stepsMultiplier = (100 - quagmireDebuff.getPower()) / 100;
        }
        this.unitProperties.steps = Number((this.unitProperties.steps * stepsMultiplier).toFixed(2));

        // ATTACK
        if (hasUnyieldingPower && !this.adjustedBaseStatsRounds.includes(currentLap)) {
            this.initialUnitProperties.base_attack += 2;
        }
        this.unitProperties.base_attack = this.initialUnitProperties.base_attack;

        let baseAttackMultiplier = 1;
        const sharpenedWeaponsAura = this.getAppliedAuraEffect("Sharpened Weapons Aura");

        if (sharpenedWeaponsAura) {
            baseAttackMultiplier = baseAttackMultiplier * (1 + sharpenedWeaponsAura.getPower() / 100);
        }

        const weaknessDebuff = this.getDebuff("Weakness");
        if (weaknessDebuff) {
            baseAttackMultiplier = baseAttackMultiplier * ((100 - weaknessDebuff.getPower()) / 100);
        }

        if (this.hasBuffActive("Riot")) {
            const spell = new Spell({
                spellProperties: HoCConfig.getSpellConfig(FactionType.CHAOS, "Riot"),
                amount: 1,
            });
            this.unitProperties.attack_mod = Number(
                ((this.unitProperties.base_attack * spell.getPower()) / 100).toFixed(2),
            );
        } else if (this.hasBuffActive("Mass Riot")) {
            const spell = new Spell({
                spellProperties: HoCConfig.getSpellConfig(FactionType.CHAOS, "Mass Riot"),
                amount: 1,
            });
            this.unitProperties.attack_mod = Number(
                ((this.unitProperties.base_attack * spell.getPower()) / 100).toFixed(2),
            );
        } else {
            this.unitProperties.attack_mod = this.initialUnitProperties.attack_mod;
        }

        this.unitProperties.base_attack = Number((this.unitProperties.base_attack * baseAttackMultiplier).toFixed(2));

        // BUFFS & DEBUFFS
        const weakeningBeamDebuff = this.getDebuff("Weakening Beam");
        let baseArmorMultiplier = 1;
        if (weakeningBeamDebuff) {
            baseArmorMultiplier = (100 - weakeningBeamDebuff.getPower()) / 100;
        }

        this.adjustedBaseStatsRounds.push(currentLap);

        // ABILITIES DESCRIPTIONS
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

            baseArmorMultiplier =
                baseArmorMultiplier *
                (1 +
                    ((heavyArmorAbility.getPower() + this.getLuck()) / 100 / HoCConstants.MAX_UNIT_STACK_POWER) *
                        this.getStackPower());
        }

        this.unitProperties.base_armor = Number((this.unitProperties.base_armor * baseArmorMultiplier).toFixed(2));
        this.unitProperties.range_armor = Number((this.unitProperties.base_armor * rangeArmorMultiplier).toFixed(2));

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
            const percentage =
                Number((this.calculateAbilityMultiplier(sharpenedWeaponsAuraAbility) * 100).toFixed(2)) - 100;
            this.refreshAbiltyDescription(
                sharpenedWeaponsAuraAbility.getName(),
                sharpenedWeaponsAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
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
    }

    public adjustRangeShotsNumber(force: boolean) {
        if (!force && !this.hasAbilityActive("Limited Supply")) {
            return;
        }

        const actualStackPowerCoeff = this.getStackPower() / HoCConstants.MAX_UNIT_STACK_POWER;
        this.unitProperties.range_shots = Math.min(
            this.unitProperties.range_shots,
            Math.floor(this.maxRangeShots * actualStackPowerCoeff),
        );
    }

    public setRangeShotDistance(distance: number) {
        this.unitProperties.shot_distance = distance;
    }

    public setStackPower(stackPower: number): void {
        this.unitProperties.stack_power = stackPower;
    }

    protected getEnemyArmor(enemyUnit: Unit, isRangeAttack: boolean): number {
        const piercingSpearAbility = this.getAbility("Piercing Spear");
        const armor = isRangeAttack ? enemyUnit.getRangeArmor() : enemyUnit.getArmor();
        if (piercingSpearAbility) {
            return armor * (1 - this.calculateAbilityMultiplier(piercingSpearAbility));
        }

        return armor;
    }

    protected refreshAndGetAdjustedMaxHp(currentLap: number): number {
        const hasUnyieldingPower = this.hasAbilityActive("Unyielding Power");
        if (hasUnyieldingPower) {
            this.unitProperties.max_hp = this.initialUnitProperties.max_hp + currentLap * 5;
        } else {
            this.unitProperties.max_hp = this.initialUnitProperties.max_hp;
        }

        const boostHealthAbility = this.getAbility("Boost Health");
        if (boostHealthAbility) {
            const multiplier = this.calculateAbilityMultiplier(boostHealthAbility);

            let adjustActualHp = false;
            if (this.unitProperties.hp === this.unitProperties.max_hp) {
                adjustActualHp = true;
            }

            this.unitProperties.max_hp = Math.round(
                this.unitProperties.max_hp + this.unitProperties.max_hp * multiplier,
            );
            if (adjustActualHp) {
                this.unitProperties.hp = this.unitProperties.max_hp;
            }
            return this.unitProperties.max_hp;
        }

        return this.unitProperties.max_hp;
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
