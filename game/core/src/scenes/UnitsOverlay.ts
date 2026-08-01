// game/core/src/overlays/UnitsOverlay.ts
import { Application, Circle, Container, Rectangle, Sprite, Text, TextStyle, Texture, Graphics, Ticker } from "pixi.js";

import { unitToTextureName, TextureType } from "../pixi/PixiUnitsFactory";
import { UnitChip } from "./UnitChip";

import { UNIT_ID_TO_NAME } from "../ui/unit_ui_constants";
import { SYNERGY_NAME_TO_DESCRIPTION } from "../ui/LeftSideBar/SynergiesConstants";

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
    SynergyKeysToPower,
} from "@heroesofcrypto/common";
import type { UnitLevelId } from "@heroesofcrypto/common";
import { BASE_UNIT_STACK_TO_SPAWN_EXP } from "@/statics";

/** The app's own stack — same as style.scss's <body> rule and the board labels in RenderableUnit. */
const OVERLAY_FONT_FAMILY = '"Open Sans", Verdana, sans-serif';
/** Placeholder size only; layout() sets the real one from the row height on every resize. */
const OVERLAY_LEVEL_LABEL_BASE_SIZE = 24;

/** Collapse-toggle diameter, as a fraction of a board cell. The faction crests are sized off it. */
const TOGGLE_BUTTON_CELL_FRACTION = 0.64;
/** Faction crest diameter, relative to the toggle. */
const CREST_TOGGLE_SIZE_RATIO = 0.8;
/** Which of a faction's two synergies the crest's hover card describes. */
const PRIMARY_SYNERGY_INDEX = 1;

type GetTexture = (key: string) => Texture | undefined;
type LevelBucket = Readonly<{ label: string; count: number; unitSize: 1 | 2 }>;
/**
 * A faction crest. The source art is a square plate with the emblem inside it, so it is masked down to the
 * inscribed circle rather than re-cut on disk — one mask covers all four and the textures stay untouched.
 */
