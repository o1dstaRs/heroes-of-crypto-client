// game/core/src/overlays/UnitsOverlay.ts
import {
    Application,
    Container,
    Rectangle,
    Text,
    TextStyle,
    Texture,
    Graphics,
    Sprite,
    Ticker,
    type FederatedPointerEvent,
    type FederatedWheelEvent,
} from "pixi.js";

import { unitToTextureName, TextureType } from "../pixi/PixiUnitsFactory";
import { UnitChip } from "./UnitChip";

import { images } from "../imageAssets";
import { resolveCreaturePortraitVisual } from "../ui/creaturePortraitVisual";
import { creatureTypePresentation } from "../ui/creatureTypePresentation";
import { UNIT_ID_TO_NAME, UNIT_NAME_TO_ID } from "../ui/unit_ui_constants";

import {
    LevelBuckets as CommonLevelBuckets,
    getCreaturesOf,
    CreatureId,
    FactionType,
    FactionVals,
    ToFactionName,
    UnitProperties,
    TeamVals,
    HoCConfig,
} from "@heroesofcrypto/common";
import type { UnitLevelId } from "@heroesofcrypto/common";
import { BASE_UNIT_STACK_TO_SPAWN_EXP } from "@/statics";
import { HOC_NUMERIC_FONT_FAMILY } from "../fontFamilies";
import { boardFitHeight, boardFitWidth } from "../pixi/boardFit";
import { BATTLEFIELD_ARTWORK, battlefieldArtworkLayout } from "./sandbox/BattlefieldVisualGrid";

/** The app's own stack — same as style.scss's <body> rule and the board labels in RenderableUnit. */
const OVERLAY_FONT_FAMILY = HOC_NUMERIC_FONT_FAMILY;
/** Placeholder size only; layout() sets the real one from the row height on every resize. */
const OVERLAY_LEVEL_LABEL_BASE_SIZE = 24;
/** L1..L4 labels are intentionally 13% larger than the original plate-relative sizing. */
const LEVEL_LABEL_SIZE_FACTOR = 1.13;
/** Distance between the L and its digit, expressed in em so it follows responsive label sizing. */
const LEVEL_LABEL_LETTER_SPACING_FACTOR = 0.18;

/** Collapse-toggle side, as a fraction of a board cell: 37.5% larger than the former round medallion. */
export const TOGGLE_BUTTON_CELL_FRACTION = 0.88;
const TOGGLE_CLOSED_SCALE = 1.3;
/** Start the portraits just beyond the level plates; the former 1.5-cell rail left a wide dead strip. */
export const CREATURE_GRID_START_CELL_FRACTION = 1.08;
/** A restrained but clearly visible gutter between cards in the two-row expanded roster. */
export const EXPANDED_CARD_GAP_CELL_FRACTION = 0.075;
/** L1/L2 contain eight cards per row; sparse L3/L4 rosters must not upscale beyond that card size. */
export const EXPANDED_ROSTER_REFERENCE_COLUMNS = 8;

/** The Pixi preload map is keyed by asset name while the shared portrait recipe exposes final URLs. */
const IMAGE_URL_TO_KEY = new Map<string, string>(Object.entries(images).map(([key, url]) => [url, key]));
const ROSTER_ATTACK_TYPE_ICON_KEY = {
    MELEE: "pick_attack_melee_silver",
    RANGE: "pick_attack_ranged_silver",
    MAGIC: "pick_attack_magic_silver",
} as const;
const ROSTER_MOVEMENT_TYPE_ICON_KEY = {
    WALK: "pick_movement_walk_silver",
    FLY: "pick_movement_fly_silver",
} as const;

/** Draft cards use this exact portrait ratio (190 × 256). The sandbox roster keeps it too. */
export const PICK_CARD_ASPECT = 190 / 256;

/**
 * Approved non-Nature cutouts that face into the roster after crop-first mirroring. Nature remains a
 * faction-wide rule; these named exceptions come from the user's L2–L4 visual review.
 */
export const MIRRORED_ROSTER_PORTRAIT_NAMES = new Set([
    "Valkyrie",
    "Harpy",
    "Nomad",
    "Hyena",
    "Wyvern",
    "Cyclops",
    "Ogre Mage",
    "Zena",
    "Thunderbird",
    "Behemoth",
    "Frenzied Boar",
]);

/** Nature is mirrored by default, but Trent's approved L2 portrait already faces into the roster. */
const UNMIRRORED_NATURE_ROSTER_PORTRAIT_NAMES = new Set(["Trent"]);

type GetTexture = (key: string) => Texture | undefined;
type LevelBucket = Readonly<{ label: string; count: number; unitSize: 1 | 2 }>;
type LevelTab = {
    level: number;
    cont: Container;
    glow: Graphics;
    plate: Graphics;
    hoverLight: Graphics;
    label: Text;
    hovered: boolean;
};

/** Bevelled level plate from the sandbox handoff, with identical clipped corners on both sides. */
const levelPlatePath = (width: number, height: number, pointer: number): number[] => {
    const halfW = width * 0.5;
    const halfH = height * 0.5;
    const cut = Math.min(height * 0.16, width * 0.11);
    const shoulder = Math.min(height * 0.18, halfH - cut);
    return [
        -halfW + cut,
        -halfH,
        halfW - cut,
        -halfH,
        halfW,
        -halfH + cut,
        halfW,
        halfH - cut,
        halfW - cut,
        halfH,
        -halfW + cut,
        halfH,
        -halfW,
        halfH - cut,
        -halfW,
        shoulder,
        -halfW - pointer,
        0,
        -halfW,
        -shoulder,
        -halfW,
        -halfH + cut,
    ];
};

/**
 * Pixi's `visible` flag is local to each display object. A child remains `visible === true` even when a
 * grandparent is hidden, and `getBounds()` still returns its old bounds. Manual hit-testing therefore has to
 * verify the whole branch, not just the chip and its immediate bucket.
 */
export const isVisibleThroughAncestor = (displayObject: Container, ancestor: Container): boolean => {
    let current: Container | null = displayObject;
    while (current) {
        if (!current.visible) return false;
        if (current === ancestor) return true;
        current = current.parent;
    }
    return false;
};

export type UnitsOverlayLayout = Readonly<{ x: number; y: number; width: number; height: number }>;

export type ExpandedRosterGridLayout = Readonly<{
    columns: number;
    rows: number;
    cardWidth: number;
    cardHeight: number;
    gap: number;
    padding: number;
    width: number;
    height: number;
}>;

