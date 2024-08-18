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

import { XY } from "@box2d/core";
import { FactionType, GridSettings, GridMath, TeamType, IModifyableUnitProperties } from "@heroesofcrypto/common";

import { DefaultShader } from "../utils/gl/defaultShader";
import { Sprite } from "../utils/gl/Sprite";

export enum SpellTargetType {
    FREE_CELL = "FREE_CELL",
    ANY_ALLY = "ANY_ALLY",
    RANDOM_CLOSE_TO_CASTER = "RANDOM_CLOSE_TO_CASTER",
    ALL_ALLIES = "ALL_ALLIES",
    ALL_ENEMIES = "ALL_ENEMIES",
    ANY_ENEMY = "ANY_ENEMY",
}

export enum BookPosition {
    ONE = 1,
    TWO = 2,
    THREE = 3,
    FOUR = 4,
    FIVE = 5,
    SIX = 6,
}

export interface ICalculatedBuffsDebuffsEffect {
    baseStats: IModifyableUnitProperties;
    additionalStats: IModifyableUnitProperties;
}

const BOOK_POSITION_LEFT_X = -516;
const BOOK_POSITION_RIGHT_X = 256;
const BOOK_POSITION_Y = 1328;
const BOOK_SPELL_SIZE = 256;

export class AppliedSpell {
    private readonly name: string;

    private readonly power: number;

    private lapsRemaining: number;

    private readonly casterMaxHp: number;

    private readonly casterBaseArmor: number;

    public constructor(
        name: string,
        power: number,
        lapsRemaining: number,
        casterMaxHp: number,
        casterBaseArmor: number,
    ) {
        this.name = name;
        this.power = power;
        this.lapsRemaining = lapsRemaining;
        this.casterMaxHp = casterMaxHp;
        this.casterBaseArmor = casterBaseArmor;
    }
    public getCasterMaxHp(): number {
        return this.casterMaxHp;
    }

    public getCasterBaseArmor(): number {
        return this.casterBaseArmor;
    }

    public getName(): string {
        return this.name;
    }

    public getPower(): number {
        return this.power;
    }

    public minusLap(): void {
        if (this.lapsRemaining === Number.MAX_SAFE_INTEGER) {
            return;
        }

        if (this.lapsRemaining > 0) {
            this.lapsRemaining -= 1;
        }
        if (this.lapsRemaining < 0) {
            this.lapsRemaining = 0;
        }
    }

    public getLaps(): number {
        return this.lapsRemaining;
    }
}

export class SpellProperties {
    public readonly name: string;

    public readonly faction: FactionType;

    public readonly level: number;

    public readonly desc: string[];

    public readonly spell_target_type: SpellTargetType;

    public readonly power: number;

    public readonly laps: number;

    public readonly is_buff: boolean;

    public readonly self_cast_allowed: boolean;

    public readonly self_debuff_applies: boolean;

    public readonly minimal_caster_stack_power: number;

    public readonly conflicts_with: string[];

    public constructor(
        faction: FactionType,
        name: string,
        level: number,
        desc: string[],
        spell_target_type: SpellTargetType,
        power: number,
        laps: number,
        is_buff: boolean,
        self_cast_allowed: boolean,
        self_debuff_applies: boolean,
        minimal_caster_stack_power: number,
        conflicts_with: string[],
    ) {
        this.faction = faction;
        this.name = name;
        this.level = level;
        this.desc = desc;
        this.spell_target_type = spell_target_type;
        this.power = power;
        this.laps = laps;
        this.is_buff = is_buff;
        this.self_cast_allowed = self_cast_allowed;
        this.self_debuff_applies = self_debuff_applies;
        this.minimal_caster_stack_power = minimal_caster_stack_power;
        this.conflicts_with = conflicts_with;
    }
}

export class Spell {
    private readonly gl: WebGLRenderingContext;

    private readonly shader: DefaultShader;

    private readonly spellProperties: SpellProperties;

    private amountRemaining: number;

    private readonly sprite: Sprite;

    private readonly fontSprite: Sprite;

    private readonly texturesByDigit: Map<number, WebGLTexture>;

    private readonly isSummonSpell: boolean;

    private readonly summonUnitFaction: FactionType = FactionType.NO_TYPE;

