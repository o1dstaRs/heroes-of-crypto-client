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
    MovementType,
    SpellHelper,
    IWeightedRoute,
    GridMath,
    Spell,
    GridSettings,
    UnitProperties,
    HoCLib,
    HoCMath,
    TeamType,
    UnitType,
    HoCScene,
} from "@heroesofcrypto/common";
import Denque from "denque";

export interface IAttackTargets {
    unitIds: Set<string>;
    attackCells: HoCMath.XY[];
    attackCellHashes: Set<number>;
    attackCellHashesToLargeCells: Map<number, HoCMath.XY[]>;
}

export interface IUnitDistance {
    unit: Unit;
    distance: number;
}

export interface IUnitPropertiesProvider {
    getName(): string;

    getHp(): number;

    getMaxHp(): number;

    getSteps(): number;

    getMorale(): number;

    getLuck(): number;

    getSpeed(): number;

    getFaction(): FactionType;

    getBaseArmor(): number;

    getBaseAttack(): number;

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

    getMovementType(): MovementType;

    canFly(): boolean;

    getExp(): number;

    getSize(): number;

    getAmountAlive(): number;

    getAmountDied(): number;

    getStackPower(): number;

    getTeam(): TeamType;

    getUnitType(): UnitType;

    getSmallTextureName(): string;

    getLargeTextureName(): string;

    getAuraRanges(): number[];

    getAuraIsBuff(): boolean[];
}

export interface IUnitAIRepr {
    getId(): string;
    getTeam(): TeamType;
    getSteps(): number;
    getSpeed(): number;
    getSize(): number;
    canFly(): boolean;
    isSmallSize(): boolean;
    getBaseCell(): HoCMath.XY | undefined;
    getCells(): HoCMath.XY[];
    getAttackType(): AttackType;
}

interface IDamageable {
    applyDamage(minusHp: number, currentTick: number): void;

    calculatePossibleLosses(minusHp: number): number;

    isDead(): boolean;
}

interface IDamager {
    calculateAttackDamageMin(
        attackRate: number,
        enemyUnit: Unit,
        isRangeAttack: boolean,
        divisor: number,
        abilityMultiplier: number,
    ): number;

    calculateAttackDamageMax(
        attackRate: number,
        enemyUnit: Unit,
        isRangeAttack: boolean,
        divisor: number,
        abilityMultiplier: number,
    ): number;

    calculateAttackDamage(enemyUnit: Unit, attackType: AttackType, divisor: number, abilityMultiplier: number): number;

    getAttackTypeSelection(): AttackType;

    selectAttackType(selectedAttackType: AttackType): boolean;
}

export class Unit implements IUnitPropertiesProvider, IDamageable, IDamager, IUnitAIRepr {
    protected readonly unitProperties: UnitProperties;

    protected readonly initialUnitProperties: UnitProperties;

    protected readonly gridSettings: GridSettings;

    protected readonly teamType: TeamType;

    protected readonly unitType: UnitType;

    protected readonly summoned: boolean;

    protected buffs: AppliedSpell[];

    protected debuffs: AppliedSpell[];

    protected readonly position: HoCMath.XY;

    protected renderPosition: HoCMath.XY;

    protected spells: Spell[];

    protected effects: Effect[];

    protected abilities: Ability[] = [];

    protected readonly auraEffects: AuraEffect[] = [];

    protected readonly effectFactory: EffectFactory;

    protected readonly abilityFactory: AbilityFactory;

    protected selectedAttackType: AttackType;

    protected possibleAttackTypes: AttackType[] = [];

    protected maxRangeShots = 0;

    protected responded = false;

    protected onHourglass = false;

    protected lastKnownTick = 0;

    protected currentAttackModIncrease = 0;

    protected adjustedBaseStatsLaps: number[] = [];

    protected constructor(
        unitProperties: UnitProperties,
        gridSettings: GridSettings,
        teamType: TeamType,
        unitType: UnitType,
        abilityFactory: AbilityFactory,
        effectFactory: EffectFactory,
        summoned: boolean,
    ) {
        this.unitProperties = unitProperties;
        this.initialUnitProperties = structuredClone(unitProperties);
        this.gridSettings = gridSettings;
        this.teamType = teamType;
        this.unitType = unitType;
        this.effectFactory = effectFactory;
        this.summoned = summoned;

        if (this.unitProperties.attack_type === AttackType.MELEE) {
            this.selectedAttackType = AttackType.MELEE;
        } else if (this.unitProperties.attack_type === AttackType.MELEE_MAGIC) {
            this.selectedAttackType = AttackType.MELEE_MAGIC;
        } else if (this.unitProperties.attack_type === AttackType.RANGE) {
            this.selectedAttackType = AttackType.RANGE;
        } else {
            this.selectedAttackType = AttackType.MAGIC;
        }

        this.renderPosition = { x: 0, y: 0 };
        this.position = { x: 0, y: 0 };
        this.spells = [];
        this.buffs = [];
        this.debuffs = [];
        this.maxRangeShots = this.unitProperties.range_shots;
        this.abilityFactory = abilityFactory;
        this.parseAbilities();
        this.effects = [];
        this.parseAuraEffects();
    }

    public static createUnit(
        unitProperties: UnitProperties,
        gridSettings: GridSettings,
        teamType: TeamType,
        unitType: UnitType,
        abilityFactory: AbilityFactory,
        effectFactory: EffectFactory,
        summoned: boolean,
    ): Unit {
        const unit = new Unit(
            unitProperties,
            gridSettings,
            teamType,
            unitType,
            abilityFactory,
            effectFactory,
            summoned,
        );
        unit.parseSpells();
        return unit;
    }

