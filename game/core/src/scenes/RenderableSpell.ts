/*
 * -----------------------------------------------------------------------------
 * Pixi drop-in replacement for RenderableSpell (no WebGL Sprite/Shader needed).
 * -----------------------------------------------------------------------------
 */

import { Container, Graphics, Rectangle, Sprite as PixiSprite, Text, TextStyle, Texture } from "pixi.js";
import {
    AllAbilities,
    calculateSpellDamage,
    isOffensiveSpellMultiplier,
    fireforgedSwordPower,
    FireWallHelper,
    RESURRECTION_POWER_FACTOR,
    HoCConstants,
    HoCMath,
    ISpellParams,
    Spell,
    SpellMultiplierType,
    ToFactionType,
} from "@heroesofcrypto/common";
import { HOC_NUMERIC_GEORGIA_FONT_FAMILY } from "../fontFamilies";

export enum BookPosition {
    ONE = 1,
    TWO = 2,
    THREE = 3,
    FOUR = 4,
    FIVE = 5,
    SIX = 6,
}

// Coordinates are local to the centered 1536x1024 book texture (origin = book centre / spine).
// Measured off that art, each parchment page spans local x -451..-16 and +15..+453, and both pages
// run y -392..+355. Page centres are therefore ±234 (cell centre = X + CELL/2) with a shared
// vertical centre of -18. The cell column on each page and the 3-row stack are centred against
// those so the spells sit squarely on the parchment, not drifting left or hanging past the border.
// The wider book replaced the old square 1024x1024 one, which had its pages at ±206 / y -35.
const BOOK_POSITION_LEFT_X = -344; // centre -234 — mirrors the right page
const BOOK_POSITION_RIGHT_X = 124; // centre +234
const BOOK_POSITION_TOP_Y = -359; // top row so the 3-row stack is vertically centred on the page
const BOOK_POSITION_ROW_STEP = 230;
const BOOK_CELL_SIZE = 220;
const BOOK_CELL_OFFSET_X = 8; // nudge the scroll-like spell cell (drawn under each spell) right...
const BOOK_CELL_OFFSET_Y = -9; // ...and up a little
// The artwork is 6% larger than the original 120px square. Shift it by half the growth so its
// visual centre stays in exactly the same place inside the ornate frame.
const BOOK_SPELL_SIZE = 127.2;
const BOOK_ICON_OFFSET_X = 71.4;
const BOOK_ICON_OFFSET_Y = 34.4;
const BOOK_TITLE_MARGIN_X = 11;
const BOOK_TITLE_MARGIN_BOTTOM = 18;
// Literal stack rail cropped from the approved variant-2 mock-up. Its proportions and the normalized
// fill coordinates below come directly from that source image, so dynamic pips sit inside the five
// antique slots instead of approximating them with vector rectangles.
const BOOK_STACK_RAIL_X = 44;
const BOOK_STACK_RAIL_Y = 36;
const BOOK_STACK_RAIL_HEIGHT = 124;
const BOOK_STACK_RAIL_WIDTH = (BOOK_STACK_RAIL_HEIGHT * 75) / 490;
const BOOK_STACK_SLOT_STEP = BOOK_STACK_RAIL_HEIGHT / HoCConstants.MAX_UNIT_STACK_POWER;
const BOOK_STACK_FILL_WIDTH = BOOK_STACK_RAIL_WIDTH * 0.68;
const BOOK_STACK_FILL_HEIGHT = BOOK_STACK_SLOT_STEP * 0.74;
const BOOK_STACK_FILL_X = BOOK_STACK_RAIL_X + (BOOK_STACK_RAIL_WIDTH - BOOK_STACK_FILL_WIDTH) / 2;
const BOOK_STACK_FILL_BOTTOM_Y =
    BOOK_STACK_RAIL_Y +
    BOOK_STACK_SLOT_STEP * (HoCConstants.MAX_UNIT_STACK_POWER - 1) +
    (BOOK_STACK_SLOT_STEP - BOOK_STACK_FILL_HEIGHT) / 2;
// Keep the complete cast-count seal (including its wax edge and ribbon tail) inside the card frame.
const HOVER_FRAME_EXTRA_RIGHT = 58;
const SCHOOL_FRAME_ALPHA = 0.8;

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
const BOOK_CORNER_FRAME_PADDING = 6;
const OUTER_SCHOOL_CORNER_SIZE = 57.75;
const CARD_FRAME_TOP_OFFSET = 5;
const CARD_FRAME_HEIGHT = 204;
const HOVER_CARD_SCALE = 1.07;