    private readonly summonUnitName: string = "";

    private xMin: number;

    private xMax: number;

    private yMin: number;

    private yMax: number;

    public constructor(
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        spellProperties: SpellProperties,
        amount: number,
        sprite: Sprite,
        fontSprite: Sprite,
        texturesByDigit: Map<number, WebGLTexture>,
    ) {
        this.gl = gl;
        this.shader = shader;
        this.spellProperties = spellProperties;
        this.amountRemaining = amount;
        this.sprite = sprite;
        this.fontSprite = fontSprite;
        this.texturesByDigit = texturesByDigit;
        this.xMin = 0;
        this.xMax = 0;
        this.yMin = 0;
        this.yMax = 0;
        this.isSummonSpell = this.spellProperties.name.startsWith("Summon ");
        if (this.isSummonSpell) {
            if (this.spellProperties.name.endsWith(" Wolves")) {
                this.summonUnitFaction = FactionType.NATURE;
                this.summonUnitName = "Wolf";
            }
        }
    }

    public getFaction(): string {
        return this.spellProperties.faction;
    }

    public getName(): string {
        return this.spellProperties.name;
    }

    public getLevel(): number {
        return this.spellProperties.level;
    }

    public getDesc(): string[] {
        return this.spellProperties.desc;
    }

    public getSpellTargetType(): SpellTargetType {
        return this.spellProperties.spell_target_type;
    }

    public getPower(): number {
        return this.spellProperties.power;
    }

    public getLapsTotal(): number {
        return this.spellProperties.laps;
    }

    public isBuff(): boolean {
        return this.spellProperties.is_buff;
    }

    public isSelfCastAllowed(): boolean {
        return this.spellProperties.self_cast_allowed;
    }

    public isSelfDebuffApplicable(): boolean {
        return this.spellProperties.self_debuff_applies;
    }

    public getMinimalCasterStackPower(): number {
        return this.spellProperties.minimal_caster_stack_power;
    }

    public getConflictsWith(): string[] {
        return this.spellProperties.conflicts_with;
    }

    public isRemaining(): boolean {
        return this.amountRemaining > 0;
    }

    public isSummon(): boolean {
        return this.isSummonSpell;
    }

    public getSummonUnitRace(): FactionType {
        return this.summonUnitFaction;
    }

    public getSummonUnitName(): string {
        return this.summonUnitName;
    }

    public getSprite(): Sprite {
        return this.sprite;
    }

    public decreaseAmount(): void {
        this.amountRemaining -= 1;
    }

    public cleanupPagePosition(): void {
        this.xMin = 0;
        this.xMax = 0;
        this.yMin = 0;
        this.yMax = 0;
    }

    public isHover(mousePosition: XY): boolean {
        return (
            this.xMin !== this.xMax &&
            this.yMin !== this.yMax &&
            mousePosition.x >= this.xMin &&
            mousePosition.x < this.xMax &&
            mousePosition.y >= this.yMin &&
            mousePosition.y < this.yMax
        );
    }

    public getOnPagePosition(): XY[] {
        return [
            { x: this.xMin, y: this.yMin },
            { x: this.xMax, y: this.yMax },
        ];
    }

    public renderOnPage(bookPosition: BookPosition): void {
        const page = Math.ceil(bookPosition / 3);
        const mod = bookPosition % 3;
        const pagePosition = mod || 3;

        const xPos = page === 1 ? BOOK_POSITION_LEFT_X : BOOK_POSITION_RIGHT_X;
        const yPos =
            BOOK_POSITION_Y - (pagePosition - 1) * BOOK_SPELL_SIZE - 0.25 * (pagePosition - 1) * BOOK_SPELL_SIZE;

        this.sprite.setRect(xPos, yPos, BOOK_SPELL_SIZE, BOOK_SPELL_SIZE);

        this.xMin = xPos;
        this.xMax = xPos + BOOK_SPELL_SIZE;
        this.yMin = yPos;
        this.yMax = yPos + BOOK_SPELL_SIZE;

        const fifthStep = BOOK_SPELL_SIZE / 5;

        this.fontSprite.setRect(xPos, yPos - 46, BOOK_SPELL_SIZE, fifthStep);

        this.sprite.render();
        this.fontSprite.render();

        let index = 0;
        let numberOfScrolls = this.amountRemaining;
        const amountSprites: Sprite[] = new Array(numberOfScrolls.toString().length);

        if (numberOfScrolls < 10) {
            const texture = this.texturesByDigit.get(numberOfScrolls);
            if (texture) {
                amountSprites[index] = new Sprite(this.gl, this.shader, texture);
            }
        } else {
            while (numberOfScrolls) {
                const digit = numberOfScrolls % 10;
                const texture = this.texturesByDigit.get(digit);
                if (texture) {
                    amountSprites[index++] = new Sprite(this.gl, this.shader, texture);
                }
                numberOfScrolls = Math.floor(numberOfScrolls / 10);
            }
        }

        const sixthStep = BOOK_SPELL_SIZE / 6;

        let i = 1;
        for (const s of amountSprites) {
            s.setRect(xPos + BOOK_SPELL_SIZE - sixthStep * i++, yPos, sixthStep, fifthStep);
            s.render();
        }
    }
}

