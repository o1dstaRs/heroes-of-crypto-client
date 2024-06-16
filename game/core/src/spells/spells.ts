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
import { GridSettings, GridMath } from "@heroesofcrypto/common";

import { IFrameable, OnFramePosition } from "../menu/frameable";
import { IModifyableUnitStats, TeamType } from "../units/units_stats";
import { DefaultShader } from "../utils/gl/defaultShader";
import { Sprite } from "../utils/gl/Sprite";

export enum SpellTargetType {
    FREE_CELL = "FREE_CELL",
    ANY_ALLY = "ANY_ALLY",
    RANDOM_CLOSE_TO_CASTER = "RANDOM_CLOSE_TO_CASTER",
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
    baseStats: IModifyableUnitStats;
    additionalStats: IModifyableUnitStats;
}

const BOOK_POSITION_LEFT_X = -516;
const BOOK_POSITION_RIGHT_X = 256;
const BOOK_POSITION_Y = 1328;
const BOOK_SPELL_SIZE = 256;

export class AppliedSpell implements IFrameable {
    private readonly sprite: Sprite;

    public readonly name: string;

    public readonly lapsRemaining: number;

    public readonly casterMaxHp: number;

    public readonly casterBaseArmor: number;

    public constructor(
        sprite: Sprite,
        name: string,
        lapsRemaining: number,
        casterMaxHp: number,
        casterBaseArmor: number,
    ) {
        this.sprite = sprite;
        this.name = name;
        this.lapsRemaining = lapsRemaining;
        this.casterMaxHp = casterMaxHp;
        this.casterBaseArmor = casterBaseArmor;
    }

    public renderWithinFrame(gridSettings: GridSettings, framePosition: XY, onFramePosition: OnFramePosition): void {
        const xMul = (onFramePosition - 1) % 3;
        const yMul = Math.floor((onFramePosition - 1) / 3);

        this.sprite.setRect(
            framePosition.x + gridSettings.getHalfStep() + gridSettings.getStep() * xMul,
            framePosition.y - gridSettings.getHalfStep() + gridSettings.getStep() * (3 - yMul),
            gridSettings.getStep(),
            gridSettings.getStep(),
        );
        this.sprite.render();
    }

    public getName(): string {
        return this.name;
    }
}

export class SpellStats {
    public readonly name: string;

    public readonly race: string;

    public readonly level: number;

    public readonly desc: string;

    public readonly spellTargetType: SpellTargetType;

    public readonly power: number;

    public readonly laps: number;

    public readonly self_cast_allowed: boolean;

    public readonly self_debuff_applies: boolean;

    public constructor(
        race: string,
        name: string,
        level: number,
        desc: string,
        spellTargetType: SpellTargetType,
        power: number,
        laps: number,
        self_cast_allowed: boolean,
        self_debuff_applies: boolean,
    ) {
        this.race = race;
        this.name = name;
        this.level = level;
        this.desc = desc;
        this.spellTargetType = spellTargetType;
        this.power = power;
        this.laps = laps;
        this.self_cast_allowed = self_cast_allowed;
        this.self_debuff_applies = self_debuff_applies;
    }
}

export class Spell {
    private readonly gl: WebGLRenderingContext;

    private readonly shader: DefaultShader;

    private readonly spellStats: SpellStats;

    private amountRemaining: number;

    private readonly sprite: Sprite;

    private readonly fontSprite: Sprite;

    private readonly texturesByDigit: Map<number, WebGLTexture>;

    private readonly isSummonSpell: boolean;

    private readonly summonUnitRace: string = "";

    private readonly summonUnitName: string = "";

    private xMin: number;

    private xMax: number;

    private yMin: number;

    private yMax: number;

    public constructor(
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        spellStats: SpellStats,
        amount: number,
        sprite: Sprite,
        fontSprite: Sprite,
        texturesByDigit: Map<number, WebGLTexture>,
    ) {
        this.gl = gl;
        this.shader = shader;
        this.spellStats = spellStats;
        this.amountRemaining = amount;
        this.sprite = sprite;
        this.fontSprite = fontSprite;
        this.texturesByDigit = texturesByDigit;
        this.xMin = 0;
        this.xMax = 0;
        this.yMin = 0;
        this.yMax = 0;
        this.isSummonSpell = this.spellStats.name.startsWith("Summon ");
        if (this.isSummonSpell) {
            if (this.spellStats.name.endsWith(" Wolves")) {
                this.summonUnitRace = "Nature";
                this.summonUnitName = "Wolf";
            }
        }
    }

