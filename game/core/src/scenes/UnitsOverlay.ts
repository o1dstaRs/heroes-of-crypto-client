// game/core/src/overlays/UnitsOverlay.ts
import { Application, Container, Sprite, Texture, Graphics, Ticker, Rectangle } from "pixi.js";

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

type GetTexture = (key: string) => Texture | undefined;
type LevelBucket = Readonly<{ label: string; count: number; unitSize: 1 | 2 }>;

export class UnitsOverlay {
    private app: Application;
    private getTex: GetTexture;
    /** Root overlay container */
    public readonly container = new Container();
    /** Holds backdrop + headers + rows */
    private content = new Container();
    private backdrop = new Graphics();
    private headerContainer = new Container();
    private rowsContainer = new Container();
    /** Toggle button container */
    private toggleBtn = new Container();
    /** The sprite displaying the arrow texture (Primary) */
    private toggleSprite = new Sprite();
    /** Fallback graphic if texture is missing (Secondary) */
    private toggleArrowFallback = new Graphics();
    /** Layout state */
    private overlayW = 0;
    private overlayH = 0;
    private leftColW = 0;
    private rowH = 0;
    private isOpen = true;
    private tweenCancel?: () => void;
    private allChips: UnitChip[] = [];
    private selectedName: string | null = null;
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
    ) {
        this.app = app;
        this.getTex = getTexture;
        this.onUnitSelected = onUnitSelected;

        this.levelBuckets = CommonLevelBuckets.map(
            (b: LevelBucket): LevelBucket => ({
                label: b.label,
                count: b.count,
                unitSize: b.unitSize,
            }),
        );

        this.app.stage.sortableChildren = true;
        this.container.zIndex = 100;
        this.container.sortableChildren = true;

        this.content.addChild(this.backdrop, this.headerContainer, this.rowsContainer);
        this.container.addChild(this.content);
        this.container.addChild(this.toggleBtn);

        this.app.stage.eventMode = "static";
        this.backdrop.eventMode = "none";

        // --- Toggle Button Setup ---
        this.toggleBtn.zIndex = 9999;
        this.toggleBtn.eventMode = "static";
        this.toggleBtn.cursor = "pointer";

        // Fallback Vector Arrow (Visible if texture fails)
        this.toggleBtn.addChild(this.toggleArrowFallback);

        // Sprite (Visible if texture exists)
        this.toggleSprite.anchor.set(0.5);
        this.toggleBtn.addChild(this.toggleSprite);

        // Hover effects
        this.toggleBtn.on("pointerenter", () => {
            this.updateButtonVisuals(true);
        });

        this.toggleBtn.on("pointerleave", () => {
            this.updateButtonVisuals(false);
        });

        this.app.stage.addChild(this.container);
    }
    private updateButtonVisuals(isHovered: boolean): void {
        const texKey = isHovered ? "arrow_button_active" : "arrow_button_inactive";
        const tex = this.getTex(texKey);

        if (tex) {
            this.toggleSprite.texture = tex;
            this.toggleSprite.visible = true;
            this.toggleArrowFallback.visible = false;
        } else {
            this.toggleSprite.visible = false;
            this.toggleArrowFallback.visible = true;
            this.drawFallbackArrow(isHovered ? 0xffffff : 0xf6d87c);
        }
    }
    private drawFallbackArrow(color: number): void {
        const r = this.btnRadius * 0.6;
        // Updated to point LEFT by default (tip at negative x)
        // This aligns with the new rotation logic:
        // Open (Rot 0) -> Points Left
        // Closed (Rot 180) -> Points Right
        this.toggleArrowFallback
            .clear()
            .moveTo(r * 0.5, -r) // Top Right
            .lineTo(-r * 0.8, 0) // Tip (Left)
            .lineTo(r * 0.5, r) // Bottom Right
            .closePath()
            .fill({ color: color })
            .stroke({ color: 0x000000, width: 2, alpha: 0.8 });
    }
    public handlePointerDown(globalX: number, globalY: number): boolean {
        const localOverlay = this.container.toLocal({ x: globalX, y: globalY });
        const insideOverlay =
            localOverlay.x >= 0 &&
            localOverlay.y >= 0 &&
            localOverlay.x <= this.overlayW &&
            localOverlay.y <= this.overlayH;

        const localToggle = this.toggleBtn.toLocal({ x: globalX, y: globalY });
        if (Math.abs(localToggle.x) <= this.btnRadius && Math.abs(localToggle.y) <= this.btnRadius) {
            this.toggle();
            return true;
        }

        if (!this.isOpen) return false;

        for (const chip of this.allChips) {
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
            if (this.selectedName) this.clearSelection(true);
            return true;
        }

        return false;
    }
    private getUnitProperties(unitName: string): UnitProperties {
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
        this.rowsContainer.removeChildren();
        this.allChips = [];
        this.selectedName = null;

        // --- Render Textures instead of Text ---
        for (let i = 0; i < this.levelBuckets.length; i++) {
            const levelIndex = i + 1;
            const texName = `label_level_${levelIndex}`;
            const tex = this.getTex(texName);

            // Create Sprite with texture (or empty if missing)
            const sprite = new Sprite(tex ?? Texture.EMPTY);
            sprite.anchor.set(0.5);
            this.headerContainer.addChild(sprite);
        }

        for (let r = 0; r < this.factions.length; r++) {
            const row = new Container();
            this.rowsContainer.addChild(row);

            const iconTex = this.getTex(this.factions[r].iconName);
            const icon = new Sprite(iconTex ?? Texture.EMPTY);
            row.addChild(icon);

            for (let b = 0; b < this.levelBuckets.length; b++) {
                const bucketCont = new Container();
                row.addChild(bucketCont);

                const lvl = (b + 1) as UnitLevelId;
                const sizeFlag = this.levelBuckets[b].unitSize;
                const namesForLevel = getCreaturesOf(this.factions[r].type, lvl)
                    .map((id: CreatureId) => UNIT_ID_TO_NAME[id as number])
                    .filter(Boolean) as string[];

                for (const unitName of namesForLevel) {
                    const unitProperties = this.getUnitProperties(unitName);
                    const texName = unitToTextureName(unitName, TextureType.SMALL, sizeFlag);
                    const tex = this.getTex(texName);

                    const chip = new UnitChip({
                        unitName,
                        texture: tex ?? Texture.EMPTY,
                        getAmount: () => unitProperties.amount_alive,
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
    public onResize(stageW: number, stageH: number): void {
        if (stageW <= 0 || stageH <= 0) return;

        const boardSide = Math.min(stageW, stageH);
        const cell = boardSide / 16;

        this.overlayW = 16 * cell;
        this.overlayH = 4 * cell;

        const boardX = (stageW - boardSide) / 2;
        const boardY = (stageH - boardSide) / 2;
        const overlayX = boardX;
        const overlayY = boardY + (boardSide - this.overlayH) / 2;

        this.container.position.set(overlayX, overlayY);

        this.backdrop.clear();
        this.backdrop.rect(0, 0, this.overlayW, this.overlayH).fill({ color: 0x000000, alpha: 0.8 });

        this.leftColW = 1.5 * cell;
        const levelCols = this.levelBuckets.length;
        const colW = (this.overlayW - this.leftColW) / levelCols;
        this.rowH = this.overlayH / this.factions.length;

        // --- Position & Scale Texture Labels ---
        for (let i = 0; i < this.headerContainer.children.length; i++) {
            const s = this.headerContainer.children[i] as Sprite;

            // Position center of header cell.
            // UPDATED: Changed Y offset from -0.45 to -0.25 to move it closer to the overlay.
            s.position.set(this.leftColW + (i + 0.5) * colW, -0.38 * this.rowH);

            // Reset scale to 1 to measure natural size
            s.scale.set(1);

            if (s.texture && s.texture !== Texture.EMPTY) {
                // Constrain fitting: 90% of column width, 50% of available top space height
                const maxW = colW * 0.9;
                const maxH = this.rowH * 0.5;
                const scale = Math.min(maxW / s.width, maxH / s.height);
                s.scale.set(scale);
            }
        }

        for (let r = 0; r < this.factions.length; r++) {
            const rowCont = this.rowsContainer.children[r] as Container;
            rowCont.position.set(0, r * this.rowH);

            const icon = rowCont.children[0] as Sprite;
            icon.width = icon.height = cell;
            icon.position.set(this.leftColW * 0.5 - cell * 0.5, this.rowH * 0.5 - cell * 0.5);

            let childIndex = 1;
            for (let b = 0; b < levelCols; b++) {
                const bucketCont = rowCont.children[childIndex++] as Container;
                bucketCont.position.set(this.leftColW + b * colW, 0);

                const chips = bucketCont.children as unknown as UnitChip[];
                const n = chips.length;
                const iconSide = cell * (this.levelBuckets[b].unitSize === 2 ? 1.05 : 0.9);
                const spacing = Math.min(iconSide * 1.1, (colW * 0.85) / Math.max(1, n));
                const startX = colW * 0.5 - ((n - 1) * spacing) / 2;

                for (let i = 0; i < n; i++) {
                    chips[i].layout(iconSide);
                    chips[i].position.set(startX + i * spacing, this.rowH * 0.5);
                }
            }
        }

        // --- Toggle Button ---
        // 1. Size reduced to 80% of cell
        const btnSize = cell * 0.8;

        // 2. Position above overlay
        const btnX = this.leftColW * 0.5;
        const btnY = -btnSize * 0.6; // Keep tight to the top edge

        this.toggleBtn.position.set(btnX, btnY);
        this.btnRadius = btnSize * 0.5;

        this.toggleSprite.width = btnSize;
        this.toggleSprite.height = btnSize;

        this.drawFallbackArrow(0xf6d87c);

        this.toggleBtn.hitArea = new Rectangle(-this.btnRadius, -this.btnRadius, btnSize, btnSize);

        this.content.x = this.isOpen ? 0 : -this.overlayW;
        this.content.alpha = this.isOpen ? 1 : 0;

        // 3. Rotated logic flipped: 0 if Open (Left), Math.PI if Closed (Right)
        const rot = this.isOpen ? 0 : Math.PI;
        this.toggleSprite.rotation = rot;
        this.toggleArrowFallback.rotation = rot;
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

        const startX = this.content.x;
        const startA = this.content.alpha;
        const endX = open ? 0 : -this.overlayW;
        const endA = open ? 1 : 0;

        const startRot = this.toggleSprite.rotation;
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
            this.toggleSprite.rotation = curRot;
            this.toggleArrowFallback.rotation = curRot;

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
        this.container.destroy({ children: true });
        this.allChips.length = 0;
    }
    public hasSelection(): boolean {
        return this.selectedName !== null;
    }
    public clearSelection(notify: boolean = true): void {
        if (!this.selectedName) return;
        this.selectedName = null;
        for (const c of this.allChips) c.setSelected(false);
        if (notify && this.onUnitSelected) this.onUnitSelected(null);
    }
}