const verifyEmptyCell = (gridMatrix: number[][], emptyGridCell?: XY): boolean => {
    if (!emptyGridCell) {
        return false;
    }

    if (!(emptyGridCell.y in gridMatrix)) {
        return false;
    }

    if (!(emptyGridCell.x in gridMatrix[emptyGridCell.y])) {
        return false;
    }

    return !gridMatrix[emptyGridCell.y][emptyGridCell.x];
};

export function canBeMassCasted(
    spell: Spell,
    alliesBuffs: Map<string, AppliedSpell[]>,
    enemiesDebuffs: Map<string, AppliedSpell[]>,
    alliesMagicResists: Map<string, number>,
    enemiesMagicResists: Map<string, number>,
): boolean {
    let canBeCasted = false;

    if (spell.getSpellTargetType() === SpellTargetType.ALL_ALLIES) {
        for (const [unitId, magicResist] of alliesMagicResists) {
            const allyBuffs = alliesBuffs.get(unitId);

            if (allyBuffs?.length) {
                let canBeCastedForAlly = false;

                for (const buff of allyBuffs) {
                    if (
                        !spell.getConflictsWith().includes(buff.getName()) &&
                        buff.getName() !== spell.getName() &&
                        magicResist !== 100
                    ) {
                        canBeCastedForAlly = true;
                        break;
                    }
                }

                if (canBeCastedForAlly) {
                    canBeCasted = true;
                    break;
                }
            } else if (magicResist !== 100) {
                canBeCasted = true;
                break;
            }
        }
    } else if (spell.getSpellTargetType() === SpellTargetType.ALL_ENEMIES) {
        for (const [unitId, magicResist] of enemiesMagicResists) {
            const enemyDebuffs = enemiesDebuffs.get(unitId);

            if (enemyDebuffs?.length) {
                let canBeCastedForEnemy = false;

                for (const debuff of enemyDebuffs) {
                    if (
                        !spell.getConflictsWith().includes(debuff.getName()) &&
                        debuff.getName() !== spell.getName() &&
                        magicResist !== 100
                    ) {
                        canBeCastedForEnemy = true;
                        break;
                    }
                }

                if (canBeCastedForEnemy) {
                    canBeCasted = true;
                    break;
                }
            } else if (magicResist !== 100) {
                canBeCasted = true;
                break;
            }
        }
    }

    return canBeCasted;
}

export function canBeSummoned(spell: Spell, gridMatrix: number[][], emptyGridCell?: XY): boolean {
    if (spell.isSummon() && spell.getSpellTargetType() === SpellTargetType.RANDOM_CLOSE_TO_CASTER) {
        return verifyEmptyCell(gridMatrix, emptyGridCell);
    }

    return false;
}

