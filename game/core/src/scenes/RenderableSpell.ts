/*
 * -----------------------------------------------------------------------------
 * Pixi drop-in replacement for RenderableSpell (no WebGL Sprite/Shader needed).
 * -----------------------------------------------------------------------------
 */

import { Container, Graphics, Sprite as PixiSprite, Text, TextStyle, Texture } from "pixi.js";
import {
    AllAbilities,
    calculateStackPoweredSpellDamage,
    fireforgedSwordPower,
    FireWallHelper,
    RESURRECTION_POWER_FACTOR,
    HoCConstants,
    HoCMath,
    ISpellParams,
    Spell,
    SpellMultiplierType,
} from "@heroesofcrypto/common";

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
const BOOK_CELL_OFFSET_X = 8; // nudge the scroll-like spell cell (drawn under each spell) right...
const BOOK_CELL_OFFSET_Y = -9; // ...and up a little
const BOOK_SPELL_SIZE = 140;
const BOOK_ICON_OFFSET_X = 40;
const BOOK_ICON_OFFSET_Y = 28;
const BOOK_TITLE_MARGIN_X = 11;
const BOOK_TITLE_MARGIN_BOTTOM = 8;
const BOOK_STACK_BAR_X = 14;
const AMOUNT_BADGE_HEIGHT = 38;

// "Old book" styling: a gentle warm/sepia multiply tint so the art and name read as ink on aged
// parchment (not stark white), plus a soft brown shadow cast under each spell image so it looks like
// it rests on the page rather than floating.
const AGED_ICON_TINT = 0xf4ead6;
// Fallback line height used when text measurement is unavailable (headless runner / webfont not yet
// resolved) — close to the rendered height of the title at its designed size.
const BOOK_TITLE_NOMINAL_HEIGHT = 32;
// Spell-name text. Dark gold on the aged-parchment card, brightening on hover and dulling to a faded
// brown when the spell can't be cast. Set as the TEXT FILL (not a tint of white) so the ink colour is the
// real thing rather than a multiply that washes out on the lighter parts of the card.
const SPELL_TITLE_FILL = 0x4a3410;
const SPELL_TITLE_FILL_HOVER = 0x6d4d18;
const SPELL_TITLE_FILL_DISABLED = 0x3a3024;
const SPELL_SHADOW_COLOR = 0x2b1c0b;

export type DigitTextureMap = Map<number, Texture>;