    public getRace(): string {
        return this.spellStats.race;
    }

    public getName(): string {
        return this.spellStats.name;
    }

    public getLevel(): number {
        return this.spellStats.level;
    }

    public getDesc(): string {
        return this.spellStats.desc;
    }

    public getSpellTargetType(): SpellTargetType {
        return this.spellStats.spellTargetType;
    }

    public getPower(): number {
        return this.spellStats.power;
    }

    public getLapsTotal(): number {
        return this.spellStats.laps;
    }

    public isSelfCastAllowed(): boolean {
        return this.spellStats.self_cast_allowed;
    }

    public isSelfDebuffApplicable(): boolean {
        return this.spellStats.self_debuff_applies;
    }

    public isRemaining(): boolean {
        return this.amountRemaining > 0;
    }

    public isSummon(): boolean {
        return this.isSummonSpell;
    }

    public getSummonUnitRace(): string {
        return this.summonUnitRace;
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
    toUnitMagicResistance?: number,
    targetGridCell?: XY,
) {
    if (isLocked || !spell || spell.getLapsTotal() <= 0 || !spell.isRemaining() || !unitSpells?.length) {
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
        if (alreadyAppliedBuffAndDebuffs?.length) {
            for (const existingBuff of alreadyAppliedBuffAndDebuffs) {
                if (existingBuff.name === spell.getName() && existingBuff.lapsRemaining) {
                    return false;
                }
            }
        }

        return true;
    };

    const verifyEmptyCell = (): boolean => {
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

    if (spell.getSpellTargetType() === SpellTargetType.ANY_ALLY) {
        if (toUnitMagicResistance && toUnitMagicResistance === 100) {
            return false;
        }

        const isSelfCast =
            (fromUnitId && toUnitId && fromUnitId === toUnitId) ||
            (fromUnitName && toUnitName && fromUnitName === toUnitName);

        if (
            (spell.isSelfCastAllowed() && fromUnitId && toUnitId && fromUnitId === toUnitId) ||
            (!spell.isSelfCastAllowed() && !isSelfCast && fromTeamType && toTeamType && fromTeamType === toTeamType)
        ) {
            return notAlreadyApplied();
        }
    } else if (spell.getSpellTargetType() === SpellTargetType.RANDOM_CLOSE_TO_CASTER) {
        return !!toUnitId || verifyEmptyCell();
    }

    if (
        !toUnitId &&
        !toUnitName &&
        spell.getSpellTargetType() === SpellTargetType.FREE_CELL &&
        GridMath.isCellWithinGrid(gridSettings, targetGridCell)
    ) {
        return !verifyEmptyCell();
    }

    return false;
}

export function calculateBuffsDebuffsEffect(
    buffs: AppliedSpell[],
    debuffs: AppliedSpell[],
): ICalculatedBuffsDebuffsEffect {
    const baseStats: IModifyableUnitStats = {
        hp: 0,
        armor: 0,
    };
    const additionalStats: IModifyableUnitStats = {
        hp: 0,
        armor: 0,
    };

    const alreadyAppliedBuffs: string[] = [];
    for (const b of buffs) {
        if (b.lapsRemaining <= 0) {
            continue;
        }

        if (alreadyAppliedBuffs.includes(b.name)) {
            continue;
        }
        if (b.name === "Helping Hand") {
            baseStats.hp = Math.ceil(b.casterMaxHp * 0.3);
            baseStats.armor = Math.ceil(b.casterBaseArmor * 0.3);
            alreadyAppliedBuffs.push(b.name);
        }
    }

    const alreadyAppliedDebuffs: string[] = [];
    for (const db of debuffs) {
        if (db.lapsRemaining <= 0) {
            continue;
        }

        if (alreadyAppliedDebuffs.includes(db.name)) {
            continue;
        }
        if (db.name === "Helping Hand") {
            baseStats.hp = -Math.ceil(db.casterMaxHp * 0.3);
            baseStats.armor = -Math.ceil(db.casterBaseArmor * 0.3);
            alreadyAppliedDebuffs.push(db.name);
        }
    }

    return {
        baseStats,
        additionalStats,
    };
}
