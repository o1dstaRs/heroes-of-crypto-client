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

import { HoCConstants, HoCMath, ISpellParams, Spell } from "@heroesofcrypto/common";

import { DefaultShader } from "../utils/gl/defaultShader";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";

export enum BookPosition {
    ONE = 1,
    TWO = 2,
    THREE = 3,
    FOUR = 4,
    FIVE = 5,
    SIX = 6,
}

const BOOK_POSITION_LEFT_X = -530;
const BOOK_POSITION_RIGHT_X = 286;
const BOOK_POSITION_Y = 1380;
const BOOK_SPELL_SIZE = 320;
const BOOK_CELL_SIZE = 500;

export class RenderableSpell extends Spell {
    private readonly gl: WebGLRenderingContext;

    private readonly shader: DefaultShader;

    private readonly sprite: Sprite;

    private readonly fontSprite: Sprite;

    private readonly texturesByDigit: Map<number, WebGLTexture>;

    private readonly spellBackgroundSprite: Sprite;

    private readonly greenStackSprite: Sprite;

    private readonly redStackSprite: Sprite;

    private xMin: number = 0;

    private xMax: number = 0;

    private yMin: number = 0;

    private yMax: number = 0;

    public constructor(
        spellParams: ISpellParams,
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        textures: PreloadedTextures,
        sprite: Sprite,
        fontSprite: Sprite,
        texturesByDigit: Map<number, WebGLTexture>,
    ) {
        super(spellParams);
        this.gl = gl;
        this.shader = shader;
        this.sprite = sprite;
        this.fontSprite = fontSprite;
        this.texturesByDigit = texturesByDigit;
        this.spellBackgroundSprite = new Sprite(gl, shader, textures.spell_cell_260.texture);
        this.greenStackSprite = new Sprite(gl, shader, textures.stack_green.texture);
        this.redStackSprite = new Sprite(gl, shader, textures.stack_red.texture);
    }

    public getSprite(): Sprite {
        return this.sprite;
    }

    public cleanupPagePosition(): void {
        this.xMin = 0;
        this.xMax = 0;
        this.yMin = 0;
        this.yMax = 0;
    }

    public isHover(mousePosition: HoCMath.XY, ownerStackPower: number): boolean {
        return (
            this.amountRemaining > 0 &&
            ownerStackPower >= this.getMinimalCasterStackPower() &&
            this.xMin !== this.xMax &&
            this.yMin !== this.yMax &&
            mousePosition.x >= this.xMin &&
            mousePosition.x < this.xMax &&
            mousePosition.y >= this.yMin &&
            mousePosition.y < this.yMax
        );
    }

    public getOnPagePosition(): HoCMath.XY[] {
        return [
            { x: this.xMin, y: this.yMin },
            { x: this.xMax, y: this.yMax },
        ];
    }

    public renderOnPage(bookPosition: BookPosition, ownerStackPower: number): void {
        const page = Math.ceil(bookPosition / 3);
        const mod = bookPosition % 3;
        const pagePosition = mod || 3;

        const xPos = page === 1 ? BOOK_POSITION_LEFT_X : BOOK_POSITION_RIGHT_X;
        const yPos =
            BOOK_POSITION_Y - (pagePosition - 1) * BOOK_SPELL_SIZE - 0.4 * (pagePosition - 1) * BOOK_SPELL_SIZE;

        this.spellBackgroundSprite.setRect(xPos - 54, yPos - 112, BOOK_CELL_SIZE, BOOK_CELL_SIZE);
        this.sprite.setRect(xPos, yPos, BOOK_SPELL_SIZE, BOOK_SPELL_SIZE);

        this.xMin = xPos;
        this.xMax = xPos + BOOK_SPELL_SIZE;
        this.yMin = yPos;
        this.yMax = yPos + BOOK_SPELL_SIZE;

        const fifthStep = BOOK_SPELL_SIZE / 5;

        this.fontSprite.setRect(xPos, yPos - 70, BOOK_SPELL_SIZE, fifthStep);

        let allowedRenderStack = this.amountRemaining > 0;
        let allowedRenderNumber = ownerStackPower >= this.getMinimalCasterStackPower();
        this.spellBackgroundSprite.render(allowedRenderNumber ? 1 : 0.4);
        this.sprite.render(allowedRenderStack && allowedRenderNumber ? 1 : 0.4);
        this.fontSprite.render(allowedRenderStack && allowedRenderNumber ? 1 : 0.4);
        let numberOfScrolls = this.amountRemaining;

        let index = 0;
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
            s.setRect(xPos + 106 + BOOK_SPELL_SIZE - sixthStep * i++, yPos + 110, fifthStep, BOOK_SPELL_SIZE / 3);
            s.render(allowedRenderNumber ? 1 : 0.4);
        }

        // render stack column
        let stackIndex = 1;
        let yShift = 0;
        let sprite: Sprite;
        if (ownerStackPower < this.getMinimalCasterStackPower()) {
            sprite = this.redStackSprite;
        } else {
            sprite = this.greenStackSprite;
        }
        while (stackIndex <= this.getMinimalCasterStackPower()) {
            sprite.setRect(
                xPos - 312 + BOOK_SPELL_SIZE - sixthStep,
                yPos + yShift,
                sixthStep - 8,
                BOOK_SPELL_SIZE / HoCConstants.MAX_UNIT_STACK_POWER,
            );
            if (allowedRenderStack) {
                sprite.render();
            } else {
                sprite.render(0.4);
            }

            stackIndex++;
            yShift = yShift + BOOK_SPELL_SIZE / 5;
        }
    }
}