/**
 * Keep the expanded roster to two rows whenever possible. Width and the upper-background height both cap
 * the portrait size, so every creature stays visible without the roster spilling onto the battlefield.
 */
export const expandedRosterGridLayout = (
    viewportWidth: number,
    availableHeight: number,
    creatureCount: number,
    cellSize: number,
): ExpandedRosterGridLayout => {
    const count = Math.max(1, creatureCount);
    const rows = Math.min(2, count);
    const columns = Math.ceil(count / rows);
    const padding = Math.max(5, cellSize * 0.08);
    const gap = Math.max(5, cellSize * EXPANDED_CARD_GAP_CELL_FRACTION);
    const widthLimitedCard = Math.max(1, (viewportWidth - padding * 2 - gap * (columns - 1)) / columns);
    const l1L2CardWidthCap = Math.max(
        1,
        (viewportWidth - padding * 2 - gap * (EXPANDED_ROSTER_REFERENCE_COLUMNS - 1)) /
            EXPANDED_ROSTER_REFERENCE_COLUMNS,
    );
    const heightLimitedCard = Math.max(
        1,
        ((Math.max(1, availableHeight) - padding * 2 - gap * (rows - 1)) / rows) * PICK_CARD_ASPECT,
    );
    const cardWidth = Math.max(1, Math.min(widthLimitedCard, heightLimitedCard, l1L2CardWidthCap));
    const cardHeight = cardWidth / PICK_CARD_ASPECT;
    return {
        columns,
        rows,
        cardWidth,
        cardHeight,
        gap,
        padding,
        width: columns * cardWidth + Math.max(0, columns - 1) * gap + padding * 2,
        height: rows * cardHeight + Math.max(0, rows - 1) * gap + padding * 2,
    };
};

/** Match the hand-marked top container, then pull each horizontal edge inward by 3%. */
const UNITS_OVERLAY_TOP_BAND_SCALE_X = 0.93;
const UNITS_OVERLAY_TOP_BAND_SCALE_Y = 0.95;
/** Extend only the left edge; the hand-aligned right edge must stay fixed. */
const UNITS_OVERLAY_TOP_BAND_LEFT_EXPANSION = 0.025;
/** Raise the complete container without changing its height. */
const UNITS_OVERLAY_TOP_BAND_SHIFT_Y = -0.02;

/**
 * The roster occupies the decorative wall/fireplace band above the first painted battlefield seam.
 * Deriving the rectangle from the same bitmap fit as DungeonVisuals keeps the panel attached to that
 * background at every aspect ratio instead of centring it over four playable rows.
 */
export const unitsOverlayTopBandLayout = (stageW: number, stageH: number): UnitsOverlayLayout => {
    const artwork = battlefieldArtworkLayout(
        stageW,
        stageH,
        boardFitWidth(stageW, stageH),
        boardFitHeight(stageW, stageH),
    );
    const artworkLeft = artwork.x - artwork.width * 0.5;
    const artworkTop = artwork.y - artwork.height * 0.5;
    const artworkRight = artworkLeft + artwork.width;
    const scaleY = artwork.height / BATTLEFIELD_ARTWORK.height;
    const paintedFieldTop = artworkTop + BATTLEFIELD_ARTWORK.field.topLeft.y * scaleY;
    const x = Math.max(0, artworkLeft);
    const y = Math.max(0, artworkTop);
    const right = Math.max(x, Math.min(stageW, artworkRight));
    const bottom = Math.max(y, Math.min(stageH, paintedFieldTop));
    const fittedWidth = right - x;
    const fittedHeight = bottom - y;
    const insetX = (fittedWidth * (1 - UNITS_OVERLAY_TOP_BAND_SCALE_X)) / 2;
    const insetY = (fittedHeight * (1 - UNITS_OVERLAY_TOP_BAND_SCALE_Y)) / 2;
    const leftExpansion = fittedWidth * UNITS_OVERLAY_TOP_BAND_LEFT_EXPANSION;
    return {
        x: x + insetX - leftExpansion,
        y: Math.max(0, y + insetY + fittedHeight * UNITS_OVERLAY_TOP_BAND_SHIFT_Y),
        width: fittedWidth * UNITS_OVERLAY_TOP_BAND_SCALE_X + leftExpansion,
        height: fittedHeight * UNITS_OVERLAY_TOP_BAND_SCALE_Y,
    };
};

