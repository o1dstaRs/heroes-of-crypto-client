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

import { HoCMath } from "@heroesofcrypto/common";

import { DefaultShader } from "../utils/gl/defaultShader";
import { Sprite } from "../utils/gl/Sprite";
import { ISpellParams, Spell } from "./spells";

export enum BookPosition {
    ONE = 1,
    TWO = 2,
    THREE = 3,
    FOUR = 4,
    FIVE = 5,
    SIX = 6,
}

const BOOK_POSITION_LEFT_X = -516;
const BOOK_POSITION_RIGHT_X = 256;
const BOOK_POSITION_Y = 1328;
const BOOK_SPELL_SIZE = 256;

export class RenderableSpell extends Spell {
    private readonly gl: WebGLRenderingContext;

    private readonly shader: DefaultShader;

    private readonly sprite: Sprite;

    private readonly fontSprite: Sprite;

    private readonly texturesByDigit: Map<number, WebGLTexture>;

    private xMin: number = 0;

    private xMax: number = 0;

    private yMin: number = 0;

    private yMax: number = 0;

    public constructor(
        spellParams: ISpellParams,
        gl: WebGLRenderingContext,
        shader: DefaultShader,
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

    public isHover(mousePosition: HoCMath.XY): boolean {
        return (
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
