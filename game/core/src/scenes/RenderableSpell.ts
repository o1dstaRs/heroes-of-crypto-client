/*
 * -----------------------------------------------------------------------------
 * Pixi drop-in replacement for RenderableSpell (no WebGL Sprite/Shader needed).
 * -----------------------------------------------------------------------------
 */

import { Container, Graphics, Sprite as PixiSprite, Texture } from "pixi.js";
import { HoCConstants, HoCMath, ISpellParams, Spell } from "@heroesofcrypto/common";

export enum BookPosition {
    ONE = 1,
    TWO = 2,
    THREE = 3,
    FOUR = 4,
    FIVE = 5,
    SIX = 6,
}

// Coordinates are local to the centered 1024x1024 book texture.
// Keep the spell cells inside the parchment rectangles instead of tuning against screen pixels.
const BOOK_POSITION_LEFT_X = -340;
const BOOK_POSITION_RIGHT_X = 135;
const BOOK_POSITION_TOP_Y = -260;
const BOOK_POSITION_ROW_STEP = 215;
const BOOK_SPELL_SIZE = 160;
const BOOK_CELL_SIZE = 250;
const BOOK_CELL_OFFSET_X = -54;
const BOOK_CELL_OFFSET_Y = -42;

export type DigitTextureMap = Map<number, Texture>;