export class UnitsOverlay {
    private app: Application;
    private getTex: GetTexture;
    /** Root overlay container */
    public readonly container = new Container();
    /** Holds backdrop + headers + rows */
    private content = new Container();
    private backdrop = new Graphics();
    /** The L1..L4 tabs down the left rail. */
    private levelRail = new Container();
    /** One row per level; only the selected one is expanded. */
    private rowsContainer = new Container();
    /** Clips the active roster to the fitted upper-background frame. */
    private rowsMask = new Graphics();
    /** Keep the complete creature roster visible in the two-row layout. */
    private isListExpanded = true;
    /** Panel height locked to the fitted upper-background band. */
    private panelDisplayH = 0;
    /** Visible frame width, trimmed to the active two-row roster instead of retaining empty background. */
    private panelDisplayW = 0;
    private scrollbarTrack = new Graphics();
    private scrollbarThumb = new Graphics();
    private scrollX = 0;
    private maxScrollX = 0;
    private scrollViewportX = 0;
    private scrollTrackX = 0;
    private scrollTrackY = 0;
    private scrollTrackWidth = 0;
    private scrollHitPadding = 0;
    private scrollThumbWidth = 0;
    private scrollThumbTravel = 0;
    private scrollbarDragging = false;
    private scrollbarDragOffset = 0;
    private readonly onScrollbarPointerMove = (event: FederatedPointerEvent): void => {
        if (!this.scrollbarDragging || this.maxScrollX <= 0) return;
        const local = this.container.toLocal(event.global);
        const ratio = (local.x - this.scrollbarDragOffset - this.scrollTrackX) / this.scrollThumbTravel;
        this.setScrollX(ratio * this.maxScrollX);
    };
    private readonly stopScrollbarDrag = (): void => {
        this.scrollbarDragging = false;
    };
    /** Toggle button container */
    private toggleBtn = new Container();
    private toggleGlowPhase = 0;
    private toggleGlowStep?: (ticker: Ticker) => void;
    private toggleGlowRegistered = false;
    /** Production PNG contains the complete frame, metal treatment and chevron. */
    private toggleButtonSprite = new Sprite(Texture.EMPTY);
    /**
     * Where the panel is HEADING, as opposed to `isOpen`, which only flips once the slide finishes because
     * hit-testing keys off it. The image direction follows the target immediately rather than waiting for
     * the 350ms panel slide to finish.
     */
    private openTarget = true;
    /** Layout state */
    private overlayW = 0;
    private overlayH = 0;
    private leftColW = 0;
    private isOpen = true;
    private tweenCancel?: () => void;
    private allChips: UnitChip[] = [];
    private chipLevels = new Map<UnitChip, UnitLevelId>();
    private levelTabs: LevelTab[] = [];
    /** Last board cell size. */
    private cellSize = 0;
    /** The one expanded level. Starts on L1 so the overlay opens showing something rather than a bare ladder. */
    private selectedLevel = 1;
    private selectedName: string | null = null;
    /** Column order. One column per faction, all four the same width. */
    private readonly factions: { type: FactionType }[] = [
        { type: FactionVals.LIFE },
        { type: FactionVals.NATURE },
        { type: FactionVals.CHAOS },
        { type: FactionVals.MIGHT },
    ];
    private btnRadius = 0;
    private levelBuckets: LevelBucket[] = [];
    private onUnitSelected?: (unitProperties: UnitProperties | null) => void;
    public constructor(
        app: Application,
        getTexture: GetTexture,
        onUnitSelected?: (unitProperties: UnitProperties | null) => void,
        private getAmount?: (unitName: string) => number,
    ) {
        this.app = app;
        this.getTex = getTexture;
        this.onUnitSelected = onUnitSelected;

        this.levelBuckets = CommonLevelBuckets.map((b: LevelBucket): LevelBucket => ({
            label: b.label,
            count: b.count,
            unitSize: b.unitSize,
        }));

        this.app.stage.sortableChildren = true;
        this.container.zIndex = 100;
        this.container.sortableChildren = true;

        this.content.addChild(
            this.backdrop,
            this.levelRail,
            this.rowsContainer,
            this.rowsMask,
            this.scrollbarTrack,
            this.scrollbarThumb,
        );
        this.rowsContainer.mask = this.rowsMask;
        this.container.addChild(this.content);
        this.container.addChild(this.toggleBtn);

        this.app.stage.eventMode = "static";
        this.backdrop.eventMode = "none";
        this.rowsContainer.eventMode = "static";
        this.rowsContainer.on("wheel", (event: FederatedWheelEvent) => {
            if (this.maxScrollX <= 0) return;
            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            this.setScrollX(this.scrollX + delta);
            event.preventDefault();
            event.stopPropagation();
        });

        this.scrollbarThumb.eventMode = "static";
        this.scrollbarThumb.cursor = "ew-resize";
        this.scrollbarThumb.on("pointerdown", (event: FederatedPointerEvent) => {
            if (this.maxScrollX <= 0) return;
            const local = this.container.toLocal(event.global);
            this.scrollbarDragging = true;
            this.scrollbarDragOffset = local.x - this.scrollbarThumb.x;
            event.stopPropagation();
        });
        this.scrollbarTrack.eventMode = "static";
        this.scrollbarTrack.cursor = "pointer";
        this.scrollbarTrack.on("pointerdown", (event: FederatedPointerEvent) => {
            if (this.maxScrollX <= 0 || event.target === this.scrollbarThumb) return;
            const local = this.container.toLocal(event.global);
            const ratio = (local.x - this.scrollTrackX - this.scrollThumbWidth * 0.5) / this.scrollThumbTravel;
            this.setScrollX(ratio * this.maxScrollX);
        });

        this.app.stage.on("pointermove", this.onScrollbarPointerMove);
        this.app.stage.on("pointerup", this.stopScrollbarDrag);
        this.app.stage.on("pointerupoutside", this.stopScrollbarDrag);

        // --- Toggle Button Setup ---
        this.toggleBtn.zIndex = 9999;
        this.toggleBtn.eventMode = "static";
        this.toggleBtn.cursor = "pointer";

        this.toggleButtonSprite.anchor.set(0.5);
        this.toggleBtn.addChild(this.toggleButtonSprite);

        // Keep only the selected-level pulse animated. The button itself is a single authored bitmap and
        // must remain pixel-stable instead of mixing generated art with procedural rings or arrow motion.
        this.toggleGlowStep = (ticker: Ticker) => {
            this.toggleGlowPhase += ticker.deltaMS / 1000;
            // Gold is reserved for the active creature level. A restrained independent breath keeps the
            // chosen plate alive without making its label or dark fill blink.
            const levelPulse = 0.5 + 0.5 * Math.sin(this.toggleGlowPhase * 2.35 + 0.7);
            for (const tab of this.levelTabs) {
                const selected = tab.level === this.selectedLevel;
                tab.glow.alpha = selected ? 0.34 + levelPulse * 0.28 : 0;
                tab.glow.scale.set(selected ? 1 + levelPulse * 0.018 : 1);
            }
        };
        this.app.ticker.add(this.toggleGlowStep);
        this.toggleGlowRegistered = true;

        // Hover effects
        this.toggleBtn.on("pointerenter", () => {
            this.updateButtonVisuals(true);
        });

        this.toggleBtn.on("pointerleave", () => {
            this.updateButtonVisuals(false);
        });

        this.app.stage.addChild(this.container);
    }
    /** Size and orient the complete authored PNG; no part of the button is drawn procedurally. */
    private updateButtonVisuals(isHovered: boolean): void {
        const r = this.btnRadius;
        if (r <= 0) {
            return;
        }
        const size = r * 2;

        // Once the panel has left the screen this is its only return control. Grow the complete button —
        // texture and Pixi hit area together — by exactly 30%; open keeps the authored scale.
        this.toggleBtn.scale.set(this.openTarget ? 1 : TOGGLE_CLOSED_SCALE);
        const textureWidth = Math.max(1, this.toggleButtonSprite.texture.width);
        const textureHeight = Math.max(1, this.toggleButtonSprite.texture.height);
        this.toggleButtonSprite.scale.set((size / textureWidth) * (this.openTarget ? 1 : -1), size / textureHeight);
        this.toggleButtonSprite.alpha = isHovered ? 1 : 0.96;
    }
    private toggleExpandedList(): void {
        this.isListExpanded = !this.isListExpanded;
        this.onResize(this.app.renderer.width, this.app.renderer.height);
    }
    private selectChip(chip: UnitChip): void {
        const unitName = chip.nameKey;
        const next = this.selectedName === unitName ? null : unitName;
        this.selectedName = next;

        for (const candidate of this.allChips) {
            candidate.setSelected(candidate.nameKey === next);
        }

        if (this.onUnitSelected) {
            this.onUnitSelected(next ? this.getUnitProperties(unitName) : null);
        }
    }
    public handlePointerDown(globalX: number, globalY: number): boolean {
        const localOverlay = this.container.toLocal({ x: globalX, y: globalY });
        const insideOverlay =
            localOverlay.x >= 0 &&
            localOverlay.y >= 0 &&
            localOverlay.x <= this.panelDisplayW &&
            localOverlay.y <= this.panelDisplayH;

        const localToggle = this.toggleBtn.toLocal({ x: globalX, y: globalY });
        if (localToggle.x * localToggle.x + localToggle.y * localToggle.y <= this.btnRadius * this.btnRadius) {
            this.toggle();
            return true;
        }

        if (!this.isOpen) return false;

        // Pixi is rendered beneath the transparent interaction canvas used by PixiGameManager, so the
        // native Graphics pointer handlers are not guaranteed to receive this press. Mirror the scrollbar
        // hit test here: the manager already forwards canvas-space pointer input through this method.
        const insideScrollbar =
            this.maxScrollX > 0 &&
            localOverlay.x >= this.scrollTrackX &&
            localOverlay.x <= this.scrollTrackX + this.scrollTrackWidth &&
            localOverlay.y >= this.scrollTrackY - this.scrollHitPadding &&
            localOverlay.y <= this.scrollTrackY + this.scrollbarTrack.height + this.scrollHitPadding;
        if (insideScrollbar) {
            const thumbLeft = this.scrollbarThumb.x;
            const thumbRight = thumbLeft + this.scrollThumbWidth;
            if (localOverlay.x >= thumbLeft && localOverlay.x <= thumbRight) {
                this.scrollbarDragging = true;
                this.scrollbarDragOffset = localOverlay.x - thumbLeft;
            } else {
                const ratio =
                    (localOverlay.x - this.scrollTrackX - this.scrollThumbWidth * 0.5) / this.scrollThumbTravel;
                this.setScrollX(ratio * this.maxScrollX);
            }
            return true;
        }

        // Level tabs come first: they sit in the left rail, clear of the chips, and a hit there swaps which
        // band is expanded rather than selecting anything.
        for (const tab of this.levelTabs) {
            const b = tab.cont.getBounds();
            if (!b) continue;

            if (globalX >= b.x && globalX <= b.x + b.width && globalY >= b.y && globalY <= b.y + b.height) {
                if (tab.level !== this.selectedLevel) {
                    this.setSelectedLevel(tab.level);
                }
                return true;
            }
        }

        for (const chip of this.allChips) {
            // Chips of the three collapsed levels are still in this flat list. Their direct bucket remains
            // visible; it is the bucket's ROW that is hidden, so checking only `chip.parent.visible` lets an
            // invisible earlier-level chip steal a click from the expanded level wherever their old bounds
            // overlap. Follow the complete branch through rowsContainer before asking Pixi for stale bounds.
            if (!isVisibleThroughAncestor(chip, this.rowsContainer)) continue;

            const b = chip.getBounds();
            if (!b) continue;

            if (globalX >= b.x && globalX <= b.x + b.width && globalY >= b.y && globalY <= b.y + b.height) {
                this.selectChip(chip);
                return true;
            }
        }

        if (insideOverlay) {
            if (this.hasSelection()) this.clearSelection(true);
            return true;
        }

        return false;
    }
    /** Forwarded by the transparent interaction canvas while dragging the visible horizontal thumb. */
    public handlePointerMove(globalX: number, globalY: number): boolean {
        if (!this.scrollbarDragging || this.maxScrollX <= 0) return false;
        const local = this.container.toLocal({ x: globalX, y: globalY });
        const ratio = (local.x - this.scrollbarDragOffset - this.scrollTrackX) / this.scrollThumbTravel;
        this.setScrollX(ratio * this.maxScrollX);
        return true;
    }
    public handlePointerUp(): boolean {
        const wasDragging = this.scrollbarDragging;
        this.scrollbarDragging = false;
        return wasDragging;
    }
    /** Convert either a vertical mouse wheel or a horizontal trackpad gesture into roster movement. */
    public handleWheel(globalX: number, globalY: number, deltaX: number, deltaY: number): boolean {
        if (!this.isOpen || this.isListExpanded || this.maxScrollX <= 0) return false;
        const local = this.container.toLocal({ x: globalX, y: globalY });
        if (local.x < 0 || local.y < 0 || local.x > this.panelDisplayW || local.y > this.panelDisplayH) return false;
        const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
        if (!Number.isFinite(delta) || delta === 0) return false;
        this.setScrollX(this.scrollX + delta);
        return true;
    }
    /**
     * DEV automation/QA: canvas-space centers of everything currently clickable — the level tabs and the
     * expanded band's chips (each with the unit it must select). Lets a browser rig click every chip and
     * assert the selection matches instead of guessing coordinates.
     */
    public getDebugClickMap(): {
        tabs: { level: number; x: number; y: number }[];
        chips: { name: string; x: number; y: number }[];
        selectedLevel: number;
    } {
        const center = (b: { x: number; y: number; width: number; height: number }) => ({
            x: b.x + b.width / 2,
            y: b.y + b.height / 2,
        });
        const tabs = this.levelTabs.map((tab) => ({ level: tab.level, ...center(tab.cont.getBounds()) }));
        const chips: { name: string; x: number; y: number }[] = [];
        for (const chip of this.allChips) {
            if (!isVisibleThroughAncestor(chip, this.rowsContainer)) continue;
            chips.push({ name: (chip as UnitChip).nameKey as string, ...center(chip.getBounds()) });
        }
        return { tabs, chips, selectedLevel: this.selectedLevel };
    }
    public getUnitProperties(unitName: string): UnitProperties {
        let faction: FactionType = FactionVals.NO_FACTION;
        const target = unitName;
        let found = false;

        for (const f of this.factions) {
            for (let b = 0; b < this.levelBuckets.length; b++) {
                const lvl = (b + 1) as UnitLevelId;
                const namesForLevel = getCreaturesOf(f.type, lvl)
                    .map((id: CreatureId) => UNIT_ID_TO_NAME[id as number])
                    .filter(Boolean) as string[];

                if (namesForLevel.includes(target)) {
                    faction = f.type;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }

        return HoCConfig.getCreatureConfig(
            TeamVals.NO_TEAM,
            ToFactionName[faction],
            unitName,
            unitToTextureName(unitName, TextureType.LARGE),
            0,
            BASE_UNIT_STACK_TO_SPAWN_EXP,
        );
    }
    public build(): void {
        // Ranked fight hydration still constructs an invisible roster. Do not start this placement-only
        // request until the overlay is actually built for placement.
        this.refreshToggleTexture();
        this.levelRail.removeChildren();
        this.rowsContainer.removeChildren();
        this.allChips = [];
        this.chipLevels.clear();
        this.levelTabs = [];
        this.selectedName = null;

        // Level tabs down the left rail, abbreviated to L1..L4 — the rail is only ~1.5 cells wide, and the
        // full "LEVEL 1" wording only fitted when it was a banner spanning a whole column.
        for (let i = 0; i < this.levelBuckets.length; i++) {
            const cont = new Container();
            const glow = new Graphics();
            const plate = new Graphics();
            const hoverLight = new Graphics();
            const label = new Text({
                text: `L${i + 1}`,
                style: new TextStyle({
                    fill: 0xdcb158,
                    fontSize: OVERLAY_LEVEL_LABEL_BASE_SIZE,
                    fontWeight: "700",
                    fontFamily: OVERLAY_FONT_FAMILY,
                    letterSpacing: 1,
                }),
            });
            label.anchor.set(0.5);
            glow.blendMode = "add";
            hoverLight.alpha = 0;
            cont.eventMode = "static";
            cont.cursor = "pointer";
            const tab: LevelTab = {
                level: i + 1,
                cont,
                glow,
                plate,
                hoverLight,
                label,
                hovered: false,
            };
            // Only the glyphs and a restrained inner light react on hover: the plate and its spacing remain
            // perfectly still. Eleven percent is readable without making the rail jump.
            cont.on("pointerenter", () => {
                tab.hovered = true;
                const interactive = tab.level !== this.selectedLevel;
                label.scale.set(interactive ? 1.11 : 1);
                hoverLight.alpha = interactive ? 1 : 0;
            });
            cont.on("pointerleave", () => {
                tab.hovered = false;
                label.scale.set(1);
                hoverLight.alpha = 0;
            });
            cont.addChild(glow, plate, hoverLight, label);
            this.levelRail.addChild(cont);
            this.levelTabs.push(tab);
        }

        // One row per LEVEL; inside it one bucket per FACTION.
        for (let b = 0; b < this.levelBuckets.length; b++) {
            const row = new Container();
            this.rowsContainer.addChild(row);

            const lvl = (b + 1) as UnitLevelId;
            const sizeFlag = this.levelBuckets[b].unitSize;

            for (const faction of this.factions) {
                const bucketCont = new Container();
                row.addChild(bucketCont);

                const namesForLevel = getCreaturesOf(faction.type, lvl)
                    .map((id: CreatureId) => UNIT_ID_TO_NAME[id as number])
                    .filter(Boolean) as string[];

                for (const unitName of namesForLevel) {
                    const unitProperties = this.getUnitProperties(unitName);
                    const creatureId = UNIT_NAME_TO_ID[unitName];
                    const portraitVisual =
                        creatureId === undefined ? undefined : resolveCreaturePortraitVisual(creatureId);
                    const portraitTextureKey = portraitVisual ? IMAGE_URL_TO_KEY.get(portraitVisual.source) : undefined;
                    const loadPortraitNow = lvl === this.selectedLevel;
                    const portraitTexture =
                        loadPortraitNow && portraitTextureKey ? this.getTex(portraitTextureKey) : undefined;
                    const backgroundTextureKey = portraitVisual?.background
                        ? IMAGE_URL_TO_KEY.get(portraitVisual.background)
                        : undefined;
                    const backgroundTexture =
                        loadPortraitNow && backgroundTextureKey ? this.getTex(backgroundTextureKey) : undefined;
                    const typePresentation = creatureTypePresentation(unitName);
                    const attackTypeIcon = typePresentation
                        ? this.getTex(ROSTER_ATTACK_TYPE_ICON_KEY[typePresentation.attack])
                        : undefined;
                    const movementTypeIcon = typePresentation
                        ? this.getTex(ROSTER_MOVEMENT_TYPE_ICON_KEY[typePresentation.movement])
                        : undefined;

                    // Fall back only for an unknown/unregistered creature. The normal sandbox roster uses
                    // the exact source, faction background and crop already approved for the pick cards.
                    const fallbackTexture =
                        loadPortraitNow && !portraitVisual
                            ? this.getTex(unitToTextureName(unitName, TextureType.LARGE, sizeFlag))
                            : undefined;
                    const portrait = portraitVisual
                        ? {
                              texture: portraitTexture ?? Texture.EMPTY,
                              backgroundTexture: portraitVisual.background
                                  ? (backgroundTexture ?? Texture.EMPTY)
                                  : undefined,
                              backgroundOpacity: portraitVisual.backgroundOpacity,
                              backgroundShadeAlpha: portraitVisual.backgroundShadeAlpha,
                              framing: portraitVisual.framing,
                              mirrorX:
                                  (faction.type === FactionVals.NATURE &&
                                      !UNMIRRORED_NATURE_ROSTER_PORTRAIT_NAMES.has(unitName)) ||
                                  MIRRORED_ROSTER_PORTRAIT_NAMES.has(unitName),
                          }
                        : undefined;

                    const chip = new UnitChip({
                        unitName,
                        texture: portraitTexture ?? fallbackTexture ?? Texture.EMPTY,
                        portrait,
                        getAmount: () => (this.getAmount ? this.getAmount(unitName) : unitProperties.amount_alive),
                        typeIcons:
                            attackTypeIcon && movementTypeIcon
                                ? {
                                      attack: attackTypeIcon,
                                      movement: movementTypeIcon,
                                      movementScale: typePresentation?.movement === "FLY" ? 220 / 170 : 1,
                                  }
                                : undefined,
                    });
                    chip.setTicker(this.app.ticker);
                    bucketCont.addChild(chip);
                    this.allChips.push(chip);
                    this.chipLevels.set(chip, lvl);
                }
            }
        }

        this.updateButtonVisuals(false);

        this.onResize(this.app.renderer.width, this.app.renderer.height);
        this.container.sortChildren();
    }
    /** Fill any roster cards whose on-demand portrait/background has just entered Pixi's cache. */
    public refreshLazyTextures(): void {
        if (this.container.destroyed) return;
        this.refreshToggleTexture();
        for (const chip of this.allChips) {
            if (this.chipLevels.get(chip) !== this.selectedLevel) continue;
            const creatureId = UNIT_NAME_TO_ID[chip.nameKey];
            const visual = creatureId === undefined ? undefined : resolveCreaturePortraitVisual(creatureId);
            if (!visual) continue;

            const textureKey = IMAGE_URL_TO_KEY.get(visual.source);
            const texture = textureKey ? this.getTex(textureKey) : undefined;
            if (!texture) continue;
            const backgroundKey = visual.background ? IMAGE_URL_TO_KEY.get(visual.background) : undefined;
            const backgroundTexture = backgroundKey ? this.getTex(backgroundKey) : undefined;
            chip.setPortraitTextures(texture, backgroundTexture);
        }
    }
    private refreshToggleTexture(): void {
        const texture = this.getTex("units_overlay_toggle_square_v1");
        if (!texture || texture === Texture.EMPTY || texture === this.toggleButtonSprite.texture) return;
        this.toggleButtonSprite.texture = texture;
        this.updateButtonVisuals(false);
    }
    private setScrollX(value: number): void {
        this.scrollX = Math.max(0, Math.min(this.maxScrollX, Number.isFinite(value) ? value : 0));
        this.rowsContainer.x = this.scrollViewportX - this.scrollX;
        const ratio = this.maxScrollX > 0 ? this.scrollX / this.maxScrollX : 0;
        this.scrollbarThumb.x = this.scrollTrackX + this.scrollThumbTravel * ratio;
    }
    /** Expand one level and collapse the rest. Chips of a collapsed level are hidden, so they also stop
     *  answering hit-tests — the pointer code walks `allChips` flat and cannot otherwise tell them apart. */
    private setSelectedLevel(level: number): void {
        // Never leave a creature from the collapsed row active in the player's hand. Besides being invisible,
        // that stale selection makes the next board click place the old level before the player has actually
        // picked a creature from the newly expanded row.
        this.clearSelection(true);
        this.selectedLevel = level;
        this.scrollX = 0;
        for (const tab of this.levelTabs) {
            tab.hovered = false;
            tab.label.scale.set(1);
            tab.hoverLight.alpha = 0;
        }
        this.onResize(this.app.renderer.width, this.app.renderer.height);
        this.refreshLazyTextures();
    }
    public onResize(stageW: number, stageH: number): void {
        if (stageW <= 0 || stageH <= 0) return;
        // The overlay is destroyed once the fight starts; a later resize (e.g. rematch's
        // fitViewToWindow) must not touch its torn-down container.
        if (this.container.destroyed) return;

        const topBand = unitsOverlayTopBandLayout(stageW, stageH);
        const cell = Math.max(1, Math.min(topBand.width / 16, topBand.height / 4));
        this.cellSize = cell;

        this.overlayW = topBand.width;
        this.overlayH = topBand.height;
        this.container.position.set(topBand.x, topBand.y);

        this.leftColW = 1.5 * cell;
        const levelCols = this.levelBuckets.length;
        // EVERYTHING lives inside the fitted upper-background band; nothing is drawn beyond its contour or it
        // would spill onto the playable red deployment zone. There used to be a header band carrying a crest per
        // column, which spent a quarter of the panel's height on four small labels — the columns are already
        // in a fixed order and the creatures in them say which race they are. With it gone the creature grid
        // runs the full four cells and the chips grow by about a third.
        const toggleSize = cell * TOGGLE_BUTTON_CELL_FRACTION;

        // The outer frame follows the full marked container, including the L1..L4 rail. Portraits begin just
        // beyond the level plates: the old 1.5-cell grid origin left a large empty strip and needed a divider
        // to explain it. The tighter origin makes that separator unnecessary.
        const gridInset = cell * 0.07;
        const gridX = cell * CREATURE_GRID_START_CELL_FRACTION;
        const gridY = gridInset;
        const gridW = this.overlayW - gridX - gridInset;
        const collapsedGridH = this.overlayH - gridY - gridInset;
        const hairline = Math.max(1, cell * 0.014);

        // Keep the cards at the pick stage's real portrait proportions and size them from HEIGHT. When the
        // resulting one-line roster is wider than the viewport, it scrolls instead of crushing the art.
        const scrollbarHeight = Math.max(4, Math.min(9, cell * 0.1));
        const scrollbarGap = Math.max(2, cell * 0.045);
        const collapsedViewportH = Math.max(1, collapsedGridH - scrollbarHeight - scrollbarGap * 2);
        const cardHeight = collapsedViewportH * 0.9;
        const cardWidth = cardHeight * PICK_CARD_ASPECT;
        const cardGap = Math.max(2, cardWidth * 0.07);
        const factionGap = Math.max(cardGap * 2.2, cardWidth * 0.22);
        const selectedRow = this.rowsContainer.children[this.selectedLevel - 1] as Container | undefined;
        const bucketCounts = this.factions.map(
            (_, f) => (selectedRow?.children[f] as Container | undefined)?.children.length ?? 0,
        );
        const creatureCount = bucketCounts.reduce((sum, count) => sum + count, 0);
        // The expanded grid owns the complete inner frame now that the ALL control is gone. Feeding that full
        // height to the grid grows both card axes together, keeps 190:256, and brings the lower row down to the
        // same inset as the top and side edges without introducing a scrollbar.
        const availableExpandedHeight = Math.max(1, collapsedGridH);
        const expandedLayout = expandedRosterGridLayout(gridW, availableExpandedHeight, creatureCount, cell);
        const viewportH = this.isListExpanded ? expandedLayout.height : collapsedViewportH;
        this.panelDisplayH = this.overlayH;
        this.panelDisplayW = this.isListExpanded
            ? Math.min(this.overlayW, gridX + expandedLayout.width)
            : this.overlayW;

        const bucketWidths = bucketCounts.map((n) => Math.max(0, n * cardWidth + Math.max(0, n - 1) * cardGap));
        const visibleBucketCount = bucketWidths.filter((width) => width > 0).length;
        const rowInnerWidth =
            bucketWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, visibleBucketCount - 1) * factionGap;
        const rowPadding = Math.max(cardGap, cell * 0.08);
        const scrollContentWidth = this.isListExpanded ? gridW : Math.max(gridW, rowInnerWidth + rowPadding * 2);
        const rowStartX = scrollContentWidth > gridW ? rowPadding : (gridW - rowInnerWidth) * 0.5;
        this.maxScrollX = this.isListExpanded ? 0 : Math.max(0, scrollContentWidth - gridW);
        this.scrollViewportX = gridX;
        this.scrollX = Math.min(this.scrollX, this.maxScrollX);

        this.backdrop
            .clear()
            .rect(0, 0, this.panelDisplayW, this.panelDisplayH)
            .fill({ color: 0x000000, alpha: 0.55 })
            .roundRect(
                gridInset,
                gridInset,
                this.panelDisplayW - gridInset * 2,
                this.panelDisplayH - gridInset * 2,
                Math.min(9, cell * 0.14),
            )
            .stroke({ color: 0xdcb158, width: hairline, alpha: 0.34 });

        this.rowsMask
            .clear()
            .roundRect(gridX, gridY, gridW, viewportH, Math.min(7, cardWidth * 0.06))
            .fill({ color: 0xffffff });

        const trackY = gridY + viewportH + scrollbarGap;
        this.scrollTrackY = trackY;
        this.scrollHitPadding = scrollbarGap;
        this.scrollTrackX = gridX + rowPadding * 0.4;
        this.scrollTrackWidth = Math.max(1, gridW - rowPadding * 0.8);
        this.scrollThumbWidth =
            this.maxScrollX > 0
                ? Math.max(cell * 0.65, this.scrollTrackWidth * (gridW / scrollContentWidth))
                : this.scrollTrackWidth;
        this.scrollThumbWidth = Math.min(this.scrollTrackWidth, this.scrollThumbWidth);
        this.scrollThumbTravel = Math.max(1, this.scrollTrackWidth - this.scrollThumbWidth);
        this.scrollbarTrack
            .clear()
            .roundRect(0, 0, this.scrollTrackWidth, scrollbarHeight, scrollbarHeight * 0.5)
            .fill({ color: 0x090806, alpha: 0.82 })
            .stroke({ color: 0x8c6a3f, width: Math.max(1, hairline), alpha: 0.72 });
        this.scrollbarTrack.position.set(this.scrollTrackX, trackY);
        this.scrollbarTrack.hitArea = new Rectangle(
            0,
            -scrollbarGap,
            this.scrollTrackWidth,
            scrollbarHeight + scrollbarGap * 2,
        );
        this.scrollbarThumb
            .clear()
            .roundRect(0, 0, this.scrollThumbWidth, scrollbarHeight, scrollbarHeight * 0.5)
            .fill({ color: 0xb58a50, alpha: 0.9 })
            .stroke({ color: 0xe4c590, width: Math.max(1, hairline), alpha: 0.68 });
        this.scrollbarThumb.y = trackY;
        this.scrollbarThumb.hitArea = new Rectangle(
            0,
            -scrollbarGap,
            this.scrollThumbWidth,
            scrollbarHeight + scrollbarGap * 2,
        );
        // The expanded two-row roster always fits the viewport, so it has no scroll range and should not
        // retain a decorative full-width "thumb" beneath the cards. Keep the scrollbar only when the
        // collapsed one-row roster genuinely overflows.
        this.scrollbarTrack.visible = this.maxScrollX > 0;
        this.scrollbarThumb.visible = this.maxScrollX > 0;

        // --- Left rail: the collapse toggle at its head, the level tabs under it ---
        // The panel's top-left corner lands exactly on a board cell corner, so the centre of the cell the
        // toggle covers is simply half a cell in and half a cell down. Everything in the rail is centred on
        // that same column. The rail is 1.5 cells wide and the toggle used to sit at its own midpoint,
        // 0.75 of a cell in, which put it a quarter cell right of the cell it looked like it occupied.
        const railPad = cell * 0.06;
        const railCentreX = cell * 0.5;
        const btnY = cell * 0.5;
        const railTop = btnY + toggleSize * 0.5 + railPad;
        const railH = this.overlayH - railTop;

        // The tabs are the ONLY thing the unselected levels occupy. Laid out as a STACK with one fixed gap
        // between neighbours, then centred: giving each tab an equal slot instead made the gaps depend on
        // how much smaller its plate was than the slot, so the selected (taller) tab appeared to push its
        // neighbours away while L1/L2 sat tight against each other.
        const selectedTabH = Math.min(railH * 0.25, cell * 0.78);
        const plainTabH = Math.min(railH * 0.19, cell * 0.63);
        const tabGap = Math.min(railH * 0.04, cell * 0.12);
        const tabsTotalH =
            selectedTabH + plainTabH * (this.levelBuckets.length - 1) + tabGap * (this.levelBuckets.length - 1);
        let tabCursorY = railTop + (railH - tabsTotalH) * 0.5;

        for (const tab of this.levelTabs) {
            const isSelected = tab.level === this.selectedLevel;
            const plateH = isSelected ? selectedTabH : plainTabH;
            // Capped against the CELL, not the rail: centred on railCentreX a rail-width plate would hang
            // off the panel's left edge.
            const plateW = Math.min(this.leftColW * (isSelected ? 0.8 : 0.72), cell * (isSelected ? 0.94 : 0.84));
            // The former selected-state pointer protruded only from the left edge. Keeping this at zero makes
            // the chosen plate use the same clipped geometry on both sides.
            const pointer = 0;
            const path = levelPlatePath(plateW, plateH, pointer);
            const accent = isSelected ? 0xffa45c : 0x81684a;

            tab.cont.position.set(railCentreX, tabCursorY + plateH * 0.5);
            tabCursorY += plateH + tabGap;
            tab.glow
                .clear()
                .poly(path)
                .stroke({ color: 0xff8f32, width: Math.max(2, plateH * 0.15), alpha: isSelected ? 0.5 : 0 });
            tab.plate
                .clear()
                .poly(path)
                .fill({ color: isSelected ? 0x241308 : 0x090806, alpha: isSelected ? 0.98 : 0.92 })
                .stroke({ color: accent, width: Math.max(1, plateH * 0.065), alpha: isSelected ? 1 : 0.72 })
                .poly(levelPlatePath(plateW * 0.88, plateH * 0.78, pointer * 0.54))
                .stroke({ color: isSelected ? 0xffd29a : 0x443829, width: Math.max(1, plateH * 0.025), alpha: 0.5 });
            if (!isSelected) {
                const rivetX = plateW * 0.38;
                const rivetY = plateH * 0.32;
                for (const x of [-rivetX, rivetX]) {
                    for (const y of [-rivetY, rivetY]) {
                        tab.plate.circle(x, y, Math.max(0.75, plateH * 0.025)).fill({ color: 0x6a563e, alpha: 0.56 });
                    }
                }
            }
            tab.hoverLight
                .clear()
                .poly(levelPlatePath(plateW * 0.82, plateH * 0.7, 0))
                .fill({ color: 0xe0bd8c, alpha: 0.11 });
            tab.hoverLight.alpha = tab.hovered && !isSelected ? 1 : 0;
            const labelFontSize = Math.round(Math.max(10, plateH * 0.5) * LEVEL_LABEL_SIZE_FACTOR);
            tab.label.style.fontSize = labelFontSize;
            tab.label.style.letterSpacing = labelFontSize * LEVEL_LABEL_LETTER_SPACING_FACTOR;
            tab.label.style.fill = isSelected ? 0xffd49a : 0xd2b58c;
            tab.cont.hitArea = new Rectangle(-plateW * 0.5 - pointer, -plateH * 0.5, plateW + pointer, plateH);
        }

        // --- Creature buckets: the open level fills the grid, full height ---
        for (let b = 0; b < levelCols; b++) {
            const rowCont = this.rowsContainer.children[b] as Container;
            const isSelected = b + 1 === this.selectedLevel;
            // The selected row is one horizontal scroll strip; each faction bucket follows the previous one.
            rowCont.position.set(0, 0);
            rowCont.visible = isSelected;

            if (!isSelected) {
                continue;
            }

            if (this.isListExpanded) {
                // Start immediately after the L1–L4 rail. The frame's right edge is trimmed to this content
                // width above, so the roster has no large empty field on either side.
                const originX = expandedLayout.padding + expandedLayout.cardWidth * 0.5;
                const originY = expandedLayout.padding + expandedLayout.cardHeight * 0.5;
                let index = 0;
                for (const bucketCont of rowCont.children as Container[]) {
                    bucketCont.position.set(0, 0);
                    for (const chip of bucketCont.children as UnitChip[]) {
                        const column = index % expandedLayout.columns;
                        const row = Math.floor(index / expandedLayout.columns);
                        chip.layout(expandedLayout.cardWidth, expandedLayout.cardHeight);
                        chip.position.set(
                            originX + column * (expandedLayout.cardWidth + expandedLayout.gap),
                            originY + row * (expandedLayout.cardHeight + expandedLayout.gap),
                        );
                        index++;
                    }
                }
            } else {
                let bucketX = rowStartX;
                let visibleBucketsPlaced = 0;
                for (let f = 0; f < this.factions.length; f++) {
                    const bucketCont = rowCont.children[f] as Container;
                    const chips = bucketCont.children as unknown as UnitChip[];
                    const n = chips.length;
                    if (!n) continue;

                    if (visibleBucketsPlaced > 0) bucketX += factionGap;
                    bucketCont.position.set(bucketX, 0);
                    const spacing = cardWidth + cardGap;
                    for (let c = 0; c < n; c++) {
                        const chip = chips[c];
                        chip.layout(cardWidth, cardHeight);
                        chip.position.set(cardWidth * 0.5 + c * spacing, viewportH * 0.5);
                    }
                    bucketX += bucketWidths[f];
                    visibleBucketsPlaced++;
                }
            }
        }
        this.rowsContainer.y = gridY;
        this.setScrollX(this.scrollX);

        // --- Toggle Button ---
        // Head of the left rail (btnY was computed with the rail above); the overlay stays inside the fitted
        // wall/fireplace band, so nothing leaks down onto the playable field.
        this.toggleBtn.position.set(railCentreX, btnY);
        this.btnRadius = toggleSize * 0.5;

        this.updateButtonVisuals(false);

        // Match the new square control instead of retaining the former circular hit target.
        this.toggleBtn.hitArea = new Rectangle(-this.btnRadius, -this.btnRadius, toggleSize, toggleSize);

        this.content.x = this.isOpen ? 0 : -this.overlayW;
        this.content.alpha = this.isOpen ? 1 : 0;
    }
    public toggle(): void {
        this.animateTo(!this.isOpen, 350);
    }
    public hitToggle(globalX: number, globalY: number): boolean {
        const local = this.toggleBtn.toLocal({ x: globalX, y: globalY });
        return Math.abs(local.x) <= this.btnRadius && Math.abs(local.y) <= this.btnRadius;
    }
    private animateTo(open: boolean, durationMs: number): void {
        if (this.tweenCancel) {
            this.tweenCancel();
            this.tweenCancel = undefined;
        }

        // Mirror the authored image straight away so the chevron follows the target panel direction.
        this.openTarget = open;
        this.updateButtonVisuals(false);

        const startX = this.content.x;
        const startA = this.content.alpha;
        const endX = open ? 0 : -this.overlayW;
        const endA = open ? 1 : 0;

        const start = performance.now();
        const ticker = this.app.ticker as Ticker;
        const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

        const step = () => {
            const now = performance.now();
            const p = Math.min(1, (now - start) / durationMs);
            const e = easeInOutQuad(p);

            this.content.x = startX + (endX - startX) * e;
            this.content.alpha = startA + (endA - startA) * e;

            if (p >= 1) {
                ticker.remove(step);
                this.tweenCancel = undefined;
                this.isOpen = open;
            }
        };

        ticker.add(step);
        this.tweenCancel = () => ticker.remove(step);
    }
    public setVisible(v: boolean): void {
        this.container.visible = v;
        if (!this.toggleGlowStep) return;
        if (v && !this.toggleGlowRegistered) {
            this.app.ticker.add(this.toggleGlowStep);
            this.toggleGlowRegistered = true;
        } else if (!v && this.toggleGlowRegistered) {
            this.app.ticker.remove(this.toggleGlowStep);
            this.toggleGlowRegistered = false;
        }
    }
    public destroy(): void {
        if (this.tweenCancel) this.tweenCancel();
        this.app.stage.off("pointermove", this.onScrollbarPointerMove);
        this.app.stage.off("pointerup", this.stopScrollbarDrag);
        this.app.stage.off("pointerupoutside", this.stopScrollbarDrag);
        if (this.toggleGlowStep && this.toggleGlowRegistered) {
            this.app.ticker.remove(this.toggleGlowStep);
        }
        this.toggleGlowRegistered = false;
        this.toggleGlowStep = undefined;
        this.container.destroy({ children: true });
        this.allChips.length = 0;
    }
    public hasSelection(): boolean {
        return this.selectedName !== null;
    }
    public clearSelection(notify: boolean = true): void {
        if (!this.hasSelection()) return;
        this.selectedName = null;
        for (const c of this.allChips) c.setSelected(false);
        if (notify && this.onUnitSelected) this.onUnitSelected(null);
    }
    public setShowAllAmounts(show: boolean): void {
        for (const c of this.allChips) {
            c.setForceBadgeVisible(show);
        }
    }
}