export function canBeCasted(
    isLocked: boolean,
    gridSettings: GridSettings,
    gridMatrix: number[][],
    alreadyAppliedBuffAndDebuffs?: AppliedSpell[],
    spell?: Spell,
    unitSpells?: Spell[],
    emptyGridCell?: XY,
    fromUnitId?: string,
    toUnitId?: string,
    fromTeamType?: TeamType,
    toTeamType?: TeamType,
    fromUnitName?: string,
    toUnitName?: string,
    fromUnitStackPower?: number,
    toUnitMagicResistance?: number,
    targetGridCell?: XY,
) {
    if (
        isLocked ||
        !fromUnitStackPower ||
        !spell ||
        spell.getLapsTotal() <= 0 ||
        !spell.isRemaining() ||
        !unitSpells?.length ||
        spell.getMinimalCasterStackPower() > fromUnitStackPower
    ) {
        return false;
    }

    let spellFound = false;
    for (const s of unitSpells) {
        if (s.getName() === spell.getName() && s.isRemaining()) {
            spellFound = true;
            break;
        }
    }

    if (!spellFound) {
        return false;
    }

    const notAlreadyApplied = (): boolean => {
        const willConclictWith = spell.getConflictsWith();
        if (alreadyAppliedBuffAndDebuffs?.length) {
            for (const existingBuff of alreadyAppliedBuffAndDebuffs) {
                if (
                    (existingBuff.getName() === spell.getName() || willConclictWith.includes(existingBuff.getName())) &&
                    existingBuff.getLaps()
                ) {
                    return false;
                }
            }
        }

        return true;
    };

    const isSelfCast =
        (fromUnitId && toUnitId && fromUnitId === toUnitId) ||
        (fromUnitName && toUnitName && fromUnitName === toUnitName && fromTeamType === toTeamType);

    if (spell.getSpellTargetType() === SpellTargetType.ANY_ALLY) {
        if (toUnitMagicResistance && toUnitMagicResistance === 100) {
            return false;
        }

        if (
            fromTeamType &&
            toTeamType &&
            fromTeamType === toTeamType &&
            (spell.isSelfCastAllowed() || (!spell.isSelfCastAllowed() && !isSelfCast))
        ) {
            return notAlreadyApplied();
        }
    }

    if (spell.getSpellTargetType() === SpellTargetType.ANY_ENEMY) {
        if (toUnitMagicResistance && toUnitMagicResistance === 100) {
            return false;
        }

        if (fromTeamType && toTeamType && fromTeamType !== toTeamType && !isSelfCast) {
            return notAlreadyApplied();
        }
    }

    if (
        !toUnitId &&
        !toUnitName &&
        spell.getSpellTargetType() === SpellTargetType.FREE_CELL &&
        GridMath.isCellWithinGrid(gridSettings, targetGridCell)
    ) {
        return !verifyEmptyCell(gridMatrix, emptyGridCell);
    }

    return false;
}

export function calculateBuffsDebuffsEffect(
    buffs: AppliedSpell[],
    debuffs: AppliedSpell[],
): ICalculatedBuffsDebuffsEffect {
    const baseStats: IModifyableUnitProperties = {
        hp: 0,
        armor: 0,
        luck: 0,
        morale: 0,
    };
    const additionalStats: IModifyableUnitProperties = {
        hp: 0,
        armor: 0,
        luck: 0,
        morale: 0,
    };

    const alreadyAppliedBuffs: string[] = [];
    for (const b of buffs) {
        if (b.getLaps() <= 0) {
            continue;
        }

        if (alreadyAppliedBuffs.includes(b.getName())) {
            continue;
        }
        if (b.getName() === "Helping Hand") {
            baseStats.hp = Math.ceil(b.getCasterMaxHp() * 0.3);
            baseStats.armor = Math.ceil(b.getCasterBaseArmor() * 0.3);
            alreadyAppliedBuffs.push(b.getName());
        }
        if (b.getName() === "Luck Aura") {
            baseStats.luck = Number.MAX_SAFE_INTEGER;
        }
    }

    const alreadyAppliedDebuffs: string[] = [];
    for (const db of debuffs) {
        if (db.getLaps() <= 0) {
            continue;
        }

        if (alreadyAppliedDebuffs.includes(db.getName())) {
            continue;
        }
        if (db.getName() === "Helping Hand") {
            baseStats.hp = -Math.ceil(db.getCasterMaxHp() * 0.3);
            baseStats.armor = -Math.ceil(db.getCasterBaseArmor() * 0.3);
            alreadyAppliedDebuffs.push(db.getName());
        }
        if (db.getName() === "Sadness") {
            baseStats.morale = Number.MIN_SAFE_INTEGER;
        }
    }

    return {
        baseStats,
        additionalStats,
    };
}