    public getSpells(): Spell[] {
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

    public deleteAbility(abilityName: string): Ability | undefined {
        let abilityToDelete: Ability | undefined = undefined;
        const updatedAbilities: Ability[] = [];
        for (const a of this.abilities) {
            if (a.getName() === abilityName) {
                abilityToDelete = a;
            } else {
                updatedAbilities.push(a);
            }
        }
        this.abilities = updatedAbilities;

        for (let i = this.unitProperties.abilities.length - 1; i >= 0; i--) {
            if (this.unitProperties.abilities[i] === abilityName) {
                this.unitProperties.abilities.splice(i, 1);
                this.unitProperties.abilities_descriptions.splice(i, 1);
                this.unitProperties.abilities_stack_powered.splice(i, 1);
                this.unitProperties.abilities_auras.splice(i, 1);
            }
        }

        const spellName = abilityName.substring(1, abilityName.length);
        this.spells = this.spells.filter((s: Spell) => s.getName() !== spellName);
        for (let i = this.unitProperties.spells.length - 1; i >= 0; i--) {
            if (this.unitProperties.spells[i] === spellName) {
                this.unitProperties.spells.splice(i, 1);
            }
        }
        if (!this.unitProperties.spells.length) {
            this.unitProperties.can_cast_spells = false;
        }

        return abilityToDelete;
    }

    public addAbility(ability: Ability): void {
        this.unitProperties.abilities.push(ability.getName());
        if (ability.getName() === "Chain Lightning") {
            const percentage = Number((this.calculateAbilityMultiplier(ability) * 100).toFixed(2));
            const description = ability.getDesc().join("\n");
            const updatedDescription = description
                .replace("{}", Number(percentage.toFixed()).toString())
                .replace("{}", Number(((percentage * 7) / 8).toFixed()).toString())
                .replace("{}", Number(((percentage * 6) / 8).toFixed()).toString())
                .replace("{}", Number(((percentage * 5) / 8).toFixed()).toString());
            this.unitProperties.abilities_descriptions.push(updatedDescription);
        }
        if (ability.getName() === "Paralysis") {
            const description = ability.getDesc().join("\n");
            const reduction = this.calculateAbilityApplyChance(ability);
            const chance = Math.min(100, reduction * 2);
            const updatedDescription = description
                .replace("{}", Number(chance.toFixed(2)).toString())
                .replace("{}", Number(reduction.toFixed(2)).toString());
            this.unitProperties.abilities_descriptions.push(updatedDescription);
        } else {
            this.unitProperties.abilities_descriptions.push(
                ability.getDesc().join("\n").replace(/\{\}/g, ability.getPower().toString()),
            );
        }
        this.unitProperties.abilities_stack_powered.push(ability.isStackPowered());
        this.unitProperties.abilities_auras.push(!!ability.getAuraEffect());
        if (this.parseAbilities()) {
            this.parseSpells();
        }
    }

    public getTarget(): string {
        return this.unitProperties.target;
    }

    public setTarget(targetUnitId: string): void {
        this.unitProperties.target = targetUnitId;
    }

    public resetTarget(): void {
        this.unitProperties.target = this.initialUnitProperties.target;
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

    public refreshPreTurnState(sceneLog: HoCScene.SceneLog) {
        if (this.unitProperties.hp !== this.unitProperties.max_hp && this.hasAbilityActive("Wild Regeneration")) {
            const healedHp = this.unitProperties.max_hp - this.unitProperties.hp;
            this.unitProperties.hp = this.unitProperties.max_hp;
            sceneLog.updateLog(`${this.getName()} auto regenerated to its maximum hp (+${healedHp})`);
        }
    }

    public deleteEffect(effectName: string): void {
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

    public deleteAllEffects(): void {
        this.effects = [];

        if (
            this.unitProperties.applied_effects.length === this.unitProperties.applied_effects_laps.length &&
            this.unitProperties.applied_effects.length === this.unitProperties.applied_effects_descriptions.length &&
            this.unitProperties.applied_effects.length === this.unitProperties.applied_effects_powers.length
        ) {
            for (let i = this.unitProperties.applied_effects.length - 1; i >= 0; i--) {
                this.unitProperties.applied_effects.splice(i, 1);
                this.unitProperties.applied_effects_laps.splice(i, 1);
                this.unitProperties.applied_effects_descriptions.splice(i, 1);
                this.unitProperties.applied_effects_powers.splice(i, 1);
            }
        }
    }

    public deleteBuff(buffName: string): void {
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

    public deleteAllBuffs(): void {
        this.buffs = [];

        if (
            this.unitProperties.applied_buffs.length === this.unitProperties.applied_buffs_laps.length &&
            this.unitProperties.applied_buffs.length == this.unitProperties.applied_buffs_descriptions.length &&
            this.unitProperties.applied_buffs.length == this.unitProperties.applied_buffs_powers.length
        ) {
            for (let i = this.unitProperties.applied_buffs.length - 1; i >= 0; i--) {
                this.unitProperties.applied_buffs.splice(i, 1);
                this.unitProperties.applied_buffs_laps.splice(i, 1);
                this.unitProperties.applied_buffs_descriptions.splice(i, 1);
                this.unitProperties.applied_buffs_powers.splice(i, 1);
            }
        }
    }

    public deleteDebuff(debuffName: string): void {
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

    public deleteAllDebuffs(): void {
        this.debuffs = [];

        if (
            this.unitProperties.applied_debuffs.length === this.unitProperties.applied_debuffs_laps.length &&
            this.unitProperties.applied_debuffs.length == this.unitProperties.applied_debuffs_descriptions.length &&
            this.unitProperties.applied_debuffs.length == this.unitProperties.applied_debuffs_powers.length
        ) {
            for (let i = this.unitProperties.applied_debuffs.length - 1; i >= 0; i--) {
                this.unitProperties.applied_debuffs.splice(i, 1);
                this.unitProperties.applied_debuffs_laps.splice(i, 1);
                this.unitProperties.applied_debuffs_descriptions.splice(i, 1);
                this.unitProperties.applied_debuffs_powers.splice(i, 1);
            }
        }
    }

    public minusLap(): void {
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
                                this.unitProperties.applied_effects_laps[i] !== Number.MAX_SAFE_INTEGER &&
                                this.unitProperties.applied_effects_laps[i] !== HoCConstants.NUMBER_OF_LAPS_TOTAL
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
                                this.unitProperties.applied_buffs_laps[i] !== Number.MAX_SAFE_INTEGER &&
                                this.unitProperties.applied_buffs_laps[i] !== HoCConstants.NUMBER_OF_LAPS_TOTAL
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
                                this.unitProperties.applied_debuffs_laps[i] !== Number.MAX_SAFE_INTEGER &&
                                this.unitProperties.applied_debuffs_laps[i] !== HoCConstants.NUMBER_OF_LAPS_TOTAL
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
        if (this.hasAbilityActive("Madness") || this.hasAbilityActive("Mechanism")) {
            return 0;
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

    public getBaseArmor(): number {
        return this.unitProperties.base_armor;
    }

    public getBaseAttack(): number {
        return this.unitProperties.base_attack;
    }

    public getArmor(): number {
        return Math.max(1, this.unitProperties.base_armor + this.unitProperties.armor_mod);
    }

    public getRangeArmor(): number {
        return Math.max(1, this.unitProperties.range_armor + this.unitProperties.armor_mod);
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

    public getMovementType(): MovementType {
        return this.unitProperties.movement_type;
    }

    public canFly(): boolean {
        return this.unitProperties.movement_type === MovementType.FLY;
    }

    public getExp(): number {
        return this.unitProperties.exp;
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

    public getAuraRanges(): number[] {
        return this.unitProperties.aura_ranges;
    }

    public getAuraIsBuff(): boolean[] {
        return this.unitProperties.aura_is_buff;
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

    public setPosition(x: number, y: number, setRender = true) {
        if (this.hasAbilityActive("Sniper")) {
            this.setRangeShotDistance(
                Number((this.getDistanceToFurthestCorner(this.getPosition()) / this.gridSettings.getStep()).toFixed(2)),
            );
        }
        this.position.x = x;
        this.position.y = y;

        if (setRender) {
            this.setRenderPosition(x, y);
        }
    }

    public setRenderPosition(x: number, y: number) {
        this.renderPosition.x = x;
        this.renderPosition.y = y;
    }

    public getPosition(): HoCMath.XY {
        return this.position;
    }

    public getBaseCell(): HoCMath.XY {
        return GridMath.getCellForPosition(this.gridSettings, this.getPosition());
    }

    public getCells(): HoCMath.XY[] {
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

    public canMove(): boolean {
        return !this.hasEffectActive("Paralysis");
    }

    public increaseAmountAlive(increaseBy: number): void {
        if ((!this.isDead() && this.isSummoned()) || (this.isDead() && !this.isSummoned())) {
            this.unitProperties.amount_alive += increaseBy;
        }
    }

    public increaseAttackMod(increaseBy: number): void {
        if (increaseBy > 0) {
            this.unitProperties.attack_mod = Number((this.unitProperties.attack_mod + increaseBy).toFixed(2));
            this.currentAttackModIncrease = increaseBy;
        } else {
            this.currentAttackModIncrease = 0;
        }
    }

    public cleanupAttackModIncrease(): void {
        const newAttackMod = this.unitProperties.attack_mod - this.currentAttackModIncrease;
        this.unitProperties.attack_mod = Math.max(0, newAttackMod);
    }

    public getCurrentAttackModIncrease(): number {
        return this.currentAttackModIncrease;
    }

    public decreaseAmountDied(decreaseBy: number): void {
        if (!this.isDead() && !this.isSummoned()) {
            this.unitProperties.amount_died -= Math.min(this.unitProperties.amount_died, decreaseBy);
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

    public applyArmageddonDamage(armageddonWave: number, sceneLog: HoCScene.SceneLog): void {
        const aw = Math.floor(armageddonWave);
        if (aw <= 0 || aw > HoCConstants.NUMBER_OF_ARMAGEDDON_WAVES) {
            return;
        }

        const canHitPartially = aw === 1;
        const part = aw / HoCConstants.NUMBER_OF_ARMAGEDDON_WAVES;
        let armageddonDamage = 0;
        const unitsTotal = this.unitProperties.amount_died + this.unitProperties.amount_alive;

        if (canHitPartially) {
            armageddonDamage = Math.floor(this.unitProperties.max_hp * unitsTotal * part);
        } else {
            const unitsDamaged = Math.ceil(unitsTotal * part);
            armageddonDamage = unitsDamaged * this.unitProperties.max_hp;
        }

        sceneLog.updateLog(`${this.getName()} got hit by armageddon for ${armageddonDamage} damage`);
        this.applyDamage(armageddonDamage);
    }

    public applyDamage(minusHp: number): void {
        if (minusHp < this.unitProperties.hp) {
            this.unitProperties.hp -= minusHp;
            this.handleDamageAnimation(0); // Trigger animation hook with no deaths
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
            this.handleDamageAnimation(this.unitProperties.amount_alive); // Trigger animation hook with all deaths
            return;
        }

        this.unitProperties.amount_died += amountDied;
        this.unitProperties.amount_alive -= amountDied;
        this.unitProperties.hp -= minusHp % this.unitProperties.max_hp;

        this.handleDamageAnimation(amountDied + 1); // Trigger animation hook with the number of deaths

        // Apply "Bitter Experience" if available
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
            this.hasAbilityActive("Madness") ||
            this.hasAbilityActive("Mechanism") ||
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

    public decreaseBaseArmor(armorAmount: number): void {
        this.initialUnitProperties.base_armor = Math.max(
            1,
            Number((this.initialUnitProperties.base_armor - armorAmount).toFixed(2)),
        );
    }

    public increaseBaseArmor(armorAmount: number): void {
        this.initialUnitProperties.base_armor = Number(
            (this.initialUnitProperties.base_armor + armorAmount).toFixed(2),
        );
    }

    public decreaseMorale(moraleAmount: number): void {
        if (
            this.hasAbilityActive("Madness") ||
            this.hasAbilityActive("Mechanism") ||
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

    public calculateAuraPower(auraEffect: AuraEffect): number {
        let calculatedCoeff = 1;

        if (auraEffect.getPowerType() === AbilityPowerType.ADDITIONAL_STEPS_WALK) {
            return auraEffect.getPower();
        }

        if (auraEffect.getPowerType() === AbilityPowerType.ADDITIONAL_BASE_ATTACK_AND_ARMOR) {
            return auraEffect.getPower();
        }

        if (
            auraEffect.getPowerType() === AbilityPowerType.ADDITIONAL_MELEE_DAMAGE_PERCENTAGE ||
            auraEffect.getPowerType() === AbilityPowerType.ADDITIONAL_RANGE_ARMOR_PERCENTAGE ||
            auraEffect.getPowerType() === AbilityPowerType.ABSORB_DEBUFF
        ) {
            calculatedCoeff +=
                (auraEffect.getPower() / 100 / HoCConstants.MAX_UNIT_STACK_POWER) * this.getStackPower() +
                this.getLuck() / 100;
        }

        if (auraEffect.getPowerType() === AbilityPowerType.ADDITIONAL_STEPS) {
            return Number(
                (
                    (auraEffect.getPower() / HoCConstants.MAX_UNIT_STACK_POWER) * this.getStackPower() +
                    (this.getLuck() / 100) * auraEffect.getPower()
                ).toFixed(1),
            );
        }

        return Number((calculatedCoeff * 100).toFixed(2)) - 100;
    }

    public calculateEffectMultiplier(effect: Effect): number {
        let calculatedCoeff = 1;
        let combinedPower = effect.getPower() + this.getLuck();
        if (combinedPower < 0) {
            combinedPower = 1;
        }

        if (effect.getName() === "Pegasus Light") {
            return combinedPower;
        }

        calculatedCoeff *= (combinedPower / 100 / HoCConstants.MAX_UNIT_STACK_POWER) * this.getStackPower();

        return calculatedCoeff;
    }

    public hasMindAttackResistance(): boolean {
        return this.hasAbilityActive("Madness") || this.hasAbilityActive("Mechanism");
    }

    public canBeHealed(): boolean {
        return !this.hasAbilityActive("Mechanism");
    }

    public calculateAbilityCount(ability: Ability): number {
        if (
            ability.getPowerType() !== AbilityPowerType.ADDITIONAL_STEPS &&
            ability.getPowerType() !== AbilityPowerType.STEAL_ARMOR_ON_HIT &&
            ability.getName() !== "Shatter Armor" &&
            ability.getName() !== "Deep Wounds Level 1" &&
            ability.getName() !== "Deep Wounds Level 2" &&
            ability.getName() !== "Deep Wounds Level 3"
        ) {
            return 0;
        }

        return Number(
            (
                (ability.getPower() / HoCConstants.MAX_UNIT_STACK_POWER) * this.getStackPower() +
                (this.getLuck() / 100) * ability.getPower()
            ).toFixed(1),
        );
    }

    public calculateAbilityMultiplier(ability: Ability): number {
        let calculatedCoeff = 1;
        if (
            ability.getPowerType() === AbilityPowerType.TOTAL_DAMAGE_PERCENTAGE ||
            ability.getPowerType() === AbilityPowerType.MAGIC_DAMAGE ||
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
        attackRate: number,
        enemyUnit: Unit,
        isRangeAttack: boolean,
        divisor = 1,
        abilityMultiplier = 1,
    ): number {
        if (divisor <= 0) {
            divisor = 1;
        }

        return Math.ceil(
            ((((this.unitProperties.attack_damage_min * attackRate * this.unitProperties.amount_alive) /
                this.getEnemyArmor(enemyUnit, isRangeAttack)) *
                (1 - enemyUnit.getLuck() / 100)) /
                divisor) *
                this.unitProperties.attack_multiplier *
                abilityMultiplier,
        );
    }

    public calculateAttackDamageMax(
        attackRate: number,
        enemyUnit: Unit,
        isRangeAttack: boolean,
        divisor = 1,
        abilityMultiplier = 1,
    ): number {
        if (divisor <= 0) {
            divisor = 1;
        }
        return Math.ceil(
            ((((this.unitProperties.attack_damage_max * attackRate * this.unitProperties.amount_alive) /
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
        const min = this.calculateAttackDamageMin(
            this.getAttack(),
            enemyUnit,
            attackType === AttackType.RANGE,
            divisor,
        );
        const max = this.calculateAttackDamageMax(
            this.getAttack(),
            enemyUnit,
            attackType === AttackType.RANGE,
            divisor,
        );
        const attackingByMelee = attackType === AttackType.MELEE || attackType === AttackType.MELEE_MAGIC;
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

    public canRespond(attackType: AttackType): boolean {
        for (const e of this.effects) {
            if (e.getName() === "Stun" || e.getName() === "Blindness") {
                return false;
            }
        }

        for (const a of this.abilities) {
            if (
                (a.getName() === "No Melee" &&
                    (attackType === AttackType.MELEE || attackType === AttackType.MELEE_MAGIC)) ||
                (a.getName() === "Through Shot" && attackType === AttackType.RANGE)
            ) {
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

    public refreshPossibleAttackTypes(canLandRangeAttack: boolean) {
        this.possibleAttackTypes = [];
        if (this.getAttackType() === AttackType.MAGIC && this.getSpellsCount() > 0 && this.getCanCastSpells()) {
            this.possibleAttackTypes.push(AttackType.MAGIC);
        } else if (this.getAttackType() === AttackType.RANGE && this.getRangeShots() > 0 && canLandRangeAttack) {
            this.possibleAttackTypes.push(AttackType.RANGE);
        }

        if (!this.hasAbilityActive("No Melee")) {
            if (this.getAttackType() === AttackType.MELEE_MAGIC) {
                this.possibleAttackTypes.push(AttackType.MELEE_MAGIC);
            } else {
                this.possibleAttackTypes.push(AttackType.MELEE);
            }
        }

        if (
            this.getSpellsCount() > 0 &&
            this.getCanCastSpells() &&
            !this.possibleAttackTypes.includes(AttackType.MAGIC)
        ) {
            this.possibleAttackTypes.push(AttackType.MAGIC);
        }

        if (!this.possibleAttackTypes.length) {
            this.possibleAttackTypes.push(AttackType.NO_TYPE);
        }

        this.unitProperties.attack_type_selected = this.possibleAttackTypes[0];
        this.selectedAttackType = this.possibleAttackTypes[0];
    }

    public getAttackTypeSelection(): AttackType {
        return this.selectedAttackType;
    }

    public getPossibleAttackTypes(): AttackType[] {
        return this.possibleAttackTypes;
    }

    public getAttackTypeSelectionIndex(): [number, number] {
        return [this.possibleAttackTypes.indexOf(this.selectedAttackType), this.possibleAttackTypes.length];
    }

    public selectNextAttackType(): boolean {
        let index = this.possibleAttackTypes.indexOf(this.selectedAttackType);
        let initialIndex = index;
        do {
            index = (index + 1) % this.possibleAttackTypes.length;
            if (this.selectAttackType(this.possibleAttackTypes[index])) {
                return true;
            }
        } while (index !== initialIndex);
        return false;
    }

    public selectAttackType(selectedAttackType: AttackType): boolean {
        if (
            this.selectedAttackType !== selectedAttackType &&
            ((selectedAttackType === AttackType.MELEE && this.possibleAttackTypes.includes(AttackType.MELEE)) ||
                (selectedAttackType === AttackType.MELEE_MAGIC &&
                    this.possibleAttackTypes.includes(AttackType.MELEE_MAGIC)))
        ) {
            if (this.possibleAttackTypes.includes(AttackType.MELEE_MAGIC)) {
                this.selectedAttackType = AttackType.MELEE_MAGIC;
                this.unitProperties.attack_type_selected = AttackType.MELEE_MAGIC;
            } else {
                this.selectedAttackType = AttackType.MELEE;
                this.unitProperties.attack_type_selected = AttackType.MELEE;
            }

            return true;
        }

        if (
            selectedAttackType === AttackType.RANGE &&
            this.unitProperties.attack_type === AttackType.RANGE &&
            this.getRangeShots() &&
            this.selectedAttackType !== selectedAttackType &&
            this.possibleAttackTypes.includes(AttackType.RANGE)
        ) {
            this.selectedAttackType = selectedAttackType;
            this.unitProperties.attack_type_selected = AttackType.RANGE;
            return true;
        }

        if (
            selectedAttackType === AttackType.MAGIC &&
            this.unitProperties.spells.length &&
            this.unitProperties.can_cast_spells &&
            this.selectedAttackType !== selectedAttackType &&
            this.possibleAttackTypes.includes(AttackType.MAGIC)
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

    public getBuffProperties(buffName: string): [string, string] {
        const buffProperties: [string, string] = ["", ""];
        for (let i = 0; i < this.unitProperties.applied_buffs_descriptions.length; i++) {
            const description = this.unitProperties.applied_buffs_descriptions[i];
            const splitDescription = description.split(";");
            if (splitDescription.length === 3 && buffName === this.unitProperties.applied_buffs[i]) {
                buffProperties[0] = splitDescription[1];
                buffProperties[1] = splitDescription[2];
                break;
            }
        }

        return buffProperties;
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
        const spellsUpdated: Spell[] = [];
        for (const s of this.spells) {
            if (s.getName() === spellName) {
                s.decreaseAmount();
                const fullSpellName = `${s.getFaction()}:${s.getName()}`;
                for (let i = this.unitProperties.spells.length - 1; i >= 0; i--) {
                    if (this.unitProperties.spells[i] === fullSpellName) {
                        this.unitProperties.spells.splice(i, 1);
                    }
                }
            }
            if (s.isRemaining()) {
                spellsUpdated.push(s);
            }
        }
        this.spells = spellsUpdated;
    }

    public getAllProperties(): UnitProperties {
        return structuredClone(this.unitProperties);
    }

    public applyHeal(healPower: number): number {
        if (healPower < 0) {
            return 0;
        }

        let healedFor = Math.floor(healPower);
        const wasHp = this.unitProperties.hp;
        this.unitProperties.hp += healedFor;
        if (this.unitProperties.hp > this.unitProperties.max_hp) {
            healedFor = this.unitProperties.max_hp - wasHp;
            this.unitProperties.hp = this.unitProperties.max_hp;
        }

        return healedFor;
    }

    public adjustBaseStats(currentLap: number) {
        // target
        if (!this.hasEffectActive("Aggr")) {
            this.resetTarget();
        }

        // HP
        const baseStatsDiff = SpellHelper.calculateBuffsDebuffsEffect(this.getBuffs(), this.getDebuffs());
        const hasUnyieldingPower = this.hasAbilityActive("Unyielding Power");

        this.unitProperties.max_hp = this.refreshAndGetAdjustedMaxHp(currentLap) + baseStatsDiff.baseStats.hp;

        if (hasUnyieldingPower && !this.adjustedBaseStatsLaps.includes(currentLap)) {
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
            }
            if (!this.adjustedBaseStatsLaps.includes(currentLap)) {
                this.randomizeLuckPerTurn();
            }
        }

        // MORALE
        this.unitProperties.attack_multiplier = 1;
        this.unitProperties.morale = this.initialUnitProperties.morale;
        if (this.hasAbilityActive("Madness") || this.hasAbilityActive("Mechanism")) {
            this.unitProperties.morale = 0;
        } else {
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
        }

        // ARMOR
        const pegasusMightAura = this.getAppliedAuraEffect("Pegasus Might Aura");
        this.unitProperties.base_armor = Number(
            (this.initialUnitProperties.base_armor + baseStatsDiff.baseStats.armor).toFixed(2),
        );
        if (pegasusMightAura) {
            this.unitProperties.base_armor += pegasusMightAura.getPower();
        }
        const windFlowBuff = this.getBuff("Wind Flow");
        if (windFlowBuff) {
            this.unitProperties.base_armor += windFlowBuff.getPower();
        }
        const armorAugmentBuff = this.getBuff("Armor Augment");
        if (armorAugmentBuff) {
            this.unitProperties.base_armor += Number(
                ((this.unitProperties.base_armor / 100) * armorAugmentBuff.getPower()).toFixed(2),
            );
        }
        // mod
        const shatterArmorEffect = this.getEffect("Shatter Armor");
        if (shatterArmorEffect) {
            this.unitProperties.armor_mod = -shatterArmorEffect.getPower();
        } else {
            this.unitProperties.armor_mod = this.initialUnitProperties.armor_mod;
        }
        if (this.hasBuffActive("Spiritual Armor")) {
            const spell = new Spell({
                spellProperties: HoCConfig.getSpellConfig(FactionType.LIFE, "Spiritual Armor"),
                amount: 1,
            });
            this.unitProperties.armor_mod = Number(
                ((this.unitProperties.base_armor * spell.getPower()) / 100).toFixed(2),
            );
        }

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
        if (this.hasAbilityActive("Limited Supply")) {
            const actualStackPowerCoeff = this.getStackPower() / HoCConstants.MAX_UNIT_STACK_POWER;
            this.unitProperties.range_shots = Math.min(
                this.unitProperties.range_shots,
                Math.floor(this.maxRangeShots * actualStackPowerCoeff),
            );
        }

        const endlessQuiverAbility = this.getAbility("Endless Quiver");
        if (endlessQuiverAbility) {
            this.unitProperties.range_shots_mod = endlessQuiverAbility.getPower();
        }

        // STEPS
        const skyRunnerAbility = this.getAbility("Sky Runner");
        if (hasUnyieldingPower && !this.adjustedBaseStatsLaps.includes(currentLap)) {
            this.initialUnitProperties.steps += 1;
        }
        this.unitProperties.steps = this.initialUnitProperties.steps;
        if (skyRunnerAbility) {
            this.unitProperties.steps += this.calculateAbilityCount(skyRunnerAbility);
        }
        const wolfTrailAuraEffect = this.getAppliedAuraEffect("Wolf Trail Aura");
        if (wolfTrailAuraEffect) {
            this.unitProperties.steps += wolfTrailAuraEffect.getPower();
        }
        if (!this.canFly()) {
            const tieUpTheHorsesAuraEffect = this.getAppliedAuraEffect("Tie up the Horses Aura");
            if (tieUpTheHorsesAuraEffect) {
                this.unitProperties.steps += tieUpTheHorsesAuraEffect.getPower();
            }
        }
        const movementAugmentBuff = this.getBuff("Movement Augment");
        if (movementAugmentBuff) {
            this.unitProperties.steps += movementAugmentBuff.getPower();
        }
        const battleRoarBuff = this.getBuff("Battle Roar");
        if (battleRoarBuff) {
            this.unitProperties.steps += battleRoarBuff.getPower();
        }
        if (windFlowBuff) {
            const newSteps = this.unitProperties.steps - windFlowBuff.getPower();
            this.unitProperties.steps = Math.max(1, newSteps);
        }

        const quagmireDebuff = this.getDebuff("Quagmire");
        let stepsMultiplier = 1;
        if (quagmireDebuff) {
            stepsMultiplier = (100 - quagmireDebuff.getPower()) / 100;
        }
        this.unitProperties.steps = Number((this.unitProperties.steps * stepsMultiplier).toFixed(2));

        // ATTACK
        if (!this.adjustedBaseStatsLaps.includes(currentLap)) {
            if (hasUnyieldingPower) {
                this.initialUnitProperties.base_attack += 2;
            }
        }
        this.unitProperties.base_attack = this.initialUnitProperties.base_attack;
        this.unitProperties.shot_distance = this.initialUnitProperties.shot_distance;
        if (pegasusMightAura) {
            this.unitProperties.base_attack += pegasusMightAura.getPower();
        }

        const mightAugmentBuff = this.getBuff("Might Augment");
        if (this.getAttackType() !== AttackType.RANGE && mightAugmentBuff) {
            this.unitProperties.base_attack += Number(
                ((this.unitProperties.base_attack / 100) * mightAugmentBuff.getPower()).toFixed(2),
            );
        }
        const sniperAugmentBuff = this.getBuff("Sniper Augment");
        if (this.getAttackType() === AttackType.RANGE && sniperAugmentBuff) {
            const buffProperties = this.getBuffProperties(sniperAugmentBuff.getName());
            if (buffProperties?.length === 2) {
                this.unitProperties.base_attack += Number(
                    ((this.unitProperties.base_attack / 100) * parseInt(buffProperties[0])).toFixed(2),
                );
                // SHOT DISTANCE
                this.unitProperties.shot_distance += Number(
                    ((this.unitProperties.shot_distance / 100) * parseInt(buffProperties[1])).toFixed(2),
                );
            }
        }

        let baseAttackMultiplier = 1;
        const sharpenedWeaponsAura = this.getAppliedAuraEffect("Sharpened Weapons Aura");

        if (sharpenedWeaponsAura) {
            baseAttackMultiplier = baseAttackMultiplier * (1 + sharpenedWeaponsAura.getPower() / 100);
        }

        const weaknessDebuff = this.getDebuff("Weakness");
        if (weaknessDebuff) {
            baseAttackMultiplier = baseAttackMultiplier * ((100 - weaknessDebuff.getPower()) / 100);
        }

        const blessingBuff = this.getBuff("Blessing");
        if (blessingBuff || battleRoarBuff) {
            this.unitProperties.attack_damage_min = this.unitProperties.attack_damage_max;
        } else {
            this.unitProperties.attack_damage_min = this.initialUnitProperties.attack_damage_min;
        }

        if (this.hasBuffActive("Riot")) {
            const spell = new Spell({
                spellProperties: HoCConfig.getSpellConfig(FactionType.CHAOS, "Riot"),
                amount: 1,
            });
            this.unitProperties.attack_mod = (this.unitProperties.base_attack * spell.getPower()) / 100;
        } else if (this.hasBuffActive("Mass Riot")) {
            const spell = new Spell({
                spellProperties: HoCConfig.getSpellConfig(FactionType.CHAOS, "Mass Riot"),
                amount: 1,
            });
            this.unitProperties.attack_mod = (this.unitProperties.base_attack * spell.getPower()) / 100;
        } else {
            this.unitProperties.attack_mod = this.initialUnitProperties.attack_mod;
        }
        if (this.hasAbilityActive("Blind Fury")) {
            this.unitProperties.attack_mod +=
                (1 -
                    this.unitProperties.amount_alive /
                        (this.unitProperties.amount_alive + this.unitProperties.amount_died)) *
                this.initialUnitProperties.base_attack;
        }

        this.unitProperties.attack_mod = Number(this.unitProperties.attack_mod.toFixed(2));
        this.unitProperties.base_attack = Number((this.unitProperties.base_attack * baseAttackMultiplier).toFixed(2));
        this.unitProperties.shot_distance = Number(this.unitProperties.shot_distance.toFixed(2));

        // BUFFS & DEBUFFS
        const weakeningBeamDebuff = this.getDebuff("Weakening Beam");
        let baseArmorMultiplier = 1;
        if (weakeningBeamDebuff) {
            baseArmorMultiplier = (100 - weakeningBeamDebuff.getPower()) / 100;
        }

        if (!this.adjustedBaseStatsLaps.includes(currentLap)) {
            this.adjustedBaseStatsLaps.push(currentLap);
        }

        // ABILITIES DESCRIPTIONS
        // Heavy Armor
        const heavyArmorAbility = this.getAbility("Heavy Armor");
        if (heavyArmorAbility) {
            baseArmorMultiplier =
                baseArmorMultiplier *
                (1 +
                    ((heavyArmorAbility.getPower() + this.getLuck()) / 100 / HoCConstants.MAX_UNIT_STACK_POWER) *
                        this.getStackPower());
        }

        this.unitProperties.base_armor = Number((this.unitProperties.base_armor * baseArmorMultiplier).toFixed(2));
        this.unitProperties.range_armor = Number((this.unitProperties.base_armor * rangeArmorMultiplier).toFixed(2));

        // Heavy Armor
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
            const updatedDescription = description.replace("{}", chance.toFixed(2)).replace("{}", reduction.toFixed(2));
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
                .replace("{}", percentage.toFixed())
                .replace("{}", ((percentage * 7) / 8).toFixed())
                .replace("{}", ((percentage * 6) / 8).toFixed())
                .replace("{}", ((percentage * 5) / 8).toFixed());
            this.refreshAbiltyDescription(chainLightningAbility.getName(), updatedDescription);
        }
    }

    public setRangeShotDistance(distance: number) {
        this.unitProperties.shot_distance = distance;
    }

    public setStackPower(stackPower: number): void {
        this.unitProperties.stack_power = stackPower;
    }

    public attackMeleeAllowed(
        enemyTeam: Unit[],
        positions: Map<string, HoCMath.XY>,
        adjacentEnemies: Unit[],
        fromPathCells?: HoCMath.XY[],
        currentActiveKnownPaths?: Map<number, IWeightedRoute[]>,
    ): IAttackTargets {
        const canAttackUnitIds: Set<string> = new Set();
        const possibleAttackCells: HoCMath.XY[] = [];
        const possibleAttackCellHashes: Set<number> = new Set();
        const possibleAttackCellHashesToLargeCells: Map<number, HoCMath.XY[]> = new Map();
        const possibleFromPathCells: Denque<HoCMath.XY> = fromPathCells ? new Denque(fromPathCells) : new Denque();

        let fromPathHashes: Set<number> | undefined;
        let currentCells: HoCMath.XY[];
        if (this.isSmallSize()) {
            const currentCell = GridMath.getCellForPosition(this.gridSettings, this.getPosition());
            if (currentCell) {
                possibleFromPathCells.unshift(currentCell);
                currentCells = [currentCell];
            } else {
                currentCells = [];
            }
        } else {
            currentCells = GridMath.getCellsAroundPosition(this.gridSettings, this.getPosition());
            for (const c of currentCells) {
                possibleFromPathCells.unshift(c);
            }
            fromPathHashes = new Set();
            for (let i = 0; i < possibleFromPathCells.length; i++) {
                const fp = possibleFromPathCells.get(i);
                if (!fp) {
                    continue;
                }
                fromPathHashes.add((fp.x << 4) | fp.y);
            }
        }

        let maxX = Number.MIN_SAFE_INTEGER;
        let maxY = Number.MIN_SAFE_INTEGER;

        for (const c of currentCells) {
            maxX = Math.max(maxX, c.x);
            maxY = Math.max(maxY, c.y);
        }

        if (this.canMove()) {
            for (const u of enemyTeam) {
                const position = positions.get(u.getId());
                if (!position || !GridMath.isPositionWithinGrid(this.gridSettings, position)) {
                    continue;
                }

                let bodyCells: HoCMath.XY[];
                if (u.isSmallSize()) {
                    const bodyCellPos = GridMath.getCellForPosition(this.gridSettings, position);
                    if (!bodyCellPos) {
                        continue;
                    }
                    bodyCells = [bodyCellPos];
                } else {
                    bodyCells = GridMath.getCellsAroundPosition(this.gridSettings, u.getPosition());
                }

                for (const bodyCell of bodyCells) {
                    for (let i = 0; i < possibleFromPathCells.length; i++) {
                        const pathCell = possibleFromPathCells.get(i);
                        if (!pathCell) {
                            continue;
                        }

                        if (
                            Math.abs(bodyCell.x - pathCell.x) <= this.getAttackRange() &&
                            Math.abs(bodyCell.y - pathCell.y) <= this.getAttackRange()
                        ) {
                            const posHash = (pathCell.x << 4) | pathCell.y;
                            let addCell = false;
                            if (this.isSmallSize()) {
                                addCell = true;
                            } else {
                                const largeUnitAttackCells = GridMath.getLargeUnitAttackCells(
                                    this.gridSettings,
                                    pathCell,
                                    { x: maxX, y: maxY },
                                    bodyCell,
                                    currentActiveKnownPaths,
                                    fromPathHashes,
                                );
                                if (largeUnitAttackCells?.length) {
                                    addCell = true;
                                    possibleAttackCellHashesToLargeCells.set(posHash, largeUnitAttackCells);
                                }
                            }

                            if (addCell) {
                                if (!canAttackUnitIds.has(u.getId())) {
                                    canAttackUnitIds.add(u.getId());
                                }

                                if (!possibleAttackCellHashes.has(posHash)) {
                                    possibleAttackCells.push(pathCell);
                                    possibleAttackCellHashes.add(posHash);
                                }
                            }
                        }
                    }
                }
            }
        } else {
            const baseCell = this.getBaseCell();
            if (baseCell) {
                const posHash = (baseCell.x << 4) | baseCell.y;
                for (const ae of adjacentEnemies) {
                    canAttackUnitIds.add(ae.getId());
                    for (const c of ae.getCells()) {
                        let addPos = false;
                        if (this.isSmallSize()) {
                            addPos = true;
                        } else {
                            const largeUnitAttackCells = GridMath.getLargeUnitAttackCells(
                                this.gridSettings,
                                baseCell,
                                { x: maxX, y: maxY },
                                c,
                                currentActiveKnownPaths,
                                fromPathHashes,
                            );

                            if (largeUnitAttackCells?.length) {
                                addPos = true;
                                possibleAttackCellHashesToLargeCells.set(posHash, largeUnitAttackCells);
                            }
                        }

                        if (addPos) {
                            if (!canAttackUnitIds.has(ae.getId())) {
                                canAttackUnitIds.add(ae.getId());
                            }

                            if (!possibleAttackCellHashes.has(posHash)) {
                                possibleAttackCells.push(baseCell);
                                possibleAttackCellHashes.add(posHash);
                            }
                        }
                    }
                }
            }
        }

        return {
            unitIds: canAttackUnitIds,
            attackCells: possibleAttackCells,
            attackCellHashes: possibleAttackCellHashes,
            attackCellHashesToLargeCells: possibleAttackCellHashesToLargeCells,
        };
    }

    protected parseAbilities(): boolean {
        let spellAdded = false;
        for (const abilityName of this.unitProperties.abilities) {
            if (!this.hasAbilityActive(abilityName)) {
                const ability = this.abilityFactory.makeAbility(abilityName);
                this.abilities.push(ability);
                const spell = ability.getSpell();
                if (spell && !this.unitProperties.spells.includes(spell.getName())) {
                    this.unitProperties.spells.push(`:${spell.getName()}`);
                    this.unitProperties.can_cast_spells = true;
                    spellAdded = true;
                }
            }
        }

        return spellAdded;
    }

    protected getDistanceToFurthestCorner(position: HoCMath.XY): number {
        return Math.max(
            HoCMath.getDistance(position, { x: this.gridSettings.getMinX(), y: this.gridSettings.getMinY() }),
            HoCMath.getDistance(position, { x: this.gridSettings.getMinX(), y: this.gridSettings.getMaxY() }),
            HoCMath.getDistance(position, { x: this.gridSettings.getMaxX(), y: this.gridSettings.getMinY() }),
            HoCMath.getDistance(position, { x: this.gridSettings.getMaxX(), y: this.gridSettings.getMaxY() }),
        );
    }

    protected parseSpellData(spellData: string[]): Map<string, number> {
        const spells: Map<string, number> = new Map();

        for (const sp of spellData) {
            if (!spells.has(sp)) {
                spells.set(sp, 1);
            } else {
                const amount = spells.get(sp);
                spells.set(sp, (amount || 0) + 1);
            }
        }

        return spells;
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

            const spellProperties = HoCConfig.getSpellConfig(faction, spArr[1]);
            this.spells.push(new Spell({ spellProperties: spellProperties, amount: v }));
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

    protected handleDamageAnimation(_unitsDied: number): void {}

    protected refreshAbiltyDescription(_abilityName: string, _abilityDescription: string): void {}

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
}
