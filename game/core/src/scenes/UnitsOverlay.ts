// game/core/src/overlays/UnitsOverlay.ts
import { Application, Circle, Container, Rectangle, Text, TextStyle, Texture, Graphics, Ticker } from "pixi.js";

import { unitToTextureName, TextureType } from "../pixi/PixiUnitsFactory";
import { UnitChip } from "./UnitChip";

import { UNIT_ID_TO_NAME } from "../ui/unit_ui_constants";

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

/** The app's own stack — same as style.scss's <body> rule and the board labels in RenderableUnit. */
const OVERLAY_FONT_FAMILY = '"Open Sans", Verdana, sans-serif';
/** Placeholder size only; layout() sets the real one from the row height on every resize. */
const OVERLAY_LEVEL_LABEL_BASE_SIZE = 24;

/** Collapse-toggle diameter, as a fraction of a board cell. */
const TOGGLE_BUTTON_CELL_FRACTION = 0.64;
/**
 * The toggle states its own effect by colour: green while the panel is open, red once it is collapsed — the
 * same green and ember red the sidebar's Start and Delete buttons use, so the palette stays one palette. The
 * chevron already turns 180 degrees between the two, but on a small disc against a dark board that read as
 * ambiguous on its own.
 */
const TOGGLE_OPEN_COLOR = 0x46d160;
const TOGGLE_OPEN_COLOR_HOVER = 0x7ce894;
const TOGGLE_CLOSED_COLOR = 0xff5a3f;
const TOGGLE_CLOSED_COLOR_HOVER = 0xff8a72;

/** No faction line runs longer than this; past three the chips shrink faster than the line buys room. */
const MAX_CHIPS_PER_ROW = 3;
/** Share of its block a faction's chips may fill, leaving the frame and the dividers clear. */
const BLOCK_FILL = 0.94;
/**
 * The two ways the four faction blocks tile the grid. Which one is used is decided per level by whichever
 * gives the bigger chips (see onResize) rather than being fixed: with four creatures a faction, four blocks
 * across and a 2x2 of chips in each is best; at levels 3 and 4 every faction fields three, and four-across
 * leaves each block twice as tall as it needs, so a 2x2 of BLOCKS with the three creatures on one line wins.
 */
const BLOCK_LAYOUTS: ReadonlyArray<{ cols: number; rows: number }> = [
    { cols: 4, rows: 1 },
    { cols: 2, rows: 2 },
];

/**
 * The widest chip that fits `n` of them in a `boxW` x `boxH` box, wrapping at most MAX_CHIPS_PER_ROW to a
 * line, and the line length that achieves it.
 */
function bestChipFit(n: number, boxW: number, boxH: number): { side: number; cols: number } {
    const maxCols = Math.min(n, MAX_CHIPS_PER_ROW);
    let bestSide = 0;
    let bestCols = maxCols;
    for (let cols = 1; cols <= maxCols; cols++) {
        const side = Math.min(boxW / cols, boxH / Math.ceil(n / cols));
        if (side > bestSide) {
            bestSide = side;
            bestCols = cols;
        }
    }
    return { side: bestSide, cols: bestCols };
}