const SPELL_CORNER_FRAME_TEXTURE_KEYS: Partial<Record<number, string>> = {
    [ToFactionType.Chaos]: "spell_corner_chaos_a",
    [ToFactionType.Nature]: "spell_corner_nature_b",
    [ToFactionType.Life]: "spell_corner_life_b",
};

/** Selected spellbook corner art for each playable magic school. */
export const getSpellCornerFrameTextureKey = (faction: number): string | undefined =>
    SPELL_CORNER_FRAME_TEXTURE_KEYS[faction];

export type DigitTextureMap = Map<number, Texture>;

export class PixiRenderableSpell extends Spell {
    /** One transform root lets hover scale the complete card as a single object. */
    private readonly cardContainer: Container;
    /** Visuals */
    private readonly bgSprite: PixiSprite;
    private readonly iconSprite: PixiSprite;
    /** Four detached school-specific corner ornaments rendered over the spell art. */
    private readonly cornerFrameSprites: readonly PixiSprite[];
    private readonly amountScrollSprite?: PixiSprite;
    private readonly innerFrameSprite?: PixiSprite;
    private readonly stackRailSprite?: PixiSprite;
    private readonly stackFillSprites: readonly PixiSprite[];
    private readonly stackFillGreenTexture?: Texture;
    private readonly stackFillRedTexture?: Texture;
    /**
     * Spell name drawn as TEXT rather than a pre-baked "<spell>_font" strip. Those strips had to be
     * hand-authored per spell, and a missing one silently dropped the whole spell from the book (the
     * constructor could not build without its texture) — which is exactly how Ash Moth shipped with an
     * empty spellbook. Rendering the name means a new spell needs no art beyond its icon.
     */
    private readonly titleText: Text;
    /** Column of stacks — drawn with Graphics for perf */
    private stackColumnGfx: Graphics;
    private amountBadgeGfx: Graphics;
    private disabledOverlayGfx: Graphics;
    private hoverFrameGfx: Graphics;
    /** Soft brown drop-shadow drawn behind the spell image (old-book look). */
    private iconShadowGfx: Graphics;
    private amountText: Text;
    private highlighted = false;
    private lastFrameRender?: { cellX: number; cellY: number; enabled: boolean };
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
            cornerFrame?: Texture;
            scrollBadge?: Texture;
            innerFrame?: Texture;
            stackRail?: Texture;
            stackFillGreen?: Texture;
            stackFillRed?: Texture;
        },
        iconTexture: Texture,
        _digits: DigitTextureMap,
    ) {
        super(spellParams);

        this.cardContainer = new Container();
        layer.addChild(this.cardContainer);
        this.bgSprite = new PixiSprite(textures.spell_cell_260);
        this.bgSprite.anchor.set(0, 0);

        this.iconSprite = new PixiSprite(iconTexture);
        this.iconSprite.anchor.set(0.5);

        if (textures.cornerFrame) {
            const source = textures.cornerFrame.source;
            // The artwork lives in four ~180px corner islands on a 512px transparent canvas. Cropping
            // literal halves made width changes mostly scale empty pixels, so the visible ornament barely
            // moved. Tight edge crops make OUTER_SCHOOL_CORNER_SIZE describe the ornament itself.
            const baseFrame = textures.cornerFrame.frame;
            const cropWidth = (baseFrame.width * 180) / 512;
            const cropHeight = (baseFrame.height * 180) / 512;
            const leftX = baseFrame.x;
            const rightX = baseFrame.x + baseFrame.width - cropWidth;
            const topY = baseFrame.y;
            const bottomY = baseFrame.y + baseFrame.height - cropHeight;
            this.cornerFrameSprites = [
                new PixiSprite(new Texture({ source, frame: new Rectangle(leftX, topY, cropWidth, cropHeight) })),
                new PixiSprite(new Texture({ source, frame: new Rectangle(rightX, topY, cropWidth, cropHeight) })),
                new PixiSprite(new Texture({ source, frame: new Rectangle(leftX, bottomY, cropWidth, cropHeight) })),
                new PixiSprite(new Texture({ source, frame: new Rectangle(rightX, bottomY, cropWidth, cropHeight) })),
            ];
        } else {
            this.cornerFrameSprites = [];
        }
        for (const corner of this.cornerFrameSprites) {
            corner.anchor.set(0.5);
            corner.visible = false;
        }
        if (textures.scrollBadge) {
            this.amountScrollSprite = new PixiSprite(textures.scrollBadge);
            this.amountScrollSprite.anchor.set(0.5);
            this.amountScrollSprite.visible = false;
        }
        if (textures.innerFrame) {
            this.innerFrameSprite = new PixiSprite(textures.innerFrame);
            this.innerFrameSprite.anchor.set(0, 0);
            this.innerFrameSprite.visible = false;
        }
        this.stackFillGreenTexture = textures.stackFillGreen;
        this.stackFillRedTexture = textures.stackFillRed;
        if (textures.stackRail) {
            this.stackRailSprite = new PixiSprite(textures.stackRail);
            this.stackRailSprite.anchor.set(0, 0);
            this.stackRailSprite.visible = false;
        }
        if (textures.stackFillGreen) {
            this.stackFillSprites = Array.from(
                { length: HoCConstants.MAX_UNIT_STACK_POWER },
                () => new PixiSprite(textures.stackFillGreen),
            );
            for (const fill of this.stackFillSprites) {
                fill.anchor.set(0, 0);
                fill.visible = false;
            }
        } else {
            this.stackFillSprites = [];
        }

        // Serif to match the aged-parchment spellbook; the previous strips were a bold serif too, so the
        // book keeps its look. Fitted to the cell width in renderOnPage rather than wrapped, so a long
        // name ("Spiritual Armor") shrinks instead of spilling out of its cell or clipping.
        this.titleText = new Text({
            text: spellParams.spellProperties.name,
            style: new TextStyle({
                fill: SPELL_TITLE_FILL,
                fontFamily: HOC_NUMERIC_GEORGIA_FONT_FAMILY,
                fontSize: 26,
                fontWeight: "800",
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

        this.cardContainer.addChild(
            // Glow first so it sits behind every part of the spell card.
            this.hoverFrameGfx,
            this.iconShadowGfx,
            this.bgSprite,
            ...(this.innerFrameSprite ? [this.innerFrameSprite] : []),
            this.iconSprite,
        );
        if (this.stackRailSprite) this.cardContainer.addChild(this.stackRailSprite);
        if (this.stackFillSprites.length) this.cardContainer.addChild(...this.stackFillSprites);
        if (this.cornerFrameSprites.length) {
            this.cardContainer.addChild(...this.cornerFrameSprites);
        }
        this.cardContainer.addChild(this.titleText, this.stackColumnGfx, this.disabledOverlayGfx);
        // The seal is intentionally the final visual layer: icon art, frame and hover content may never crop it.
        if (this.amountScrollSprite) this.cardContainer.addChild(this.amountScrollSprite);
        this.cardContainer.addChild(this.amountBadgeGfx, this.amountText);
    }
    /** Old API parity */
    public getSprite(): PixiSprite {
        return this.iconSprite;
    }
    public cleanupPagePosition(): void {
        this.xMin = this.xMax = this.yMin = this.yMax = 0;
        this.bgSprite.visible = false;
        this.iconSprite.visible = false;
        for (const corner of this.cornerFrameSprites) corner.visible = false;
        if (this.amountScrollSprite) this.amountScrollSprite.visible = false;
        if (this.innerFrameSprite) this.innerFrameSprite.visible = false;
        if (this.stackRailSprite) this.stackRailSprite.visible = false;
        for (const fill of this.stackFillSprites) fill.visible = false;
        this.titleText.visible = false;
        this.stackColumnGfx.clear();
        this.amountBadgeGfx.clear();
        this.disabledOverlayGfx.clear();
        this.hoverFrameGfx.clear();
        this.iconShadowGfx.clear();
        this.amountText.visible = false;
        this.highlighted = false;
        this.lastFrameRender = undefined;
        this.cardContainer.pivot.set(0, 0);
        this.cardContainer.position.set(0, 0);
        this.cardContainer.scale.set(1);
    }
    public setHighlighted(highlighted: boolean): void {
        if (this.highlighted === highlighted) return;
        this.highlighted = highlighted;
        if (this.lastFrameRender) {
            this.renderBaseCardFrame(
                this.lastFrameRender.cellX,
                this.lastFrameRender.cellY,
                this.lastFrameRender.enabled,
            );
        }
    }
    public syncAmount(amountRemaining: number): void {
        this.amountRemaining = Math.max(0, Math.floor(amountRemaining));
    }
    public canUse(ownerStackPower: number): boolean {
        return this.amountRemaining > 0 && ownerStackPower >= this.getMinimalCasterStackPower();
    }
    /**
     * @param casterMagicDamageBonusPercentage the caster's total magic-damage bonus (Empower augment/spell
     *        plus Sylvan Focus). Every damage figure printed below is raised by it through the same helpers
     *        the engine uses, so the card cannot promise a different number from the cast.
     */
    public getHoverInfo(
        ownerStackPower: number,
        casterAmountAlive: number,
        casterCumulativeMaxHp: number,
        casterLuck?: number,
        casterMagicDamageBonusPercentage = 0,
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
            const burn = FireWallHelper.fireWallBurnPercentage(casterMagicDamageBonusPercentage);
            return [...lines, ...this.getDesc().map((line) => line.replace(/\{\}/g, burn.toString()))];
        }
        // Fireforged Sword grants a percentage of extra (burning) damage, raised by Empower like every other
        // magic source. It is a NO_MULTIPLIER spell, so it never reached the caster-scaled branch below and
        // used to print an empty placeholder — "Adds % of additional damage".
        if (this.getName() === "Fireforged Sword") {
            const bonus = fireforgedSwordPower(this.getPower(), casterMagicDamageBonusPercentage);
            return [...lines, ...this.getDesc().map((line) => line.replace(/\{\}/g, bonus.toString()))];
        }

        // Fill the description's "{}" placeholder with the caster-scaled value (the actual hp healed,
        // wolves summoned, etc.), matching how the legacy spell book rendered it.
        //
        // Default to the spell's OWN power so a flat NO_MULTIPLIER spell still prints its number. Without
        // this the placeholder resolved to an empty string and the card read "Adds % to all magic damage"
        // — every existing flat spell hid the gap by hardcoding the figure in its text instead of using a
        // placeholder, so Empower was the first to expose it.
        let replaceBy = this.getPower() ? this.getPower().toString() : "";
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
        } else if (isOffensiveSpellMultiplier(this.getMultiplierType())) {
            // Offensive spells: the card shows the FINISHED damage, not the formula, and it comes from the
            // engine's own helper so the page can never promise a number the cast will not deal. Which shape
            // it scales by (head-count alone for the Battle Mage's, head-count x stack power for the Magic
            // Dragon's) is the spell's own business — the helper reads it off the multiplier type.
            // Pre-resistance by definition: the target is not known until the player aims.
            replaceBy = calculateSpellDamage(
                this.getMultiplierType(),
                this.getPower(),
                casterAmountAlive,
                ownerStackPower,
                casterMagicDamageBonusPercentage,
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

        // Hovering anywhere inside the spell card lights the whole card, not only the icon square.
        const b = this.hoverFrameGfx.getBounds();
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

        // Reset before laying out a reused card; renderBaseCardFrame reapplies the centred hover scale.
        this.cardContainer.pivot.set(0, 0);
        this.cardContainer.position.set(0, 0);
        this.cardContainer.scale.set(1);

        // Background cell — the scroll-like plate that sits under each spell.
        this.bgSprite.width = BOOK_CELL_SIZE;
        this.bgSprite.height = BOOK_CELL_SIZE;
        this.bgSprite.x = cellX + BOOK_CELL_OFFSET_X;
        this.bgSprite.y = cellY + BOOK_CELL_OFFSET_Y;

        // Icon (main sprite)
        this.iconSprite.width = BOOK_SPELL_SIZE;
        this.iconSprite.height = BOOK_SPELL_SIZE;
        this.iconSprite.position.set(iconX + BOOK_SPELL_SIZE / 2, iconY + BOOK_SPELL_SIZE / 2);
        if (this.cornerFrameSprites.length) {
            // School/race ornaments now belong to the complete card, not to the spell icon itself.
            const frameLeft = cellX - 5;
            const frameTop = cellY + CARD_FRAME_TOP_OFFSET;
            const frameWidth = BOOK_CELL_SIZE + HOVER_FRAME_EXTRA_RIGHT + 10;
            const frameHeight = CARD_FRAME_HEIGHT;
            const inset = OUTER_SCHOOL_CORNER_SIZE / 2 - BOOK_CORNER_FRAME_PADDING;
            const positions = [
                [frameLeft + inset, frameTop + inset],
                [frameLeft + frameWidth - inset, frameTop + inset],
                [frameLeft + inset, frameTop + frameHeight - inset],
                [frameLeft + frameWidth - inset, frameTop + frameHeight - inset],
            ] as const;
            this.cornerFrameSprites.forEach((corner, index) => {
                corner.width = OUTER_SCHOOL_CORNER_SIZE;
                corner.height = OUTER_SCHOOL_CORNER_SIZE;
                corner.position.set(positions[index][0], positions[index][1]);
            });
        }

        // Hover rect cache (icon bounds)
        this.xMin = iconX;
        this.xMax = cellX + BOOK_CELL_SIZE + HOVER_FRAME_EXTRA_RIGHT;
        this.yMin = iconY;
        this.yMax = iconY + BOOK_SPELL_SIZE;

        // Keep long spell names inside the cell instead of matching the smaller icon width.
        // Fit-to-width: scale down only (never up), so short names keep the designed size and long ones
        // stay inside their cell. Height is whatever the font needs, bottom-aligned like the old strip.
        const outerFrameWidth = BOOK_CELL_SIZE + HOVER_FRAME_EXTRA_RIGHT + 10;
        const titleMaxWidth = outerFrameWidth - BOOK_TITLE_MARGIN_X * 2;
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
        this.titleText.x = cellX - 5 + outerFrameWidth / 2;
        this.titleText.y = cellY + BOOK_CELL_SIZE - BOOK_TITLE_MARGIN_BOTTOM - titleHeight;

        // Visibility + alpha rules
        const hasScrolls = this.amountRemaining > 0;
        const hasStackPower = ownerStackPower >= this.getMinimalCasterStackPower();
        const enabled = hasScrolls && hasStackPower;

        this.bgSprite.alpha = enabled ? 1 : 0.62;
        this.iconSprite.alpha = enabled ? 1 : 0.42;
        for (const corner of this.cornerFrameSprites) {
            // Keep the school ornament visible without letting it overpower the spell art.
            corner.alpha = enabled ? SCHOOL_FRAME_ALPHA : SCHOOL_FRAME_ALPHA * 0.42;
            corner.tint = enabled ? 0xffffff : 0x807867;
        }
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
        if (this.innerFrameSprite) {
            this.innerFrameSprite.position.set(cellX + 4, cellY + 14);
            this.innerFrameSprite.width = 270;
            this.innerFrameSprite.height = 160;
            this.innerFrameSprite.alpha = enabled ? 0.72 : 0.34;
            this.innerFrameSprite.tint = enabled ? 0xffffff : 0x8c8274;
            this.innerFrameSprite.visible = true;
        }
        this.iconSprite.visible = true;
        for (const corner of this.cornerFrameSprites) corner.visible = true;
        this.titleText.visible = true;

        this.iconShadowGfx.clear();
        this.renderDisabledOverlay(iconX, iconY, !enabled);
        this.renderBaseCardFrame(cellX, cellY, enabled);

        // Number of scrolls remaining.
        this.renderAmount(cellX, cellY, enabled);

        // Stack column
        this.renderStackColumn(cellX, cellY, ownerStackPower, hasScrolls);
    }
    private renderAmount(cellX: number, cellY: number, enabled: boolean): void {
        const label = String(this.amountRemaining);
        // Exact tall parchment scroll cropped from the approved variant-2 mock-up. Its original sample
        // digit was removed from the bitmap; the live amount is centred here as text.
        const frameRight = cellX - 5 + BOOK_CELL_SIZE + HOVER_FRAME_EXTRA_RIGHT + 10;
        const centerX = frameRight - 51.5;
        const centerY = cellY + 98;
        const visualAlpha = enabled ? 0.9 : 0.5;

        this.amountBadgeGfx.clear();
        if (this.amountScrollSprite) {
            this.amountScrollSprite.position.set(centerX, centerY);
            this.amountScrollSprite.width = 40.5;
            this.amountScrollSprite.height = 134;
            this.amountScrollSprite.alpha = visualAlpha;
            this.amountScrollSprite.tint = enabled ? 0xffffff : 0x8c8274;
            this.amountScrollSprite.visible = true;
        }

        this.amountText.text = label;
        this.amountText.style = new TextStyle({
            fill: enabled ? SPELL_TITLE_FILL : SPELL_TITLE_FILL_DISABLED,
            fontFamily: HOC_NUMERIC_GEORGIA_FONT_FAMILY,
            fontSize: label.length > 2 ? 19 : 27,
            fontWeight: "700",
        });
        this.amountText.position.set(centerX, centerY + 1);
        this.amountText.alpha = enabled ? 1 : 0.7;
        this.amountText.visible = true;
    }
    private renderStackColumn(cellX: number, cellY: number, ownerStackPower: number, canRenderStack: boolean) {
        this.stackColumnGfx.clear();

        const useGreen = ownerStackPower >= this.getMinimalCasterStackPower();
        const fillTexture = useGreen ? this.stackFillGreenTexture : this.stackFillRedTexture;
        const alpha = canRenderStack ? 1 : 0.4;

        if (this.stackRailSprite && fillTexture && this.stackFillSprites.length) {
            this.stackRailSprite.position.set(cellX + BOOK_STACK_RAIL_X, cellY + BOOK_STACK_RAIL_Y);
            this.stackRailSprite.width = BOOK_STACK_RAIL_WIDTH;
            this.stackRailSprite.height = BOOK_STACK_RAIL_HEIGHT;
            this.stackRailSprite.alpha = alpha;
            this.stackRailSprite.tint = canRenderStack ? 0xffffff : 0x8c8274;
            this.stackRailSprite.visible = true;

            this.stackFillSprites.forEach((fill, slotIndex) => {
                const isFilled = slotIndex < this.getMinimalCasterStackPower();
                fill.texture = fillTexture;
                fill.position.set(
                    cellX + BOOK_STACK_FILL_X,
                    cellY + BOOK_STACK_FILL_BOTTOM_Y - slotIndex * BOOK_STACK_SLOT_STEP,
                );
                fill.width = BOOK_STACK_FILL_WIDTH;
                fill.height = BOOK_STACK_FILL_HEIGHT;
                fill.alpha = alpha;
                fill.visible = isFilled;
            });
            return;
        }

        // Texture-free fallback for headless tests and the first HMR frame while a new asset loads.
        const barX = cellX + BOOK_STACK_FILL_X;
        const barW = BOOK_STACK_FILL_WIDTH;
        const barH = BOOK_STACK_RAIL_HEIGHT / HoCConstants.MAX_UNIT_STACK_POWER;

        for (let slotIndex = 0; slotIndex < HoCConstants.MAX_UNIT_STACK_POWER; slotIndex++) {
            const targetY = cellY + BOOK_STACK_RAIL_Y + BOOK_STACK_RAIL_HEIGHT - barH - slotIndex * barH;
            this.stackColumnGfx
                .rect(barX, targetY, barW, barH - 3)
                .fill({ color: 0x2d2417, alpha: 0.12 })
                .stroke({ width: 1.5, color: 0x6b5734, alpha: 0.32 });
        }

        const fillColor = useGreen ? 0x00aa55 : 0xaa0033; // approximate tint to your old textures

        // Draw minimal caster stack power blocks (one per required stack)
        let stackIndex = 1;
        while (stackIndex <= this.getMinimalCasterStackPower()) {
            const targetY = cellY + BOOK_STACK_RAIL_Y + BOOK_STACK_RAIL_HEIGHT - barH - (stackIndex - 1) * barH;
            this.stackColumnGfx.rect(barX, targetY, barW, barH - 3).fill({ color: fillColor, alpha });
            stackIndex++;
        }
    }
    /** Permanent option-2 frame: exact detached antique corners from the approved mockup. */
    private renderBaseCardFrame(cellX: number, cellY: number, enabled: boolean): void {
        this.lastFrameRender = { cellX, cellY, enabled };
        const cardLeft = cellX - 5;
        const cardTop = cellY + CARD_FRAME_TOP_OFFSET;
        const cardWidth = BOOK_CELL_SIZE + HOVER_FRAME_EXTRA_RIGHT + 10;
        const cardCenterX = cardLeft + cardWidth / 2;
        const cardCenterY = cardTop + CARD_FRAME_HEIGHT / 2;
        this.cardContainer.pivot.set(cardCenterX, cardCenterY);
        this.cardContainer.position.set(cardCenterX, cardCenterY);
        this.cardContainer.scale.set(this.highlighted && enabled ? HOVER_CARD_SCALE : 1);

        const g = this.hoverFrameGfx;
        g.clear();
        const left = cardLeft;
        const top = cardTop;
        const width = cardWidth;
        const height = CARD_FRAME_HEIGHT;
        const alphaScale = enabled ? 1 : 0.52;

        g.roundRect(left + 3, top + 4, width, height, 7).fill({ color: 0x24180e, alpha: 0.065 * alphaScale });
        g.roundRect(left, top, width, height, 7).fill({ color: 0xe4c58b, alpha: 0.025 * alphaScale });

        // Hover belongs to the complete spell card. Keep the icon geometry fixed and light the whole
        // parchment area plus its boundary instead of making the artwork jump in size.
        if (this.highlighted && enabled) {
            g.roundRect(left, top, width, height, 7).fill({ color: 0xffdf86, alpha: 0.11 });
            g.roundRect(left - 2, top - 2, width + 4, height + 4, 9).stroke({
                width: 2,
                color: 0xffe6a0,
                alpha: 0.72,
            });
        }

        // Fine double parchment boundary from the approved option, running continuously between corners.
        g.rect(left + 2, top + 2, width - 4, height - 4).stroke({
            width: 1.2,
            color: 0x8b6a39,
            alpha: 0.42 * alphaScale,
        });
        g.rect(left + 4, top + 4, width - 8, height - 8).stroke({
            width: 0.7,
            color: 0xe0c48d,
            alpha: 0.52 * alphaScale,
        });

        // Transparent option-4 title ornaments. Their outer endpoints stay fixed at the approved red
        // guides; their inner endpoints follow the measured title width so no spell name can overlap them.
        let renderedTitleWidth = 92;
        let renderedTitleHeight = BOOK_TITLE_NOMINAL_HEIGHT;
        try {
            renderedTitleWidth = this.titleText.width || renderedTitleWidth;
            renderedTitleHeight = this.titleText.height || renderedTitleHeight;
        } catch {
            // The nominal dimensions above keep headless/font-loading fallback deterministic.
        }
        const ruleY = this.titleText.y + renderedTitleHeight * 0.53;
        const titleCenterX = this.titleText.x;
        const titleGap = 9;
        const leftStart = left + 36;
        const leftEnd = titleCenterX - renderedTitleWidth / 2 - titleGap;
        const rightStart = titleCenterX + renderedTitleWidth / 2 + titleGap;
        const rightEnd = left + width - 36;
        const drawRule = (startX: number, endX: number, diamondX: number): void => {
            if (endX - startX < 7) return;
            g.moveTo(startX, ruleY)
                .lineTo(endX, ruleY)
                .stroke({
                    width: 0.85,
                    color: 0x755326,
                    alpha: 0.72 * alphaScale,
                });
            g.poly([diamondX, ruleY - 2.2, diamondX + 2.2, ruleY, diamondX, ruleY + 2.2, diamondX - 2.2, ruleY]).fill({
                color: 0x805c2d,
                alpha: 0.82 * alphaScale,
            });
        };
        drawRule(leftStart, leftEnd, Math.max(leftStart + 4, leftEnd - 10));
        drawRule(rightStart, rightEnd, Math.min(rightEnd - 4, rightStart + 10));

        // The old generic metal corners are deliberately retired. The school/race frame sprite is
        // positioned around this same outer boundary in renderOnPage.
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
        this.stackColumnGfx.destroy();
        this.amountBadgeGfx.destroy();
        this.disabledOverlayGfx.destroy();
        this.hoverFrameGfx.destroy();
        this.iconShadowGfx.destroy();
        this.amountText.destroy();
        this.bgSprite.destroy();
        this.iconSprite.destroy();
        for (const corner of this.cornerFrameSprites) {
            corner.texture.destroy(false);
            corner.destroy();
        }
        this.amountScrollSprite?.destroy();
        this.innerFrameSprite?.destroy();
        this.stackRailSprite?.destroy();
        for (const fill of this.stackFillSprites) fill.destroy();
        this.titleText.destroy();
        this.cardContainer.destroy();
    }
}
