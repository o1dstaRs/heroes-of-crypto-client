/*
 * -----------------------------------------------------------------------------
 * Pixi drop-in replacement for RenderableSpell (no WebGL Sprite/Shader needed).
 * -----------------------------------------------------------------------------
 */

import { Container, Graphics, Sprite as PixiSprite, Text, TextStyle, Texture } from "pixi.js";
import { HoCConstants, HoCMath, ISpellParams, Spell } from "@heroesofcrypto/common";

export enum BookPosition {
    ONE = 1,
    TWO = 2,
    THREE = 3,
    FOUR = 4,
    FIVE = 5,
    SIX = 6,
}

// Coordinates are local to the centered 1024x1024 book texture (origin = book centre / spine).
// Each parchment page's writable frame is centred at local x ≈ ±206 (cell centre = X + CELL/2),
// and both pages share a vertical writable centre at y ≈ -35. The cell column on each page and the
// 3-row stack are centred against those so the spells sit squarely on the parchment, not drifting
// left or hanging past the bottom border.
const BOOK_POSITION_LEFT_X = -316; // centre -206 — mirrors the right page (was -380 → drifted left)
const BOOK_POSITION_RIGHT_X = 96; // centre +206
const BOOK_POSITION_TOP_Y = -375; // top row so the 3-row stack is vertically centred on the page
const BOOK_POSITION_ROW_STEP = 230;
const BOOK_CELL_SIZE = 220;
const BOOK_SPELL_SIZE = 140;
const BOOK_ICON_OFFSET_X = 40;
const BOOK_ICON_OFFSET_Y = 28;
const BOOK_TITLE_MARGIN_X = 11;
const BOOK_TITLE_MARGIN_BOTTOM = 8;
const BOOK_STACK_BAR_X = 14;
const AMOUNT_BADGE_HEIGHT = 38;

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
    private amountBadgeGfx: Graphics;
    private disabledOverlayGfx: Graphics;
    private hoverFrameGfx: Graphics;
    private amountText: Text;
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
        this.amountBadgeGfx = new Graphics();
        this.disabledOverlayGfx = new Graphics();
        this.hoverFrameGfx = new Graphics();
        this.amountText = new Text({
            text: "",
            style: new TextStyle({ fill: 0xffffff, fontSize: 30, fontWeight: "700" }),
        });
        this.amountText.anchor.set(0.5);
        this.amountText.visible = false;

        this.layer.addChild(
            this.bgSprite,
            this.iconSprite,
            this.titleSprite,
            this.stackColumnGfx,
            this.disabledOverlayGfx,
            this.amountBadgeGfx,
            this.amountText,
            this.hoverFrameGfx,
        );
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
            s.parent?.removeChild(s);
            s.destroy();
        }
        this.amountDigitSprites = [];
        this.stackColumnGfx.clear();
        this.amountBadgeGfx.clear();
        this.disabledOverlayGfx.clear();
        this.hoverFrameGfx.clear();
        this.amountText.visible = false;
        this.highlighted = false;
    }
    public setHighlighted(highlighted: boolean): void {
        if (this.highlighted === highlighted) return;
        this.highlighted = highlighted;
    }
    public syncAmount(amountRemaining: number): void {
        this.amountRemaining = Math.max(0, Math.floor(amountRemaining));
    }
    public canUse(ownerStackPower: number): boolean {
        return this.amountRemaining > 0 && ownerStackPower >= this.getMinimalCasterStackPower();
    }
    public getHoverInfo(ownerStackPower: number): string[] {
        const lines = [this.getName(), `Scrolls: ${this.amountRemaining}`];
        if (this.amountRemaining <= 0) {
            lines.push("No scrolls left");
        }
        const minimalStackPower = this.getMinimalCasterStackPower();
        if (ownerStackPower < minimalStackPower) {
            lines.push(`Requires stack power ${minimalStackPower}`);
        }
        return [...lines, ...this.getDesc()];
    }
    public isHover(globalMouse: HoCMath.XY, ownerStackPower: number, includeUnavailable = false): boolean {
        if (!this.iconSprite.visible) {
            return false;
        }
        if (!includeUnavailable && !this.canUse(ownerStackPower)) return false;

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

        const cellX = page === 1 ? BOOK_POSITION_LEFT_X : BOOK_POSITION_RIGHT_X;
        const cellY = BOOK_POSITION_TOP_Y + (pagePosition - 1) * BOOK_POSITION_ROW_STEP;
        const iconX = cellX + BOOK_ICON_OFFSET_X;
        const iconY = cellY + BOOK_ICON_OFFSET_Y;

        // Background cell
        this.bgSprite.width = BOOK_CELL_SIZE;
        this.bgSprite.height = BOOK_CELL_SIZE;
        this.bgSprite.x = cellX;
        this.bgSprite.y = cellY;

        // Icon (main sprite)
        this.iconSprite.width = BOOK_SPELL_SIZE;
        this.iconSprite.height = BOOK_SPELL_SIZE;
        this.iconSprite.x = iconX;
        this.iconSprite.y = iconY;

        // Hover rect cache (icon bounds)
        this.xMin = iconX;
        this.xMax = iconX + BOOK_SPELL_SIZE;
        this.yMin = iconY;
        this.yMax = iconY + BOOK_SPELL_SIZE;

        // Keep long spell names inside the cell instead of matching the smaller icon width.
        this.titleSprite.width = BOOK_CELL_SIZE - BOOK_TITLE_MARGIN_X * 2;
        this.titleSprite.height = 38;
        this.titleSprite.x = cellX + BOOK_TITLE_MARGIN_X;
        this.titleSprite.y = cellY + BOOK_CELL_SIZE - BOOK_TITLE_MARGIN_BOTTOM - this.titleSprite.height;

        // Visibility + alpha rules
        const hasScrolls = this.amountRemaining > 0;
        const hasStackPower = ownerStackPower >= this.getMinimalCasterStackPower();
        const enabled = hasScrolls && hasStackPower;

        this.bgSprite.alpha = enabled ? 1 : 0.62;
        this.iconSprite.alpha = enabled ? 1 : 0.42;
        this.titleSprite.alpha = enabled ? 1 : 0.42;
        this.bgSprite.tint = enabled ? (this.highlighted ? 0xfff1bf : 0xffffff) : 0x858585;
        this.iconSprite.tint = enabled ? (this.highlighted ? 0xfff7cc : 0xffffff) : 0x777777;
        this.titleSprite.tint = enabled ? (this.highlighted ? 0xfff7cc : 0xffffff) : 0x777777;

        this.bgSprite.visible = true;
        this.iconSprite.visible = true;
        this.titleSprite.visible = true;

        this.renderDisabledOverlay(iconX, iconY, !enabled);
        this.renderHoverFrame(cellX, cellY, enabled);

        // Number of scrolls remaining.
        this.renderAmount(cellX, cellY, enabled, hasStackPower);

        // Stack column
        this.renderStackColumn(cellX, cellY, ownerStackPower, hasScrolls);
    }
    private clearAmountDigitSprites(): void {
        for (const s of this.amountDigitSprites) {
            s.parent?.removeChild(s);
            s.destroy();
        }
        this.amountDigitSprites = [];
    }
    private renderAmount(cellX: number, cellY: number, enabled: boolean, hasStackPower: boolean): void {
        this.clearAmountDigitSprites();

        const label = String(this.amountRemaining);
        const badgeWidth = Math.max(48, label.length * 22 + 26);
        const badgeX = cellX + BOOK_CELL_SIZE - badgeWidth - 12;
        const badgeY = cellY + 12;
        const fillColor = this.amountRemaining > 0 ? (hasStackPower ? 0x123c23 : 0x6d2c2c) : 0x303030;
        const strokeColor = enabled ? 0xf6d87c : 0x888888;

        this.amountBadgeGfx
            .clear()
            .rect(badgeX, badgeY, badgeWidth, AMOUNT_BADGE_HEIGHT)
            .fill({ color: fillColor, alpha: enabled ? 0.92 : 0.72 })
            .stroke({ width: 2, color: strokeColor, alpha: enabled ? 0.95 : 0.72 });

        const centerX = badgeX + badgeWidth / 2;
        const centerY = badgeY + AMOUNT_BADGE_HEIGHT / 2 + 1;
        const canRenderDigitTextures = [...label].every((digit) => this.digits.has(Number(digit)));

        if (canRenderDigitTextures) {
            this.renderDigitAmount(label, centerX, centerY, enabled);
            this.amountText.visible = false;
            return;
        }

        this.amountText.text = label;
        this.amountText.style = new TextStyle({
            fill: enabled ? 0xffffff : 0xcfcfcf,
            fontSize: label.length > 2 ? 24 : 30,
            fontWeight: "700",
        });
        this.amountText.position.set(centerX, centerY);
        this.amountText.alpha = enabled ? 1 : 0.7;
        this.amountText.visible = true;
    }
    private renderDigitAmount(label: string, centerX: number, centerY: number, enabled: boolean): void {
        const digitW = 22;
        const digitH = 34;
        const startX = centerX - ((label.length - 1) * digitW) / 2;

        for (let i = 0; i < label.length; i++) {
            const tex = this.digits.get(Number(label[i]));
            if (!tex) continue;
            const s = new PixiSprite(tex);
            s.anchor.set(0.5);
            s.width = digitW;
            s.height = digitH;
            s.position.set(startX + i * digitW, centerY);
            s.alpha = enabled ? 1 : 0.55;
            this.layer.addChild(s);
            this.amountDigitSprites.push(s);
        }
    }
    private renderStackColumn(cellX: number, cellY: number, ownerStackPower: number, canRenderStack: boolean) {
        // Clear previous vectors
        this.stackColumnGfx.clear();

        // Draw thin rectangles using Graphics (Pixi v8 API)
        const sixthStep = BOOK_SPELL_SIZE / 6;
        const barX = cellX + BOOK_STACK_BAR_X;
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
            const targetY = cellY + BOOK_ICON_OFFSET_Y + BOOK_SPELL_SIZE - barH - yShift;
            this.stackColumnGfx.rect(barX, targetY, barW, barH - 3).fill({ color: fillColor, alpha });
            stackIndex++;
            yShift += BOOK_SPELL_SIZE / 5;
        }
    }
    private renderHoverFrame(cellX: number, cellY: number, enabled: boolean): void {
        this.hoverFrameGfx.clear();
        if (!this.highlighted) return;

        const outerColor = enabled ? 0xf6d87c : 0x9a9a9a;
        const innerColor = enabled ? 0x5b3508 : 0x555555;

        this.hoverFrameGfx
            .rect(cellX - 6, cellY - 6, BOOK_CELL_SIZE + 12, BOOK_CELL_SIZE + 12)
            .stroke({ width: 5, color: outerColor, alpha: enabled ? 0.95 : 0.7 })
            .rect(cellX + 2, cellY + 2, BOOK_CELL_SIZE - 4, BOOK_CELL_SIZE - 4)
            .stroke({ width: 2, color: innerColor, alpha: enabled ? 0.85 : 0.65 });
    }
    private renderDisabledOverlay(xPos: number, yPos: number, disabled: boolean): void {
        this.disabledOverlayGfx.clear();
        if (!disabled) return;

        this.disabledOverlayGfx
            .rect(xPos, yPos, BOOK_SPELL_SIZE, BOOK_SPELL_SIZE)
            .fill({ color: 0x000000, alpha: 0.24 })
            .moveTo(xPos + 12, yPos + 12)
            .lineTo(xPos + BOOK_SPELL_SIZE - 12, yPos + BOOK_SPELL_SIZE - 12)
            .stroke({ width: 5, color: 0x111111, alpha: 0.48 });
    }
    public destroy(): void {
        this.clearAmountDigitSprites();
        this.stackColumnGfx.destroy();
        this.amountBadgeGfx.destroy();
        this.disabledOverlayGfx.destroy();
        this.hoverFrameGfx.destroy();
        this.amountText.destroy();
        this.bgSprite.destroy();
        this.iconSprite.destroy();
        this.titleSprite.destroy();
    }
}