type GetTexture = (key: string) => Texture | undefined;
type LevelBucket = Readonly<{ label: string; count: number; unitSize: 1 | 2 }>;
type LevelTab = Readonly<{ level: number; cont: Container; plate: Graphics; label: Text }>;

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
    /** Toggle button container */
    private toggleBtn = new Container();
    /** Soft halo behind the toggle, breathing on the ticker so the control reads as live. */
    private toggleGlow = new Graphics();
    private toggleGlowPhase = 0;
    private toggleGlowStep?: (ticker: Ticker) => void;
    /** The button's frame, drawn in the panel palette instead of the old ornate `arrow_button_*` art. */
    private toggleFrame = new Graphics();
    /** The chevron inside that frame. */
    private toggleArrow = new Graphics();
    /**
     * Where the panel is HEADING, as opposed to `isOpen`, which only flips once the slide finishes because
     * hit-testing keys off it. The button's colour and its chevron's beat follow the target, so both change
     * the instant the click lands rather than 350ms later.
     */
    private openTarget = true;
    /** Layout state */
    private overlayW = 0;
    private overlayH = 0;
    private leftColW = 0;
    private isOpen = true;
    private tweenCancel?: () => void;
    private allChips: UnitChip[] = [];
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

        this.content.addChild(this.backdrop, this.levelRail, this.rowsContainer);
        this.container.addChild(this.content);
        this.container.addChild(this.toggleBtn);

        this.app.stage.eventMode = "static";
        this.backdrop.eventMode = "none";

        // --- Toggle Button Setup ---
        this.toggleBtn.zIndex = 9999;
        this.toggleBtn.eventMode = "static";
        this.toggleBtn.cursor = "pointer";

        this.toggleBtn.addChild(this.toggleGlow, this.toggleFrame, this.toggleArrow);

        // A slow breath rather than a fixed halo: at rest the button is easy to miss against the panel, and
        // a moving highlight costs one alpha write per frame.
        this.toggleGlowStep = (ticker: Ticker) => {
            this.toggleGlowPhase += ticker.deltaMS / 1000;
            // Swings nearly the full range: the halo's own ring alphas are already fractional, so a timid
            // envelope on top of them left the pulse invisible.
            this.toggleGlow.alpha = 0.62 + 0.38 * Math.sin(this.toggleGlowPhase * 1.9);
            // Collapsed, the panel is gone and this disc is the only way back to it, so the chevron beats as
            // well as the halo. Open it holds still — a twitching arrow next to a full grid of chips is just
            // one more thing moving. Faster than the halo so the two read as separate, and scale only: the
            // rotation on this same object is the open/closed flip and must not be fought over.
            const beat = this.openTarget ? 1 : 1 + 0.14 * Math.sin(this.toggleGlowPhase * 3.6);
            this.toggleArrow.scale.set(beat);
        };
        this.app.ticker.add(this.toggleGlowStep);

        // Hover effects
        this.toggleBtn.on("pointerenter", () => {
            this.updateButtonVisuals(true);
        });

        this.toggleBtn.on("pointerleave", () => {
            this.updateButtonVisuals(false);
        });

        this.app.stage.addChild(this.container);
    }
    /**
     * Draws the collapse toggle in the same language as the sidebar's action buttons — a dark panel with a
     * thin ember border — instead of the ornate `arrow_button_active/inactive` plates it used to blit. The
     * chevron points LEFT at rotation 0 (overlay open) and the container is flipped 180° when closed.
     */
    private updateButtonVisuals(isHovered: boolean): void {
        const r = this.btnRadius;
        if (r <= 0) {
            return;
        }
        const size = r * 2;
        const accent = this.openTarget
            ? isHovered
                ? TOGGLE_OPEN_COLOR_HOVER
                : TOGGLE_OPEN_COLOR
            : isHovered
              ? TOGGLE_CLOSED_COLOR_HOVER
              : TOGGLE_CLOSED_COLOR;

        // Halo: a few widening rings at falling alpha stand in for a blur, which Pixi Graphics has no cheap
        // equivalent of. The ticker fades the whole thing in and out.
        this.toggleGlow.clear();
        for (let ring = 0; ring < 5; ring++) {
            const t = ring / 4;
            this.toggleGlow
                .circle(0, 0, r * (1.0 + t * 0.6))
                .stroke({ color: accent, width: size * 0.13, alpha: (1 - t) * (isHovered ? 0.95 : 0.7) });
        }

        // A medallion rather than a plate: the overlay it belongs to is a grid of round creature chips, so a
        // disc reads as part of that furniture instead of as a stray tile. Double ring — a bright inner edge
        // over a dimmer outer one — is the same trick the chip frames use to lift off a dark panel without
        // needing an ornate border texture.
        this.toggleFrame
            .clear()
            .circle(0, 0, r * 0.96)
            .fill({ color: 0x0e0905, alpha: isHovered ? 0.97 : 0.9 })
            .circle(0, 0, r * 0.96)
            .stroke({ color: accent, width: Math.max(1, size * 0.045), alpha: isHovered ? 1 : 0.65 })
            .circle(0, 0, r * 0.76)
            .stroke({ color: accent, width: Math.max(1, size * 0.022), alpha: isHovered ? 0.55 : 0.28 });

        const a = r * 0.4;
        this.toggleArrow
            .clear()
            .moveTo(a * 0.62, -a)
            .lineTo(-a * 0.66, 0)
            .lineTo(a * 0.62, a)
            .stroke({ color: accent, width: Math.max(2, size * 0.095), join: "round", cap: "round" });
    }
    public handlePointerDown(globalX: number, globalY: number): boolean {
        const localOverlay = this.container.toLocal({ x: globalX, y: globalY });
        const insideOverlay =
            localOverlay.x >= 0 &&
            localOverlay.y >= 0 &&
            localOverlay.x <= this.overlayW &&
            localOverlay.y <= this.overlayH;

        const localToggle = this.toggleBtn.toLocal({ x: globalX, y: globalY });
        if (localToggle.x * localToggle.x + localToggle.y * localToggle.y <= this.btnRadius * this.btnRadius) {
            this.toggle();
            return true;
        }

        if (!this.isOpen) return false;

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
                const unitName = (chip as UnitChip).nameKey as string;
                const next = this.selectedName === unitName ? null : unitName;
                this.selectedName = next;

                for (const c of this.allChips) {
                    c.setSelected((c as UnitChip).nameKey === next);
                }

                if (this.onUnitSelected) {
                    this.onUnitSelected(next ? this.getUnitProperties(unitName) : null);
                }
                return true;
            }
        }

        if (insideOverlay) {
            if (this.hasSelection()) this.clearSelection(true);
            return true;
        }

        return false;
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
        this.levelRail.removeChildren();
        this.rowsContainer.removeChildren();
        this.allChips = [];
        this.levelTabs = [];
        this.selectedName = null;

        // Level tabs down the left rail, abbreviated to L1..L4 — the rail is only ~1.5 cells wide, and the
        // full "LEVEL 1" wording only fitted when it was a banner spanning a whole column.
        for (let i = 0; i < this.levelBuckets.length; i++) {
            const cont = new Container();
            const plate = new Graphics();
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
            cont.eventMode = "static";
            cont.cursor = "pointer";
            cont.addChild(plate, label);
            this.levelRail.addChild(cont);
            this.levelTabs.push({ level: i + 1, cont, plate, label });
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
                    // 512 art: the chips render at ~90css px (180 device px on retina), where the small
                    // 128/256 textures visibly blur. The 512s are already loaded for the board units.
                    const tex = this.getTex(unitToTextureName(unitName, TextureType.LARGE, sizeFlag));

                    const chip = new UnitChip({
                        unitName,
                        texture: tex ?? Texture.EMPTY,
                        getAmount: () => (this.getAmount ? this.getAmount(unitName) : unitProperties.amount_alive),
                    });
                    chip.setTicker(this.app.ticker);
                    bucketCont.addChild(chip);
                    this.allChips.push(chip);
                }
            }
        }

        this.updateButtonVisuals(false);

        this.onResize(this.app.renderer.width, this.app.renderer.height);
        this.container.sortChildren();
    }
    /** Expand one level and collapse the rest. Chips of a collapsed level are hidden, so they also stop
     *  answering hit-tests — the pointer code walks `allChips` flat and cannot otherwise tell them apart. */
    private setSelectedLevel(level: number): void {
        // Never leave a creature from the collapsed row active in the player's hand. Besides being invisible,
        // that stale selection makes the next board click place the old level before the player has actually
        // picked a creature from the newly expanded row.
        this.clearSelection(true);
        this.selectedLevel = level;
        this.onResize(this.app.renderer.width, this.app.renderer.height);
    }
    public onResize(stageW: number, stageH: number): void {
        if (stageW <= 0 || stageH <= 0) return;
        // The overlay is destroyed once the fight starts; a later resize (e.g. rematch's
        // fitViewToWindow) must not touch its torn-down container.
        if (this.container.destroyed) return;

        const boardSide = Math.min(stageW, stageH);
        const cell = boardSide / 16;
        this.cellSize = cell;

        this.overlayW = 16 * cell;
        this.overlayH = 4 * cell;

        const boardX = (stageW - boardSide) / 2;
        const boardY = (stageH - boardSide) / 2;
        const overlayX = boardX;
        const overlayY = boardY + (boardSide - this.overlayH) / 2;

        this.container.position.set(overlayX, overlayY);

        this.leftColW = 1.5 * cell;
        const levelCols = this.levelBuckets.length;
        // EVERYTHING lives inside the panel's own 4 cells; nothing is drawn above y=0, or it would spill into
        // the red deployment zone. There used to be a header band across the top carrying a faction crest per
        // column, which spent a quarter of the panel's height on four small labels — the columns are already
        // in a fixed order and the creatures in them say which race they are. With it gone the creature grid
        // runs the full four cells and the chips grow by about a third.
        const toggleSize = cell * TOGGLE_BUTTON_CELL_FRACTION;
        this.backdrop.clear();
        this.backdrop.rect(0, 0, this.overlayW, this.overlayH).fill({ color: 0x000000, alpha: 0.8 });

        // A frame around the whole creature grid, with hairlines dividing the faction blocks inside it.
        // Without the dividers one faction's clump runs into the next; without the frame the grid has no
        // edge and drifts into the rail. Both are appended to the backdrop (already cleared and filled
        // above) so they cost no extra display objects, and both span exactly the same band so the lines
        // meet the frame instead of stopping short of it.
        const gridInset = cell * 0.07;
        const gridX = this.leftColW + gridInset;
        const gridY = gridInset;
        const gridW = this.overlayW - gridX - gridInset;
        const gridH = this.overlayH - gridY - gridInset;
        const hairline = Math.max(1, cell * 0.014);

        // How the four faction blocks tile that grid. Decided per level rather than fixed: score each
        // candidate by the SMALLEST chip any faction would end up with and take the best. Four blocks in a
        // row wins while a faction fields four creatures; at levels 3 and 4 they field three, and a 2x2 of
        // blocks with the three on one line gives noticeably larger art than a tall, narrow quarter-column.
        const selectedRow = this.rowsContainer.children[this.selectedLevel - 1] as Container | undefined;
        const bucketCounts = this.factions.map(
            (_, f) => (selectedRow?.children[f] as Container | undefined)?.children.length ?? 0,
        );

        let blockCols = this.factions.length;
        let blockRows = 1;
        let bestBlockScore = -1;
        for (const candidate of BLOCK_LAYOUTS) {
            const boxW = (gridW / candidate.cols) * BLOCK_FILL;
            const boxH = (gridH / candidate.rows) * BLOCK_FILL;
            let smallest = Number.POSITIVE_INFINITY;
            for (const n of bucketCounts) {
                if (n > 0) smallest = Math.min(smallest, bestChipFit(n, boxW, boxH).side);
            }
            if (smallest !== Number.POSITIVE_INFINITY && smallest > bestBlockScore) {
                bestBlockScore = smallest;
                blockCols = candidate.cols;
                blockRows = candidate.rows;
            }
        }

        const blockW = gridW / blockCols;
        const blockH = gridH / blockRows;
        const blockX = (index: number) => gridX + (index % blockCols) * blockW;
        const blockY = (index: number) => gridY + Math.floor(index / blockCols) * blockH;

        this.backdrop
            .roundRect(gridX, gridY, gridW, gridH, Math.min(9, cell * 0.14))
            .stroke({ color: 0xdcb158, width: hairline, alpha: 0.34 });

        for (let i = 1; i < blockCols; i++) {
            this.backdrop
                .moveTo(gridX + i * blockW, gridY)
                .lineTo(gridX + i * blockW, gridY + gridH)
                .stroke({ color: 0xdcb158, width: hairline, alpha: 0.26 });
        }
        for (let i = 1; i < blockRows; i++) {
            this.backdrop
                .moveTo(gridX, gridY + i * blockH)
                .lineTo(gridX + gridW, gridY + i * blockH)
                .stroke({ color: 0xdcb158, width: hairline, alpha: 0.26 });
        }

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
        const selectedTabH = Math.min(railH * 0.3, cell * 0.9);
        const plainTabH = Math.min(railH * 0.17, cell * 0.5);
        const tabGap = Math.min(railH * 0.055, cell * 0.18);
        const tabsTotalH =
            selectedTabH + plainTabH * (this.levelBuckets.length - 1) + tabGap * (this.levelBuckets.length - 1);
        let tabCursorY = railTop + (railH - tabsTotalH) * 0.5;

        for (const tab of this.levelTabs) {
            const isSelected = tab.level === this.selectedLevel;
            const plateH = isSelected ? selectedTabH : plainTabH;
            // Capped against the CELL, not the rail: centred on railCentreX a rail-width plate would hang
            // off the panel's left edge.
            const plateW = Math.min(this.leftColW * (isSelected ? 0.78 : 0.6), cell * (isSelected ? 0.92 : 0.72));
            const accent = isSelected ? 0xff8f00 : 0xdcb158;

            tab.cont.position.set(railCentreX, tabCursorY + plateH * 0.5);
            tabCursorY += plateH + tabGap;
            tab.plate
                .clear()
                .roundRect(-plateW * 0.5, -plateH * 0.5, plateW, plateH, Math.min(6, plateH * 0.28))
                .fill({ color: isSelected ? 0x2a1705 : 0x0e0905, alpha: isSelected ? 0.95 : 0.75 })
                .stroke({ color: accent, width: Math.max(1, plateH * 0.06), alpha: isSelected ? 1 : 0.45 });
            tab.label.style.fontSize = Math.max(9, Math.round(plateH * 0.46));
            tab.label.style.fill = accent;
            tab.cont.hitArea = new Rectangle(-plateW * 0.5, -plateH * 0.5, plateW, plateH);
        }

        // --- Creature buckets: the open level fills the grid, full height ---
        for (let b = 0; b < levelCols; b++) {
            const rowCont = this.rowsContainer.children[b] as Container;
            const isSelected = b + 1 === this.selectedLevel;
            // Buckets carry their own absolute block origin, so the row itself sits at the panel origin.
            rowCont.position.set(0, 0);
            rowCont.visible = isSelected;

            if (!isSelected) {
                continue;
            }

            for (let f = 0; f < this.factions.length; f++) {
                const bucketCont = rowCont.children[f] as Container;
                bucketCont.position.set(blockX(f), blockY(f));

                const chips = bucketCont.children as unknown as UnitChip[];
                const n = chips.length;
                if (!n) {
                    continue;
                }

                // Wrap the faction's creatures into whichever line length makes the chips largest inside
                // its block — the same measure that chose the block tiling above, so the two agree.
                const { side: spacing, cols: bestCols } = bestChipFit(n, blockW * BLOCK_FILL, blockH * BLOCK_FILL);
                const rows = Math.ceil(n / bestCols);
                const iconSide = spacing * 0.9;

                // The SHORT line goes on top. An odd count (3 of 2) reads better as a single crowning icon
                // over a full pair than as a full pair with an orphan hanging underneath it.
                const perRow: number[] = [];
                const remainder = n - (rows - 1) * bestCols;
                for (let r = 0; r < rows; r++) {
                    perRow.push(r === 0 ? remainder : bestCols);
                }

                const startY = blockH * 0.5 - ((rows - 1) * spacing) / 2;
                let placed = 0;
                for (let r = 0; r < rows; r++) {
                    const inThisRow = perRow[r];
                    // Every line is centred on its own count, so a short one sits over the middle.
                    const startX = blockW * 0.5 - ((inThisRow - 1) * spacing) / 2;
                    for (let c = 0; c < inThisRow; c++) {
                        const chip = chips[placed++];
                        chip.layout(iconSide);
                        chip.position.set(startX + c * spacing, startY + r * spacing);
                    }
                }
            }
        }

        // --- Toggle Button ---
        // Head of the left rail (btnY was computed with the rail above); the overlay may not spill past the
        // 4-cell strip the board allots it, so nothing sits above y=0.
        this.toggleBtn.position.set(railCentreX, btnY);
        this.btnRadius = toggleSize * 0.5;

        this.updateButtonVisuals(false);

        // Radial, matching the disc that is drawn: a square hit area would have caught clicks on the panel
        // corners outside the medallion.
        this.toggleBtn.hitArea = new Circle(0, 0, this.btnRadius);

        this.content.x = this.isOpen ? 0 : -this.overlayW;
        this.content.alpha = this.isOpen ? 1 : 0;

        // 3. Rotated logic flipped: 0 if Open (Left), Math.PI if Closed (Right)
        // Only the chevron turns — the frame is a disc, so spinning it would be a no-op that merely
        // re-rasterised the rings.
        const rot = this.isOpen ? 0 : Math.PI;
        this.toggleArrow.rotation = rot;
    }
    public toggle(): void {
        this.animateTo(!this.isOpen, 350);
    }
    public hitToggle(globalX: number, globalY: number): boolean {
        const local = this.toggleBtn.toLocal({ x: globalX, y: globalY });
        return local.x * local.x + local.y * local.y <= this.btnRadius * this.btnRadius;
    }
    private animateTo(open: boolean, durationMs: number): void {
        if (this.tweenCancel) {
            this.tweenCancel();
            this.tweenCancel = undefined;
        }

        // Repaint the medallion straight away: green->red (or back) should land with the click, not 350ms
        // later when the slide finishes and `isOpen` finally catches up.
        this.openTarget = open;
        this.updateButtonVisuals(false);

        const startX = this.content.x;
        const startA = this.content.alpha;
        const endX = open ? 0 : -this.overlayW;
        const endA = open ? 1 : 0;

        const startRot = this.toggleArrow.rotation;
        // Logic flipped here too
        const endRot = open ? 0 : Math.PI;

        const start = performance.now();
        const ticker = this.app.ticker as Ticker;
        const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

        const step = () => {
            const now = performance.now();
            const p = Math.min(1, (now - start) / durationMs);
            const e = easeInOutQuad(p);

            this.content.x = startX + (endX - startX) * e;
            this.content.alpha = startA + (endA - startA) * e;

            const curRot = startRot + (endRot - startRot) * e;
            this.toggleArrow.rotation = curRot;

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
    }
    public destroy(): void {
        if (this.tweenCancel) this.tweenCancel();
        if (this.toggleGlowStep) {
            this.app.ticker.remove(this.toggleGlowStep);
            this.toggleGlowStep = undefined;
        }
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