type FactionIcon = Readonly<{ type: FactionType; cont: Container; sprite: Sprite; mask: Graphics; ring: Graphics }>;
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
    /** Faction crests, one per column, along the top band. */
    private headerContainer = new Container();
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
    /** Hover card for a faction crest: the race and what its synergies give at each level. */
    private crestTooltip = new Container();
    private crestTooltipPlate = new Graphics();
    private crestTooltipText = new Text({
        text: "",
        style: new TextStyle({
            fontFamily: OVERLAY_FONT_FAMILY,
            fill: 0xefe4cc,
            fontSize: 12,
            fontWeight: "600",
        }),
    });
    /** Layout state */
    private overlayW = 0;
    private overlayH = 0;
    private leftColW = 0;
    private isOpen = true;
    private tweenCancel?: () => void;
    private allChips: UnitChip[] = [];
    private chipFactions = new Map<UnitChip, FactionType>();
    private factionIcons: FactionIcon[] = [];
    private levelTabs: LevelTab[] = [];
    /** Which crest the pointer is over, so a resize can re-place the open card. */
    private hoveredCrest: FactionType | null = null;
    /** Last board cell size, kept for the tooltip which is laid out outside onResize. */
    private cellSize = 0;
    /** The one expanded level. Starts on L1 so the overlay opens showing something rather than a bare ladder. */
    private selectedLevel = 1;
    private selectedName: string | null = null;
    private selectedFaction: FactionType | null = null;
    private readonly factions: { type: FactionType; iconName: string }[] = [
        { type: FactionVals.LIFE, iconName: "life_128" },
        { type: FactionVals.NATURE, iconName: "nature_128" },
        { type: FactionVals.CHAOS, iconName: "chaos_128" },
        { type: FactionVals.MIGHT, iconName: "might_128" },
    ];
    private btnRadius = 0;
    private levelBuckets: LevelBucket[] = [];
    private onUnitSelected?: (unitProperties: UnitProperties | null) => void;
    public constructor(
        app: Application,
        getTexture: GetTexture,
        onUnitSelected?: (unitProperties: UnitProperties | null) => void,
        private getAmount?: (unitName: string) => number,
        private onFactionSelected?: (faction: FactionType | null) => void,
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

        this.content.addChild(this.backdrop, this.headerContainer, this.levelRail, this.rowsContainer);
        this.container.addChild(this.content);
        this.container.addChild(this.toggleBtn);

        this.crestTooltip.zIndex = 10000;
        this.crestTooltip.visible = false;
        this.crestTooltip.eventMode = "none";
        this.crestTooltip.addChild(this.crestTooltipPlate, this.crestTooltipText);
        this.container.addChild(this.crestTooltip);

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
        const accent = isHovered ? 0xff8f00 : 0xdcb158;

        // Halo: a few widening rings at falling alpha stand in for a blur, which Pixi Graphics has no cheap
        // equivalent of. The ticker fades the whole thing in and out.
        this.toggleGlow.clear();
        for (let ring = 0; ring < 5; ring++) {
            const t = ring / 4;
            this.toggleGlow
                .circle(0, 0, r * (1.0 + t * 0.6))
                .stroke({ color: accent, width: size * 0.13, alpha: (1 - t) * (isHovered ? 0.95 : 0.7) });
        }

        // A medallion rather than a plate: the overlay it belongs to is a grid of round creature chips and
        // round faction crests, so a disc reads as part of that furniture instead of as a stray tile. Double
        // ring — a bright inner edge over a dimmer outer one — is the same trick the chip frames use to lift
        // off a dark panel without needing an ornate border texture.
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

        // Level tabs come first: they sit in the left rail, clear of both the crests and the chips, and a
        // hit there swaps which band is expanded rather than selecting anything.
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

        // Crests are hover-only now — they describe a race rather than filtering by it, so a click there
        // falls through to the "clicked empty panel" branch below like any other dead space.

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
                this.selectedFaction = null;

                for (const c of this.allChips) {
                    c.setSelected((c as UnitChip).nameKey === next);
                }
                this.updateFactionIconSelection();

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
        this.headerContainer.removeChildren();
        this.levelRail.removeChildren();
        this.rowsContainer.removeChildren();
        this.allChips = [];
        this.chipFactions.clear();
        this.factionIcons = [];
        this.levelTabs = [];
        this.selectedName = null;
        this.selectedFaction = null;

        // Faction crests are the COLUMN headings now — the grid was transposed so that the thing you scan
        // across (which race) sits along the top, and the thing you step through (which level) runs down the
        // side as an accordion.
        for (const faction of this.factions) {
            const cont = new Container();
            const sprite = new Sprite(this.getTex(faction.iconName) ?? Texture.EMPTY);
            sprite.anchor.set(0.5);
            const mask = new Graphics();
            const ring = new Graphics();
            sprite.mask = mask;
            cont.addChild(sprite, mask, ring);
            // Hover only: the crests explain what a race brings, they are not a filter you click. Selecting
            // is reserved for the creatures themselves.
            cont.eventMode = "static";
            cont.cursor = "default";
            cont.on("pointerenter", () => this.showCrestTooltip(faction.type));
            cont.on("pointerleave", () => this.hideCrestTooltip());
            this.headerContainer.addChild(cont);
            this.factionIcons.push({ type: faction.type, cont, sprite, mask, ring });
        }

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
                    const tex = this.getTex(unitToTextureName(unitName, TextureType.SMALL, sizeFlag));

                    const chip = new UnitChip({
                        unitName,
                        texture: tex ?? Texture.EMPTY,
                        getAmount: () => (this.getAmount ? this.getAmount(unitName) : unitProperties.amount_alive),
                    });
                    chip.setTicker(this.app.ticker);
                    bucketCont.addChild(chip);
                    this.allChips.push(chip);
                    this.chipFactions.set(chip, faction.type);
                }
            }
        }

        this.updateButtonVisuals(false);
        this.updateFactionIconSelection();

        this.onResize(this.app.renderer.width, this.app.renderer.height);
        this.container.sortChildren();
    }
    /**
     * The race, then what its PRIMARY synergy grants at levels 1/2/3 — Life's supply, Chaos's movement, and
     * so on. Each faction also has a second synergy, but listing both made the card twice as tall and buried
     * the one thing the crest is there to answer. The wording and the numbers come from the same pair the
     * sidebar's synergy badges use, so the two never drift: descriptions carry `{}` slots that
     * SynergyKeysToPower fills.
     */
    private buildCrestTooltipText(factionType: FactionType): string {
        const factionName = ToFactionName[factionType];
        const levels = [1, 2, 3];
        const key = (level: number) => `${factionName}:${PRIMARY_SYNERGY_INDEX}:${level}`;

        // The three levels share one sentence and differ only in their numbers, so it is written ONCE with
        // each figure spelled out as "6/12/19" instead of repeating the sentence per level. A template may
        // carry more than one slot (Life's second synergy pairs morale with luck); each slot gets its own
        // run of level values, taken column-wise out of SynergyKeysToPower.
        const template = SYNERGY_NAME_TO_DESCRIPTION[key(1) as keyof typeof SYNERGY_NAME_TO_DESCRIPTION];
        const lines: string[] = [factionName.toUpperCase()];

        if (template) {
            const powersByLevel = levels.map((level) => SynergyKeysToPower[key(level)] ?? []);
            const slotCount = (template.match(/\{\}/g) ?? []).length;
            let filled = template;
            for (let slot = 0; slot < slotCount; slot++) {
                const perLevel = powersByLevel.map((powers) => powers[slot]).filter((p) => p !== undefined);
                filled = filled.replace("{}", perLevel.join("/"));
            }
            lines.push("", filled);
        }

        return lines.join("\n");
    }
    private showCrestTooltip(factionType: FactionType): void {
        this.hoveredCrest = factionType;
        this.crestTooltipText.text = this.buildCrestTooltipText(factionType);
        this.crestTooltip.visible = true;
        this.layoutCrestTooltip();
    }
    private hideCrestTooltip(): void {
        this.hoveredCrest = null;
        this.crestTooltip.visible = false;
    }
    private layoutCrestTooltip(): void {
        const icon = this.factionIcons.find((f) => f.type === this.hoveredCrest);
        if (!icon || this.cellSize <= 0) {
            return;
        }

        const pad = Math.max(5, this.cellSize * 0.12);
        const fontSize = Math.max(9, Math.round(this.cellSize * 0.2));
        this.crestTooltipText.style.fontSize = fontSize;
        this.crestTooltipText.style.lineHeight = Math.round(fontSize * 1.4);
        this.crestTooltipText.position.set(pad, pad);

        const w = this.crestTooltipText.width + pad * 2;
        const h = this.crestTooltipText.height + pad * 2;

        this.crestTooltipPlate
            .clear()
            .roundRect(0, 0, w, h, Math.min(7, pad))
            .fill({ color: 0x0b0704, alpha: 1 })
            .stroke({ color: 0xdcb158, width: Math.max(1, pad * 0.16), alpha: 0.75 });

        // The crest lives inside `content`, which slides left when the overlay collapses; the card lives on
        // the root container, so the slide has to be added back in by hand.
        const centreX = this.content.x + icon.cont.x;
        const x = Math.max(4, Math.min(centreX - w * 0.5, this.overlayW - w - 4));
        this.crestTooltip.position.set(x, icon.cont.y + this.cellSize * 0.5);
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
        // EVERYTHING lives inside the panel's own 4 cells. The header used to be drawn above y=0, which made
        // the overlay taller than the strip the board gives it — the crests spilled into the red deployment
        // zone and the chips into the green one. So the top strip is carved OUT of overlayH instead of added
        // on top of it, and the backdrop is exactly the 4-cell band.
        const toggleSize = cell * TOGGLE_BUTTON_CELL_FRACTION;
        const headerH = Math.min(this.overlayH * 0.24, toggleSize * 1.45);
        const bodyY = headerH;
        const bodyH = this.overlayH - headerH;
        this.backdrop.clear();
        this.backdrop.rect(0, 0, this.overlayW, this.overlayH).fill({ color: 0x000000, alpha: 0.8 });

        // Columns are FACTIONS now, and every faction fields the same number of creatures per level, so the
        // per-level width weighting the old level-columns needed is gone: equal columns throughout.
        const availW = this.overlayW - this.leftColW;
        const colW = availW / this.factions.length;
        const colX = (index: number) => this.leftColW + index * colW;

        // A frame around the whole creature grid, with hairlines dividing the faction columns inside it.
        // Without the dividers a 1-over-2 bucket beside a 2-over-2 one reads as one ragged clump; without
        // the frame the grid has no edge and drifts into the rail and the crest band. Both are appended to
        // the backdrop (already cleared and filled above) so they cost no extra display objects, and both
        // span exactly the same band so the lines meet the frame instead of stopping short of it.
        const gridInset = cell * 0.07;
        const gridX = this.leftColW + gridInset;
        const gridY = headerH;
        const gridW = this.overlayW - gridX - gridInset;
        const gridH = this.overlayH - gridY - gridInset;
        const hairline = Math.max(1, cell * 0.014);

        this.backdrop
            .roundRect(gridX, gridY, gridW, gridH, Math.min(9, cell * 0.14))
            .stroke({ color: 0xdcb158, width: hairline, alpha: 0.34 });

        for (let i = 1; i < this.factions.length; i++) {
            this.backdrop
                .moveTo(colX(i), gridY)
                .lineTo(colX(i), gridY + gridH)
                .stroke({ color: 0xdcb158, width: hairline, alpha: 0.26 });
        }

        // --- Faction crests along the top band ---
        // Sized off the collapse toggle so the two round controls on this band stay related, but a step
        // smaller than it — the crests are labels for the columns, not a control competing with the chips.
        const crestSide = toggleSize * CREST_TOGGLE_SIZE_RATIO;
        const crestR = crestSide * 0.5;
        for (const icon of this.factionIcons) {
            const i = this.factions.findIndex((f) => f.type === icon.type);
            icon.cont.position.set(colX(i) + colW * 0.5, headerH * 0.5);
            icon.sprite.width = icon.sprite.height = crestSide;
            // The emblem is inscribed in the square plate, so the plate's corners are the only thing lost.
            icon.mask.clear().circle(0, 0, crestR).fill({ color: 0xffffff });
            icon.ring
                .clear()
                .circle(0, 0, crestR)
                .stroke({ color: 0xdcb158, width: Math.max(1, crestSide * 0.045), alpha: 0.5 });
            icon.cont.hitArea = new Circle(0, 0, crestR);
        }

        // --- Level tabs down the left rail ---
        // The tabs are the ONLY thing the unselected levels occupy. Laid out as a STACK with one fixed gap
        // between neighbours, then centred: giving each tab an equal slot instead made the gaps depend on
        // how much smaller its plate was than the slot, so the selected (taller) tab appeared to push its
        // neighbours away while L1/L2 sat tight against each other.
        const selectedTabH = Math.min(bodyH * 0.26, cell * 0.9);
        const plainTabH = Math.min(bodyH * 0.15, cell * 0.5);
        const tabGap = Math.min(bodyH * 0.05, cell * 0.18);
        const tabsTotalH =
            selectedTabH + plainTabH * (this.levelBuckets.length - 1) + tabGap * (this.levelBuckets.length - 1);
        let tabCursorY = bodyY + (bodyH - tabsTotalH) * 0.5;

        for (const tab of this.levelTabs) {
            const isSelected = tab.level === this.selectedLevel;
            const plateH = isSelected ? selectedTabH : plainTabH;
            const plateW = this.leftColW * (isSelected ? 0.78 : 0.6);
            const accent = isSelected ? 0xff8f00 : 0xdcb158;

            tab.cont.position.set(this.leftColW * 0.5, tabCursorY + plateH * 0.5);
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

        // --- Creature buckets: the open level fills the whole body, full height ---
        for (let b = 0; b < levelCols; b++) {
            const rowCont = this.rowsContainer.children[b] as Container;
            const isSelected = b + 1 === this.selectedLevel;
            rowCont.position.set(0, bodyY);
            rowCont.visible = isSelected;

            if (!isSelected) {
                continue;
            }

            const bandH = bodyH;
            for (let f = 0; f < this.factions.length; f++) {
                const bucketCont = rowCont.children[f] as Container;
                bucketCont.position.set(colX(f), 0);

                const chips = bucketCont.children as unknown as UnitChip[];
                const n = chips.length;
                if (!n) {
                    continue;
                }

                // Wrap the faction's creatures into whichever grid makes the chips largest inside the
                // column box. With the full panel height to play with, two shorter lines beat one long one
                // by a wide margin — which is where the extra size comes from.
                const boxW = colW * 0.94;
                const boxH = bandH * 0.94;
                let bestCols = n;
                let bestSide = 0;
                for (let cols = 1; cols <= n; cols++) {
                    const rows = Math.ceil(n / cols);
                    const side = Math.min(boxW / cols, boxH / rows);
                    if (side > bestSide) {
                        bestSide = side;
                        bestCols = cols;
                    }
                }
                const rows = Math.ceil(n / bestCols);
                const spacing = bestSide;
                const iconSide = bestSide * 0.9;

                // The SHORT line goes on top. An odd count (3 of 2) reads better as a single crowning icon
                // over a full pair than as a full pair with an orphan hanging underneath it.
                const perRow: number[] = [];
                const remainder = n - (rows - 1) * bestCols;
                for (let r = 0; r < rows; r++) {
                    perRow.push(r === 0 ? remainder : bestCols);
                }

                const startY = bandH * 0.5 - ((rows - 1) * spacing) / 2;
                let placed = 0;
                for (let r = 0; r < rows; r++) {
                    const inThisRow = perRow[r];
                    // Every line is centred on its own count, so a short one sits over the middle.
                    const startX = colW * 0.5 - ((inThisRow - 1) * spacing) / 2;
                    for (let c = 0; c < inThisRow; c++) {
                        const chip = chips[placed++];
                        chip.layout(iconSide);
                        chip.position.set(startX + c * spacing, startY + r * spacing);
                    }
                }
            }
        }

        // --- Toggle Button ---
        // 1. Size reduced to 80% of cell
        const btnSize = cell * TOGGLE_BUTTON_CELL_FRACTION;

        // 2. Inside the panel's own top-left, above the level rail — the overlay may not spill past the
        // 4-cell strip the board allots it, so nothing sits above y=0 any more.
        const btnX = this.leftColW * 0.5;
        const btnY = headerH * 0.5;

        this.toggleBtn.position.set(btnX, btnY);
        this.btnRadius = btnSize * 0.5;

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

        this.layoutCrestTooltip();
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
        this.chipFactions.clear();
    }
    public hasSelection(): boolean {
        return this.selectedName !== null || this.selectedFaction !== null;
    }
    public clearSelection(notify: boolean = true): void {
        if (!this.hasSelection()) return;
        const hadUnitSelection = this.selectedName !== null;
        const hadFactionSelection = this.selectedFaction !== null;
        this.selectedName = null;
        this.selectedFaction = null;
        for (const c of this.allChips) c.setSelected(false);
        this.updateFactionIconSelection();
        if (notify && hadUnitSelection && this.onUnitSelected) this.onUnitSelected(null);
        if (notify && hadFactionSelection && this.onFactionSelected) this.onFactionSelected(null);
    }
    private updateFactionIconSelection(): void {
        for (const factionIcon of this.factionIcons) {
            const selected = this.selectedFaction === factionIcon.type;
            factionIcon.sprite.alpha = !this.selectedFaction || selected ? 1 : 0.55;
            factionIcon.sprite.tint = selected ? 0xffffff : 0xd0d0d0;
            // The ring is the only frame a masked crest has left, so it carries the selected state too.
            factionIcon.ring.tint = selected ? 0xff8f00 : 0xffffff;
            factionIcon.ring.alpha = selected ? 1 : !this.selectedFaction ? 1 : 0.5;
        }
        for (const chip of this.allChips) {
            const chipFaction = this.chipFactions.get(chip);
            chip.alpha = !this.selectedFaction || chipFaction === this.selectedFaction ? 1 : 0.38;
        }
    }
    public setShowAllAmounts(show: boolean): void {
        for (const c of this.allChips) {
            c.setForceBadgeVisible(show);
        }
    }
}