export class PixiRenderableSpell extends Spell {
    /** Parent layer where all elements get attached */
    private readonly layer: Container;
    /** Visuals */
    private readonly bgSprite: PixiSprite;
    private readonly iconSprite: PixiSprite;
    private readonly titleSprite: PixiSprite;
    /** Digit textures 0..9 (and optionally -1 for special glyph) */
    private readonly digits: DigitTextureMap;
    /** Runtime digit sprites that show "amountRemaining" */
    private amountDigitSprites: PixiSprite[] = [];
    /** Column of stacks — drawn with Graphics for perf */
    private stackColumnGfx: Graphics;
    private hoverFrameGfx: Graphics;
    private highlighted = false;
    /** Cached hover rect */
    private xMin = 0;
    private xMax = 0;
    private yMin = 0;
    private yMax = 0;
    /**
     * @param spellParams ISpellParams used by the game logic
     * @param layer Container to attach all sub-sprites
     * @param textures Must include spell_cell_260. stack_green/red are optional and unused in this Pixi version.
     * @param iconTexture The spell icon texture (equivalent to old `sprite`)
     * @param titleTexture Title strip texture (equivalent to old `fontSprite`)
     * @param digits Map<number, Texture> for 0..9 (and optionally -1 special)
     */
    public constructor(
        spellParams: ISpellParams,
        layer: Container,
        textures: {
            spell_cell_260: Texture;
            stack_green?: Texture; // optional, not used (we draw with Graphics)
            stack_red?: Texture; // optional, not used (we draw with Graphics)
        },
        iconTexture: Texture,
        titleTexture: Texture,
        digits: DigitTextureMap,
    ) {
        super(spellParams);

        this.layer = layer;
        this.digits = digits;

        this.bgSprite = new PixiSprite(textures.spell_cell_260);
        this.bgSprite.anchor.set(0, 0);

        this.iconSprite = new PixiSprite(iconTexture);
        this.iconSprite.anchor.set(0, 0);

        this.titleSprite = new PixiSprite(titleTexture);
        this.titleSprite.anchor.set(0, 0);

        this.bgSprite.visible = false;
        this.iconSprite.visible = false;
        this.titleSprite.visible = false;

        this.stackColumnGfx = new Graphics();
        this.hoverFrameGfx = new Graphics();

        this.layer.addChild(this.bgSprite, this.iconSprite, this.titleSprite, this.stackColumnGfx, this.hoverFrameGfx);
    }
    /** Old API parity */
    public getSprite(): PixiSprite {
        return this.iconSprite;
    }
    public cleanupPagePosition(): void {
        this.xMin = this.xMax = this.yMin = this.yMax = 0;
        this.bgSprite.visible = false;
        this.iconSprite.visible = false;
        this.titleSprite.visible = false;
        for (const s of this.amountDigitSprites) {
            s.visible = false;
        }
        this.stackColumnGfx.clear();
        this.hoverFrameGfx.clear();
        this.highlighted = false;
    }
    public setHighlighted(highlighted: boolean): void {
        if (this.highlighted === highlighted) return;
        this.highlighted = highlighted;
    }
    public isHover(globalMouse: HoCMath.XY, ownerStackPower: number): boolean {
        if (
            this.amountRemaining <= 0 ||
            ownerStackPower < this.getMinimalCasterStackPower() ||
            !this.iconSprite.visible
        ) {
            return false;
        }
        // Hit-test against the icon's actual rendered bounds.
        const b = this.iconSprite.getBounds();
        return globalMouse.x >= b.minX && globalMouse.x <= b.maxX && globalMouse.y >= b.minY && globalMouse.y <= b.maxY;
    }
    public getOnPagePosition(): HoCMath.XY[] {
        return [
            { x: this.xMin, y: this.yMin },
            { x: this.xMax, y: this.yMax },
        ];
    }
    /**
     * Places everything visually to a “book slot” and renders:
     * - background cell
     * - icon
     * - title strip
     * - numeric counter (digits)
     * - stack column (green/red style)
     */
    public renderOnPage(bookPosition: BookPosition, ownerStackPower: number): void {
        const page = Math.ceil(bookPosition / 3);
        const mod = bookPosition % 3;
        const pagePosition = mod || 3;

        const xPos = page === 1 ? BOOK_POSITION_LEFT_X : BOOK_POSITION_RIGHT_X;
        const yPos = BOOK_POSITION_TOP_Y + (pagePosition - 1) * BOOK_POSITION_ROW_STEP;
        const cellX = xPos + BOOK_CELL_OFFSET_X;
        const cellY = yPos + BOOK_CELL_OFFSET_Y;

        // Background cell
        this.bgSprite.width = BOOK_CELL_SIZE;
        this.bgSprite.height = BOOK_CELL_SIZE;
        this.bgSprite.x = cellX;
        this.bgSprite.y = cellY;

        // Icon (main sprite)
        this.iconSprite.width = BOOK_SPELL_SIZE;
        this.iconSprite.height = BOOK_SPELL_SIZE;
        this.iconSprite.x = xPos;
        this.iconSprite.y = yPos;

        // Hover rect cache (icon bounds)
        this.xMin = xPos;
        this.xMax = xPos + BOOK_SPELL_SIZE;
        this.yMin = yPos;
        this.yMax = yPos + BOOK_SPELL_SIZE;

        // Title strip just above icon
        const fifthStep = BOOK_SPELL_SIZE / 5;
        this.titleSprite.width = BOOK_SPELL_SIZE;
        this.titleSprite.height = fifthStep;
        this.titleSprite.x = xPos;
        this.titleSprite.y = yPos + BOOK_SPELL_SIZE + 8;

        // Visibility + alpha rules
        const canRenderStack = this.amountRemaining > 0;
        const canRenderNumber = ownerStackPower >= this.getMinimalCasterStackPower();

        this.bgSprite.alpha = canRenderNumber ? 1 : 0.4;
        this.iconSprite.alpha = canRenderStack && canRenderNumber ? 1 : 0.4;
        this.titleSprite.alpha = canRenderStack && canRenderNumber ? 1 : 0.4;
        this.bgSprite.tint = this.highlighted ? 0xfff1bf : 0xffffff;
        this.iconSprite.tint = this.highlighted ? 0xfff7cc : 0xffffff;
        this.titleSprite.tint = this.highlighted ? 0xfff7cc : 0xffffff;

        this.bgSprite.visible = true;
        this.iconSprite.visible = true;
        this.titleSprite.visible = true;

        this.renderHoverFrame(cellX, cellY, canRenderStack && canRenderNumber);

        // Digits for remaining
        this.renderDigits(xPos, yPos, canRenderNumber);

        // Stack column
        this.renderStackColumn(xPos, yPos, ownerStackPower, canRenderStack);
    }
    private renderDigits(xPos: number, yPos: number, canRenderNumber: boolean) {
        // cleanup previous digit sprites
        for (const s of this.amountDigitSprites) {
            s.parent?.removeChild(s);
            s.destroy();
        }
        this.amountDigitSprites = [];

        const sixthStep = BOOK_SPELL_SIZE / 6;
        const fifthStep = BOOK_SPELL_SIZE / 5;

        // Decompose number into digits (right to left)
        const sprites: PixiSprite[] = [];
        if (this.amountRemaining < 10) {
            const tex = this.digits.get(this.amountRemaining);
            if (tex) sprites.push(new PixiSprite(tex));
        } else {
            let n = this.amountRemaining;
            while (n) {
                const digit = n % 10;
                const tex = this.digits.get(digit);
                if (tex) sprites.push(new PixiSprite(tex));
                n = Math.floor(n / 10);
            }
        }

        // Position right-aligned inside the card
        let i = 1;
        for (const s of sprites) {
            s.anchor.set(0, 1);
            s.width = fifthStep;
            s.height = BOOK_SPELL_SIZE / 3;
            s.x = xPos + 106 + BOOK_SPELL_SIZE - sixthStep * i++;
            s.y = yPos + BOOK_SPELL_SIZE + 62;
            s.alpha = canRenderNumber ? 1 : 0.4;
            this.layer.addChild(s);
        }
        this.amountDigitSprites = sprites;
    }
    private renderStackColumn(xPos: number, yPos: number, ownerStackPower: number, canRenderStack: boolean) {
        // Clear previous vectors
        this.stackColumnGfx.clear();

        // Draw thin rectangles using Graphics (Pixi v8 API)
        const sixthStep = BOOK_SPELL_SIZE / 6;
        const barX = xPos + BOOK_CELL_OFFSET_X + 14;
        const barW = sixthStep - 8;
        const barH = BOOK_SPELL_SIZE / HoCConstants.MAX_UNIT_STACK_POWER;

        // Choose color based on requirement
        const useGreen = ownerStackPower >= this.getMinimalCasterStackPower();
        const fillColor = useGreen ? 0x00aa55 : 0xaa0033; // approximate tint to your old textures
        const alpha = canRenderStack ? 1 : 0.4;

        // Draw minimal caster stack power blocks (one per required stack)
        let stackIndex = 1;
        let yShift = 0;
        while (stackIndex <= this.getMinimalCasterStackPower()) {
            const targetY = yPos + BOOK_SPELL_SIZE - barH - yShift;
            this.stackColumnGfx.rect(barX, targetY, barW, barH - 3).fill({ color: fillColor, alpha });
            stackIndex++;
            yShift += BOOK_SPELL_SIZE / 5;
        }
    }
    private renderHoverFrame(cellX: number, cellY: number, enabled: boolean): void {
        this.hoverFrameGfx.clear();
        if (!this.highlighted || !enabled) return;

        this.hoverFrameGfx
            .rect(cellX - 6, cellY - 6, BOOK_CELL_SIZE + 12, BOOK_CELL_SIZE + 12)
            .stroke({ width: 5, color: 0xf6d87c, alpha: 0.95 })
            .rect(cellX + 2, cellY + 2, BOOK_CELL_SIZE - 4, BOOK_CELL_SIZE - 4)
            .stroke({ width: 2, color: 0x5b3508, alpha: 0.85 });
    }
    public destroy(): void {
        for (const s of this.amountDigitSprites) {
            s.parent?.removeChild(s);
            s.destroy();
        }
        this.amountDigitSprites = [];
        this.stackColumnGfx.destroy();
        this.hoverFrameGfx.destroy();
        this.bgSprite.destroy();
        this.iconSprite.destroy();
        this.titleSprite.destroy();
    }
}