export class PixiRenderableSpell extends Spell {
    /** Parent layer where all elements get attached */
    private readonly layer: Container;
    /** Visuals */
    private readonly bgSprite: PixiSprite;
    private readonly iconSprite: PixiSprite;
    /**
     * Spell name drawn as TEXT rather than a pre-baked "<spell>_font" strip. Those strips had to be
     * hand-authored per spell, and a missing one silently dropped the whole spell from the book (the
     * constructor could not build without its texture) — which is exactly how Ash Moth shipped with an
     * empty spellbook. Rendering the name means a new spell needs no art beyond its icon.
     */
    private readonly titleText: Text;
    /** Digit textures 0..9 (and optionally -1 for special glyph) */
    private readonly digits: DigitTextureMap;
    /** Runtime digit sprites that show "amountRemaining" */
    private amountDigitSprites: PixiSprite[] = [];
    /** Column of stacks — drawn with Graphics for perf */
    private stackColumnGfx: Graphics;
    private amountBadgeGfx: Graphics;
    private disabledOverlayGfx: Graphics;
    private hoverFrameGfx: Graphics;
    /** Soft brown drop-shadow drawn behind the spell image (old-book look). */
    private iconShadowGfx: Graphics;
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
        digits: DigitTextureMap,
    ) {
        super(spellParams);

        this.layer = layer;
        this.digits = digits;

        this.bgSprite = new PixiSprite(textures.spell_cell_260);
        this.bgSprite.anchor.set(0, 0);

        this.iconSprite = new PixiSprite(iconTexture);
        this.iconSprite.anchor.set(0, 0);

        // Serif to match the aged-parchment spellbook; the previous strips were a bold serif too, so the
        // book keeps its look. Fitted to the cell width in renderOnPage rather than wrapped, so a long
        // name ("Spiritual Armor") shrinks instead of spilling out of its cell or clipping.
        this.titleText = new Text({
            text: spellParams.spellProperties.name,
            style: new TextStyle({
                fill: SPELL_TITLE_FILL,
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: 26,
                fontWeight: "700",
                align: "center",
            }),
        });
        this.titleText.anchor.set(0.5, 0);

        this.bgSprite.visible = false;
        this.iconSprite.visible = false;
        this.titleText.visible = false;

        this.stackColumnGfx = new Graphics();
        this.amountBadgeGfx = new Graphics();
        this.disabledOverlayGfx = new Graphics();
        this.hoverFrameGfx = new Graphics();
        this.iconShadowGfx = new Graphics();
        this.amountText = new Text({
            text: "",
            style: new TextStyle({ fill: 0xffffff, fontSize: 30, fontWeight: "700" }),
        });
        this.amountText.anchor.set(0.5);
        this.amountText.visible = false;

        this.layer.addChild(
            // Shadow first so it sits behind the spell image it's cast from.
            this.iconShadowGfx,
            this.bgSprite,
            this.iconSprite,
            this.titleText,
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
        this.titleText.visible = false;
        for (const s of this.amountDigitSprites) {
            s.parent?.removeChild(s);
            s.destroy();
        }
        this.amountDigitSprites = [];
        this.stackColumnGfx.clear();
        this.amountBadgeGfx.clear();
        this.disabledOverlayGfx.clear();
        this.hoverFrameGfx.clear();
        this.iconShadowGfx.clear();
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
    /**
     * @param casterEmpowerPercentage the caster team's Empower Augment (0 when unbought). Every damage figure
     *        printed below is raised by it, from the same helpers the engine deals with — an Empowered card
     *        that still promised the base number would be exactly the "card says 152, cast lands 163" bug the
     *        stack-powered helper exists to prevent.
     */
    public getHoverInfo(
        ownerStackPower: number,
        casterAmountAlive: number,
        casterCumulativeMaxHp: number,
        casterLuck?: number,
        casterEmpowerPercentage = 0,
    ): string[] {
        const lines = [this.getName(), `Scrolls: ${this.amountRemaining}`];
        if (this.amountRemaining <= 0) {
            lines.push("No scrolls left");
        }
        const minimalStackPower = this.getMinimalCasterStackPower();
        if (ownerStackPower < minimalStackPower) {
            lines.push(`Requires stack power ${minimalStackPower}`);
        }
        // Craft's per-ally outcome chances shift with the caster's luck, so show the exact calculated
        // percentages instead of the static blurb (single source of truth: getCraftChances).
        if (this.getName() === "Craft" && casterLuck !== undefined) {
            const c = AllAbilities.getCraftChances(casterLuck);
            return [
                ...lines,
                "Craft allies in a 2x2 area. Each ally:",
                `Double Attack: ${c.double}%`,
                `Frozen weapon: ${c.frozen}%`,
                `Stun: ${c.stun}%`,
                `Nothing: ${c.nothing}%`,
            ];
        }
        // Armor Rune / Weapon: the "{}" in the desc is the applied buff's running total (filled per-unit in
        // the Buffs section), not a cast-time value — show a clean spell blurb here instead of an empty "+ armor".
        if (this.getName() === "Armor Rune" || this.getName() === "Weapon Rune") {
            const stat = this.getName() === "Armor Rune" ? "armor" : "attack";
            return [...lines, `50% chance per cast to add +1 ${stat}.`, "The bonus stacks on the target."];
        }
        // Magic Mirror is stack-powered and luck-scaled, so the card must show what the holder will ACTUALLY
        // reflect (15/30/45/60/75 by stack, plus luck) rather than the flat configured 75. Mirrors the
        // engine's getMagicMirrorPower exactly — the two must never disagree about the promised number.
        if (this.getName() === "Magic Mirror" || this.getName() === "Mass Magic Mirror") {
            const stack = Math.max(0, Math.min(HoCConstants.MAX_UNIT_STACK_POWER, ownerStackPower));
            const reflected = Math.max(
                0,
                Math.min(
                    100,
                    Math.floor((this.getPower() / HoCConstants.MAX_UNIT_STACK_POWER) * stack + (casterLuck ?? 0)),
                ),
            );
            return [...lines, ...this.getDesc().map((line) => line.replace(/\{\}/g, reflected.toString()))];
        }

        // Fire Wall burns a share of whatever walks into it, and the share is fixed when the wall is LIT —
        // so the card prints the Empower-raised percentage the cast will bake into the flames.
        if (this.getName() === "Fire Wall") {
            const burn = FireWallHelper.fireWallBurnPercentage(casterEmpowerPercentage);
            return [...lines, ...this.getDesc().map((line) => line.replace(/\{\}/g, burn.toString()))];
        }
        // Fireforged Sword grants a percentage of extra (burning) damage, raised by Empower like every other
        // magic source. It is a NO_MULTIPLIER spell, so it never reached the caster-scaled branch below and
        // used to print an empty placeholder — "Adds % of additional damage".
        if (this.getName() === "Fireforged Sword") {
            const bonus = fireforgedSwordPower(this.getPower(), casterEmpowerPercentage);
            return [...lines, ...this.getDesc().map((line) => line.replace(/\{\}/g, bonus.toString()))];
        }

        // Fill the description's "{}" placeholder with the caster-scaled value (the actual hp healed,
        // wolves summoned, etc.), matching how the legacy spell book rendered it.
        let replaceBy = "";
        if (this.getMultiplierType() === SpellMultiplierType.UNIT_AMOUNT) {
            replaceBy = casterAmountAlive.toString();
        } else if (this.getMultiplierType() === SpellMultiplierType.UNIT_AMOUNT_POWER) {
            replaceBy = Math.ceil(casterAmountAlive * this.getPower()).toString();
        } else if (this.getMultiplierType() === SpellMultiplierType.UNIT_CUMULATIVE_MAX_HP) {
            // Resurrection is the only spell on this multiplier, and its budget is the caster's cumulative
            // max hp scaled by RESURRECTION_POWER_FACTOR — the same figure the cast spends. Printing the
            // bare cumulative hp understated the card by a third once that factor landed. Holy Cross scales
            // it further at cast time; that is artifact-dependent and deliberately not promised here.
            replaceBy = Math.floor(casterCumulativeMaxHp * RESURRECTION_POWER_FACTOR).toString();
        } else if (this.getMultiplierType() === SpellMultiplierType.UNIT_AMOUNT_STACK_POWER) {
            // Offensive spells (Fire Strike / Meteorite): the card shows the FINISHED damage, not the formula,
            // and it comes from the engine's own helper so the page can never promise a number the cast will
            // not deal. Pre-resistance by definition — the target is not known until the player aims.
            replaceBy = calculateStackPoweredSpellDamage(
                this.getPower(),
                casterAmountAlive,
                ownerStackPower,
                casterEmpowerPercentage,
            ).toString();
        }
        const desc = this.getDesc().map((descStr) => descStr.replace(/\{\}/g, replaceBy));
        return [...lines, ...desc];
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

        // Background cell — the scroll-like plate that sits under each spell.
        this.bgSprite.width = BOOK_CELL_SIZE;
        this.bgSprite.height = BOOK_CELL_SIZE;
        this.bgSprite.x = cellX + BOOK_CELL_OFFSET_X;
        this.bgSprite.y = cellY + BOOK_CELL_OFFSET_Y;

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
        // Fit-to-width: scale down only (never up), so short names keep the designed size and long ones
        // stay inside their cell. Height is whatever the font needs, bottom-aligned like the old strip.
        const titleMaxWidth = BOOK_CELL_SIZE - BOOK_TITLE_MARGIN_X * 2;
        this.titleText.scale.set(1);
        // Reading .width/.height MEASURES the text, which needs a canvas 2D context. That is missing in a
        // headless test runner and can also fail in a browser before the webfont resolves. Neither is a
        // reason to lose the spellbook: fall back to unscaled, bottom-aligned by a nominal line height, so
        // the name still renders and only the fit-to-width refinement is skipped.
        let titleHeight = BOOK_TITLE_NOMINAL_HEIGHT;
        try {
            const naturalWidth = this.titleText.width || 1;
            if (naturalWidth > titleMaxWidth) {
                this.titleText.scale.set(titleMaxWidth / naturalWidth);
            }
            titleHeight = this.titleText.height || BOOK_TITLE_NOMINAL_HEIGHT;
        } catch {
            this.titleText.scale.set(1);
        }
        this.titleText.x = cellX + BOOK_CELL_SIZE / 2;
        this.titleText.y = cellY + BOOK_CELL_SIZE - BOOK_TITLE_MARGIN_BOTTOM - titleHeight;

        // Visibility + alpha rules
        const hasScrolls = this.amountRemaining > 0;
        const hasStackPower = ownerStackPower >= this.getMinimalCasterStackPower();
        const enabled = hasScrolls && hasStackPower;

        this.bgSprite.alpha = enabled ? 1 : 0.62;
        this.iconSprite.alpha = enabled ? 1 : 0.42;
        this.titleText.alpha = enabled ? 1 : 0.42;
        // Warm/sepia multiply so art + name look inked on aged parchment; hover stays the brighter gold.
        this.bgSprite.tint = enabled ? (this.highlighted ? 0xfff1bf : 0xffffff) : 0x858585;
        this.iconSprite.tint = enabled ? (this.highlighted ? 0xfff7cc : AGED_ICON_TINT) : 0x7a6f55;
        // Recolour the ink itself; tinting would multiply the fill and mud the gold.
        this.titleText.style.fill = enabled
            ? this.highlighted
                ? SPELL_TITLE_FILL_HOVER
                : SPELL_TITLE_FILL
            : SPELL_TITLE_FILL_DISABLED;

        // The scroll-like background plate under each spell is intentionally hidden — only the icon and
        // title show on the book page.
        this.bgSprite.visible = false;
        this.iconSprite.visible = true;
        this.titleText.visible = true;

        this.renderIconShadow(iconX, iconY, enabled);
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
    /**
     * Soft brown shadow under the spell image, cast down-right, so each spell reads as resting on the
     * old parchment page instead of floating. Stacked translucent rounded squares fake a cheap blur.
     */
    private renderIconShadow(iconX: number, iconY: number, enabled: boolean): void {
        this.iconShadowGfx.clear();
        const size = BOOK_SPELL_SIZE;
        const cx = iconX + size / 2 + 6;
        const cy = iconY + size / 2 + 8;
        const baseAlpha = enabled ? 1 : 0.5;
        const layers = [
            { grow: 14, alpha: 0.1 },
            { grow: 8, alpha: 0.14 },
            { grow: 3, alpha: 0.2 },
        ];
        for (const l of layers) {
            const half = size / 2 + l.grow;
            this.iconShadowGfx
                .roundRect(cx - half, cy - half, half * 2, half * 2, 18)
                .fill({ color: SPELL_SHADOW_COLOR, alpha: l.alpha * baseAlpha });
        }
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
        this.iconShadowGfx.destroy();
        this.amountText.destroy();
        this.bgSprite.destroy();
        this.iconSprite.destroy();
        this.titleText.destroy();
    }
}
