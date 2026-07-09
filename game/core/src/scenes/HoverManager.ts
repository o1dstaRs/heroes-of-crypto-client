import { Sprite, Graphics, BlurFilter, Texture, Text } from "pixi.js";
import {
    FightStateManager,
    GridVals,
    IPlacement,
    Grid,
    PathHelper,
    UnitsHolder,
    AbilityFactory,
    TeamType,
    TeamVals,
    HoCMath,
    Unit,
    UnitProperties,
    GridMath,
    HoCLib,
    UnitVals,
    GridConstants,
} from "@heroesofcrypto/common";
import { SceneSettings } from "./SceneSettings";
import { PlacementManager } from "./PlacementManager";
import { TextureType, unitToTextureName } from "@/pixi/PixiUnitsFactory";

export interface ISandboxHoverContext {
    grid: Grid;
    pathHelper: PathHelper;
    unitsHolder: UnitsHolder;
    sceneSettings: SceneSettings;
    placementManager: PlacementManager;
    abilityFactory: AbilityFactory;

    // Callbacks
    texAny(name: string): Texture | undefined;
    attachToWorldRoot(obj: Sprite | Graphics | Text, zIndex: number): void;
    getPlacement(teamType: TeamType, placementIndex: number): IPlacement | undefined;
    // Wait, IPlacement IS imported in Sandbox.ts from common.

    // State access
    getMouseWorld(): HoCMath.XY;
    getCurrentActiveUnit(): Unit | undefined;
    getCurrentActivePathHashes(): Set<number> | undefined;
    getDraggingUnitId(): string | undefined;
    getDraggingUnitTeam(): TeamType | undefined;
    getSelectedUnitProperties(): UnitProperties | undefined;
    hasActiveSelection(): boolean;
}

export class HoverManager {
    private context: ISandboxHoverContext;
    // State moved from Sandbox
    public hoverPlacementCell?: HoCMath.XY = undefined;
    public hoverPlacementCellTeam?: TeamType = undefined;
    public hoverSelectedCells?: HoCMath.XY[];
    public hoverSelectedCellsSwitchToRed = false;
    // AI Support
    public hoverAttackUnits?: Unit[][];
    public hoverAttackFromCell?: HoCMath.XY = undefined;
    public hoverSpellCell?: HoCMath.XY = undefined;
    public hoverAbilityCell?: HoCMath.XY = undefined;
    private auraVisuals: Graphics[] = [];
    public hoverAttackTargetUnit?: Unit; // New state for attack target
    private hoverSilhouette?: Sprite;
    private hoverSilhouetteOutline?: Sprite;
    private hoverSilhouetteKey?: string;
    // Dedicated sprites for the opponent's relayed move aim. Kept separate from the local
    // hover silhouette so the two never clobber each other's visibility/position.
    private opponentIntentSilhouette?: Sprite;
    private opponentIntentOutline?: Sprite;
    private opponentIntentKey?: string;
    private hoverTargetSilhouette?: Sprite; // For enemy unit red highlight
    public hoveredUnitHighlight?: { x: number; y: number; w: number; h: number };
    public hoveredUnitId?: string;
    private hoverGlowPhase = 0;
    private boardHoverScale = 1;
    private boardHoverTargetScale = 1;
    private boardHoverYOffset = 0;
    private boardHoverTargetYOffset = 0;
    public boardHoverProps?: UnitProperties;
    public boardHoverCenter?: HoCMath.XY;
    private lastPlacementUnitId?: string;
    private lastPlacementTimestampSec = 0;
    private readonly hoverRearmDelaySec = 2.0;
    private auraGraphics: Graphics;
    private aoeGraphics: Graphics;
    public constructor(context: ISandboxHoverContext) {
        this.context = context;
        this.auraGraphics = new Graphics();
        this.aoeGraphics = new Graphics();
    }
    private isGraphicsUsable(graphics?: Graphics): graphics is Graphics {
        const state = graphics as (Graphics & { destroyed?: boolean; context?: unknown }) | undefined;
        return !!state && state.destroyed !== true && state.context !== null;
    }
    private safeClearGraphics(graphics?: Graphics): boolean {
        if (!this.isGraphicsUsable(graphics)) {
            return false;
        }
        try {
            graphics.clear();
            return true;
        } catch {
            return false;
        }
    }
    private safeAttachGraphics(graphics: Graphics, zIndex: number): boolean {
        if (!this.isGraphicsUsable(graphics)) {
            return false;
        }
        try {
            this.context.attachToWorldRoot(graphics, zIndex);
            return true;
        } catch {
            return false;
        }
    }
    private ensureAuraGraphics(): Graphics | undefined {
        if (this.isGraphicsUsable(this.auraGraphics)) {
            return this.auraGraphics;
        }
        const graphics = new Graphics();
        if (!this.safeAttachGraphics(graphics, 51)) {
            graphics.destroy();
            return undefined;
        }
        this.auraGraphics = graphics;
        return graphics;
    }
    private ensureAOEGraphics(): Graphics | undefined {
        if (this.isGraphicsUsable(this.aoeGraphics)) {
            return this.aoeGraphics;
        }
        const graphics = new Graphics();
        if (!this.safeAttachGraphics(graphics, 4500)) {
            graphics.destroy();
            return undefined;
        }
        this.aoeGraphics = graphics;
        return graphics;
    }
    public onCameraChanged(): void {
        if (this.hoverSilhouette) this.context.attachToWorldRoot(this.hoverSilhouette, 110);
        if (this.hoverSilhouetteOutline) this.context.attachToWorldRoot(this.hoverSilhouetteOutline, 109);
        const auraGraphics = this.ensureAuraGraphics();
        const aoeGraphics = this.ensureAOEGraphics();
        if (auraGraphics) this.safeAttachGraphics(auraGraphics, 51); // Below units and movement path
        if (aoeGraphics) this.safeAttachGraphics(aoeGraphics, 4500); // Above units: AOE splash area
        if (this.isGraphicsUsable(this.spellBeam)) this.safeAttachGraphics(this.spellBeam, 2199);
        if (this.isGraphicsUsable(this.spellBadgeRing)) this.safeAttachGraphics(this.spellBadgeRing, 2202);
        if (this.spellBadgeIcon) this.context.attachToWorldRoot(this.spellBadgeIcon, 2203);
        if (this.spellBadgeText) this.context.attachToWorldRoot(this.spellBadgeText, 2203);
    }
    public clearAuraVisuals(): void {
        this.safeClearGraphics(this.auraGraphics);
    }
    public clearAOEArea(): void {
        this.safeClearGraphics(this.aoeGraphics);
    }
    /** Paint a single translucent square over the whole area-of-effect splash (its bounding box). */
    public drawAOEArea(cells: HoCMath.XY[]): void {
        const aoeGraphics = this.ensureAOEGraphics();
        if (!aoeGraphics) return;
        aoeGraphics.clear();
        if (!cells.length) return;
        const gs = this.context.sceneSettings.getGridSettings();
        const half = gs.getCellSize() / 2;
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const c of cells) {
            const pos = GridMath.getPositionForCell(c, gs.getMinX(), gs.getStep(), gs.getHalfStep());
            if (!pos) continue;
            minX = Math.min(minX, pos.x - half);
            maxX = Math.max(maxX, pos.x + half);
            minY = Math.min(minY, pos.y - half);
            maxY = Math.max(maxY, pos.y + half);
        }
        if (!Number.isFinite(minX)) return;
        aoeGraphics
            .rect(minX + 1, minY + 1, maxX - minX - 2, maxY - minY - 2)
            .fill({ color: 0xff3333, alpha: 0.18 })
            .stroke({ width: 2, color: 0xff6666, alpha: 0.85 });
    }
    public clear(): void {
        this.hoverAttackUnits = undefined;
        this.hoverAttackFromCell = undefined;
        this.hoverPlacementCell = undefined;
        this.hoverSelectedCells = undefined;
        this.hoverSpellCell = undefined;
        this.hoverAbilityCell = undefined;
        this.hoverAttackTargetUnit = undefined;
        this.hoveredUnitId = undefined;
        this.clearAuraVisuals();
        this.clearAOEArea();
    }
    public drawAuraArea(
        center: HoCMath.XY,
        radius: number,
        isBuff: boolean,
        isSmallUnit: boolean,
        alphaMultiplier = 1.0,
    ): void {
        // Aesthetic Configuration
        const color = isBuff ? 0x00ff88 : 0xff4444; // Green vs Red
        const fillColor = isBuff ? 0x00ff88 : 0xff0000;
        const fillAlpha = 0.15 * alphaMultiplier;
        const strokeAlpha = 0.6 * alphaMultiplier;
        const strokeWidth = 2;

        const gs = this.context.sceneSettings.getGridSettings();
        const halfSize = isSmallUnit ? gs.getHalfStep() : gs.getStep();
        const extent = radius + halfSize; // Total distance from center to edge of aura square

        const auraGraphics = this.ensureAuraGraphics();
        if (!auraGraphics) return;
        auraGraphics
            .rect(center.x - extent, center.y - extent, extent * 2, extent * 2)
            .fill({ color: fillColor, alpha: fillAlpha })
            .stroke({ width: strokeWidth, color: color, alpha: strokeAlpha });
    }
    public drawAttackRange(center: HoCMath.XY, radius: number): void {
        const color = 0xffff00; // Yellow (matches Active/Hovered Range)
        const alpha = 0.8;
        const width = 2;

        const auraGraphics = this.ensureAuraGraphics();
        if (!auraGraphics) return;
        auraGraphics.circle(center.x, center.y, radius).stroke({ width: width, color: color, alpha: alpha });
    }
    public update(dt: number): void {
        this.hoverGlowPhase += dt * (5 / 3);
        this.updateBoardHoverTween(dt);
        this.updatePlacementHoverRearm();
    }
    public setLastPlacement(unitId: string | undefined) {
        this.lastPlacementUnitId = unitId;
        if (unitId) {
            this.lastPlacementTimestampSec = HoCLib.getTimeMillis() / 1000;
        } else {
            this.lastPlacementTimestampSec = 0;
        }
    }
    public resetBoardHoverState(): void {
        this.boardHoverProps = undefined;
        this.boardHoverCenter = undefined;
        this.boardHoverTargetScale = 1;
        this.boardHoverTargetYOffset = 0;
    }
    private updateBoardHoverTween(dt: number): void {
        if (!dt) return;
        const lerp = (from: number, to: number, speed: number) => {
            if (from === to) return from;
            const step = Math.min(1, speed * dt);
            return from + (to - from) * step;
        };
        this.boardHoverScale = lerp(this.boardHoverScale, this.boardHoverTargetScale, 8);
        this.boardHoverYOffset = lerp(this.boardHoverYOffset, this.boardHoverTargetYOffset, 8);

        if (this.boardHoverProps && this.boardHoverCenter && !this.context.hasActiveSelection()) {
            this.updateBoardHoverSilhouette(this.boardHoverProps, this.boardHoverCenter);
        }
    }
    public drawHoverPlacementCell(gfx: Graphics): void {
        const cells = this.hoverSelectedCells;
        if (!cells || cells.length === 0) return;
        // The placement silhouette already previews a valid drop, so we only draw a square to flag an
        // INVALID position (red). No white square for valid cells — it's redundant clutter.
        if (!this.hoverSelectedCellsSwitchToRed) return;
        const gs = this.context.sceneSettings.getGridSettings();
        const size = gs.getCellSize();
        const half = size / 2;
        const strokeColor = 0xff5555;
        const fillColor = 0xff3333;
        const fillAlpha = 0.25;
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const c of cells) {
            const pos = GridMath.getPositionForCell(c, gs.getMinX(), gs.getStep(), gs.getHalfStep());
            const left = pos.x - half;
            const right = pos.x + half;
            const bottom = pos.y - half;
            const top = pos.y + half;
            if (left < minX) minX = left;
            if (right > maxX) maxX = right;
            if (bottom < minY) minY = bottom;
            if (top > maxY) maxY = top;
        }
        const w = maxX - minX - 2;
        const h = maxY - minY - 2;
        gfx.rect(minX + 1, minY + 1, w, h)
            .stroke({ width: 2, color: strokeColor, alpha: 1 })
            .fill({ color: fillColor, alpha: fillAlpha });
    }
    public isCellReachableForActiveUnit(cell: HoCMath.XY): boolean {
        const currentActiveUnit = this.context.getCurrentActiveUnit();
        const currentActivePathHashes = this.context.getCurrentActivePathHashes();

        if (!currentActiveUnit) return false;
        if (!currentActivePathHashes || !currentActivePathHashes.size) return false;

        const props = currentActiveUnit.getUnitProperties();
        const hash = (x: number, y: number) => (x << 4) | y;

        // Size-1 units: simple membership check
        if (props.size === 1) {
            return currentActivePathHashes.has(hash(cell.x, cell.y));
        }

        // Size-2 units: cell is reachable only if there is a valid 2×2 footprint
        // fully contained in `currentActivePathHashes`.
        return this.findLargeUnitMoveCandidate(cell) !== null;
    }
    // Copied from Sandbox (assumed private there)
    public findLargeUnitMoveCandidate(cell: HoCMath.XY): HoCMath.XY[] | null {
        const currentActiveUnit = this.context.getCurrentActiveUnit();
        const currentActivePathHashes = this.context.getCurrentActivePathHashes();
        if (!currentActiveUnit || !currentActivePathHashes) return null;

        const hash = (x: number, y: number) => (x << 4) | y;
        const size = GridConstants.GRID_SIZE;
        const inBounds = (c: HoCMath.XY) => c.x >= 0 && c.y >= 0 && c.x < size && c.y < size;

        // If you want explicit bounds safety, uncomment this and use `inBounds` below
        // const gs = this.context.sceneSettings.getGridSettings();
        // const minX = 0;
        // const minY = 0;
        // const maxX = GridConstants.GRID_SIZE - 1;
        // const maxY = GridConstants.GRID_SIZE - 1;
        // const inBounds = (c: HoCMath.XY) =>
        //     c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY;

        // 4 possible 2×2 footprints where `cell` is one of the tiles
        const footprints: HoCMath.XY[][] = [
            // anchor at (x, y)
            [
                { x: cell.x, y: cell.y },
                { x: cell.x + 1, y: cell.y },
                { x: cell.x, y: cell.y + 1 },
                { x: cell.x + 1, y: cell.y + 1 },
            ],
            // anchor at (x-1, y)
            [
                { x: cell.x - 1, y: cell.y },
                { x: cell.x, y: cell.y },
                { x: cell.x - 1, y: cell.y + 1 },
                { x: cell.x, y: cell.y + 1 },
            ],
            // anchor at (x, y-1)
            [
                { x: cell.x, y: cell.y - 1 },
                { x: cell.x + 1, y: cell.y - 1 },
                { x: cell.x, y: cell.y },
                { x: cell.x + 1, y: cell.y },
            ],
            // anchor at (x-1, y-1)
            [
                { x: cell.x - 1, y: cell.y - 1 },
                { x: cell.x, y: cell.y - 1 },
                { x: cell.x - 1, y: cell.y },
                { x: cell.x, y: cell.y },
            ],
        ];

        for (const footprint of footprints) {
            // If you want explicit grid-bounds checking:
            // if (!footprint.every(inBounds)) continue;

            // ✅ Only accept this footprint if *all* 4 cells are in the path hash set
            const allInPath = footprint.every((c) => inBounds(c) && currentActivePathHashes.has(hash(c.x, c.y)));
            if (!allInPath) continue;

            return footprint;
        }

        return null;
    }
    public getHoverSelectedCells(): HoCMath.XY[] | undefined {
        return this.hoverSelectedCells;
    }
    public getHoverSilhouette(): Sprite | undefined {
        return this.hoverSilhouette;
    }
    public drawHoveredUnitHighlight(gfx: Graphics): void {
        const r = this.hoveredUnitHighlight;
        if (!r) return;
        const cx = r.x + r.w * 0.5;
        const cy = r.y + r.h * 0.5;
        const iconSide = Math.max(r.w, r.h);
        const pulse = (Math.sin(this.hoverGlowPhase) + 1) / 2;
        const pulseFactor = 0.05 + pulse * 0.1;
        const baseW = iconSide * 0.95;
        const baseH = iconSide * 0.28;
        const yOffset = iconSide * 0.48;
        const underLayers = 5;
        for (let i = 0; i < underLayers; i++) {
            const t = (i + 1) / underLayers;
            const w = baseW * (1 + 0.3 * t) * (1 + pulseFactor);
            const h = baseH * (1 + 0.4 * t) * (1 + pulseFactor);
            const alpha = 0.3 * (1 - t * 0.75) * (1 - pulseFactor * 0.5);

            // Check for Active Unit
            const isActive = this.hoveredUnitId && this.context.getCurrentActiveUnit()?.getId() === this.hoveredUnitId;
            const color = isActive ? 0xffffff : 0xffffff;

            gfx.ellipse(cx, cy - yOffset, w * 0.5, h * 0.5).fill({ color, alpha });
        }
        const baseR = iconSide * 0.6;
        const aroundLayers = 6;
        for (let i = 0; i < aroundLayers; i++) {
            const t = (i + 1) / aroundLayers;
            const rg = baseR * (1 + 0.45 * t) * (1 + pulseFactor);
            const alpha = 0.22 * (1 - t * 0.8) * (1 - pulseFactor * 0.5);

            const isActive = this.hoveredUnitId && this.context.getCurrentActiveUnit()?.getId() === this.hoveredUnitId;
            const color = isActive ? 0xffffff : 0xffffff;

            gfx.circle(cx, cy, rg).fill({ color, alpha });
        }
    }
    private updatePlacementHoverRearm(): void {
        if (!this.lastPlacementUnitId) return;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.hasFightStarted() || this.context.hasActiveSelection()) {
            this.lastPlacementUnitId = undefined;
            return;
        }
        if (this.hoveredUnitHighlight) return;
        const nowSec = HoCLib.getTimeMillis() / 1000;
        if (nowSec - this.lastPlacementTimestampSec < this.hoverRearmDelaySec) return;
        const unit = this.context.unitsHolder.getAllUnits().get(this.lastPlacementUnitId);
        if (!unit) {
            this.lastPlacementUnitId = undefined;
            return;
        }

        // We need getHighlightRectForUnit. It was likely a private method in Sandbox.
        // We can implement it here or ask context.
        // It seems simple enough to implement if we have the unit.
        const rect = this.getHighlightRectForUnit(unit);

        if (!rect) {
            this.lastPlacementUnitId = undefined;
            return;
        }
        const p = this.context.getMouseWorld();
        const inside = p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
        if (inside) {
            this.hoveredUnitHighlight = rect;
        }
        this.lastPlacementUnitId = undefined;
    }
    public calculateActiveSelectionHighlight(): void {
        const draggingId = this.context.getDraggingUnitId();
        if (!draggingId) {
            this.hoveredUnitHighlight = undefined;
            this.hoveredUnitId = undefined;
            return;
        }

        const unit = this.context.unitsHolder.getAllUnits().get(draggingId);
        if (!unit) {
            this.hoveredUnitHighlight = undefined;
            this.hoveredUnitId = undefined;
            return;
        }

        // Reuse the logic used for passive hover to set the highlight rect
        this.hoveredUnitHighlight = this.getHighlightRectForUnit(unit);
        this.hoveredUnitId = unit.getId();
    }
    public getHighlightRectForUnit(unit: Unit): { x: number; y: number; w: number; h: number } | undefined {
        // Use the exact world position of the unit (center of mass/sprite)
        const pos = unit.getPosition();
        const gs = this.context.sceneSettings.getGridSettings();
        const size = unit.getSize();
        const cellSize = gs.getCellSize();

        // Calculate dimensions based on unit size
        // Size 1 = 32x32, Size 2 = 64x64
        const w = cellSize * size;
        const h = cellSize * size;

        // Calculate Top-Left corner relative to the center position
        // pos.x is center, so x = pos.x - width/2
        const x = pos.x - w / 2;
        const y = pos.y - h / 2;

        return { x, y, w, h };
    }
    public resetHover(resetSelectedCells = true): void {
        if (resetSelectedCells) {
            this.hoverSelectedCells = undefined;
            this.hoverSelectedCellsSwitchToRed = false;
            this.hoverAttackFromCell = undefined;
        }
        // These were in Sandbox, need to check if we need to expose them or if they are local to hover
        // sc_hoverAttackIsTargetingObstacle -> seems attack related
        // sc_moveBlocked -> seems move related
        // sc_isSelection -> seems selection related

        // We might need to tell Sandbox to reset these flags via context or just ignore them here if they are not strictly hover state.
        // But resetHover was clearing them.

        this.hoveredUnitId = undefined; // Clear tracked unit ID
        this.clearHoverSilhouette();
        this.clearAOEArea();
    }
    public hoverAttackArrow?: Graphics;
    private silhouetteLocked = false;
    public setSilhouetteLocked(locked: boolean): void {
        this.silhouetteLocked = locked;
        if (!locked) {
            // Check if we should clear immediately (optional, or let next update handle it)
            // Usually safest to let logic handle it, but if we call unlock we might want to clear.
            // Sandbox will call resetHover likely.
        }
    }
    public clearHoverSilhouette(force = false): void {
        if (this.silhouetteLocked && !force) return;

        if (this.hoverSilhouette) {
            this.hoverSilhouette.visible = false;
        }
        if (this.hoverSilhouetteOutline) {
            this.hoverSilhouetteOutline.visible = false;
        }
        if (this.hoverTargetSilhouette) {
            this.hoverTargetSilhouette.visible = false;
        }
        if (this.hoverAttackArrow) {
            this.safeClearGraphics(this.hoverAttackArrow);
            this.hoverAttackArrow.visible = false;
        }
        this.hoverAttackFromCell = undefined;
        this.hoverAttackTargetUnit = undefined;
    }
    public hideSilhouettesOnly(): void {
        if (this.silhouetteLocked) return;

        if (this.hoverSilhouette) {
            this.hoverSilhouette.visible = false;
        }
        if (this.hoverSilhouetteOutline) {
            this.hoverSilhouetteOutline.visible = false;
        }
        if (this.hoverTargetSilhouette) {
            this.hoverTargetSilhouette.visible = false;
        }
        if (this.hoverAttackArrow) {
            this.safeClearGraphics(this.hoverAttackArrow);
            this.hoverAttackArrow.visible = false;
        }
    }
    private hoverDamageText?: Text;
    private hoverKillText?: Text;
    private hoverDamageIcon?: Sprite;
    public drawDamagePrediction(
        damageStr: string,
        killStr: string | undefined, // undefined if 0 kills
        position: HoCMath.XY,
        isLargeTarget: boolean,
        iconPath?: string,
    ): void {
        const scale = isLargeTarget ? 2 : 1;
        const hasKills = !!killStr;
        const hasIcon = !!iconPath && hasKills; // Only show icon if there's a kill string? Or always if passed?
        // User request: "possible units killed... on top of"
        // Usually icon goes with kills.

        // 1. Setup Damage Text (Top Row)
        if (!this.hoverDamageText) {
            this.hoverDamageText = new Text({
                text: damageStr,
                style: {
                    fontFamily: "Arial",
                    fontSize: 24,
                    fill: 0xffffff,
                    stroke: { color: 0x000000, width: 4, join: "round" },
                    align: "center",
                    fontWeight: "bold",
                },
            });
            this.context.attachToWorldRoot(this.hoverDamageText, 2201);
        } else {
            this.hoverDamageText.text = damageStr;
        }

        // 3. Visibility & Scaling
        this.hoverDamageText.visible = true;
        this.hoverDamageText.scale.set(scale, -scale);

        if (hasKills) {
            if (this.hoverKillText) {
                this.hoverKillText.text = killStr || "0";
            } else {
                this.hoverKillText = new Text({
                    text: killStr || "0",
                    style: {
                        fontFamily: "Arial",
                        fontSize: 24,
                        fill: 0xff3333,
                        stroke: { color: 0x000000, width: 4, join: "round" },
                        align: "center",
                        fontWeight: "bold",
                    },
                });
                this.context.attachToWorldRoot(this.hoverKillText, 2201);
            }
            this.hoverKillText.visible = true;
            this.hoverKillText.scale.set(scale, -scale);

            // Icon Init
            if (hasIcon) {
                if (!this.hoverDamageIcon) {
                    this.hoverDamageIcon = new Sprite(this.context.texAny(iconPath!) || Texture.from(iconPath!)); // Use context if possible or raw path
                    // Actually logic was just Texture.from
                    this.hoverDamageIcon = new Sprite(Texture.from(iconPath!));
                    this.hoverDamageIcon.anchor.set(0.5);
                    this.context.attachToWorldRoot(this.hoverDamageIcon, 2201);
                } else {
                    this.hoverDamageIcon.texture = Texture.from(iconPath!);
                }
                this.hoverDamageIcon.visible = true;
            } else if (this.hoverDamageIcon) {
                this.hoverDamageIcon.visible = false;
            }

            // Layout: Stacked Centered
            const spacing = 28 * scale;

            this.hoverDamageText.anchor.set(0.5, 0.5);
            this.hoverDamageText.position.set(position.x, position.y + spacing / 2);

            // Icon placement
            if (hasIcon && this.hoverDamageIcon) {
                this.hoverDamageIcon.visible = true;
                this.hoverDamageIcon.scale.set(scale, -scale);
                const iconSize = 24 * scale;
                this.hoverDamageIcon.width = iconSize;
                this.hoverDamageIcon.height = iconSize;

                // Align icon to left of Kill Text
                const padding = 5 * scale;
                const totalW = iconSize + padding + this.hoverKillText.width;
                const startX = position.x - totalW / 2;

                this.hoverDamageIcon.anchor.set(0, 0.5);
                this.hoverDamageIcon.position.set(startX, position.y - spacing / 2);

                this.hoverKillText.anchor.set(0, 0.5);
                this.hoverKillText.position.set(startX + iconSize + padding, position.y - spacing / 2);
            } else {
                this.hoverKillText.anchor.set(0.5, 0.5);
                this.hoverKillText.position.set(position.x, position.y - spacing / 2);
            }
        } else {
            // Text only (Centered) - Match ORIGINAL EXACTLY
            if (this.hoverDamageIcon) this.hoverDamageIcon.visible = false;
            if (this.hoverKillText) this.hoverKillText.visible = false;

            this.hoverDamageText.anchor.set(0.5, 0.5);
            this.hoverDamageText.position.set(position.x, position.y);
        }
    }
    public clearAttackVisuals(): void {
        if (this.hoverAttackArrow) {
            this.hoverAttackArrow.clear();
        }
        this.clearObstacleHighlight();

        // 1. Restore stack visibility for ALL highlighted units
        for (const unit of this.highlightedUnits) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rUnit = unit as any;
            if (typeof rUnit.setStackVisibility === "function") {
                rUnit.setStackVisibility(true);
            }
        }
        this.highlightedUnits = [];

        // 2. Hide silhouettes and return to pool
        for (const s of this.hoverTargetSilhouettes) {
            s.visible = false;
            this.silhouettePool.push(s);
        }
        this.hoverTargetSilhouettes = [];

        if (this.hoverDamageText) {
            this.hoverDamageText.visible = false;
        }
        if (this.hoverKillText) {
            this.hoverKillText.visible = false;
        }
        if (this.hoverDamageIcon) {
            this.hoverDamageIcon.visible = false;
        }
        this.clearSpellPreview();
        this.hoverAttackTargetUnit = undefined;
    }
    private hoverTargetSilhouettes: Sprite[] = [];
    private silhouettePool: Sprite[] = [];
    private highlightedUnits: Unit[] = [];
    public addTargetHighlight(targetUnit: Unit, tint: number = 0xaa0000): void {
        this.hoverAttackTargetUnit = targetUnit; // Keep referring to last added (primary usually added first, but overwritten here is fine for now as long as we track all in highlightedUnits)
        this.highlightedUnits.push(targetUnit);

        // Hide stack on target for cleaner visual
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rUnit = targetUnit as any;
        if (typeof rUnit.setStackVisibility === "function") {
            rUnit.setStackVisibility(false);
        }

        const texName = unitToTextureName(
            targetUnit.getName(),
            targetUnit.getSize() === 2 ? TextureType.LARGE : TextureType.SMALL,
            targetUnit.getSize(),
        );
        const tex = this.context.texAny(texName);
        if (!tex) return;

        let silhouette: Sprite;
        if (this.silhouettePool.length > 0) {
            silhouette = this.silhouettePool.pop()!;
            silhouette.texture = tex;
        } else {
            silhouette = new Sprite(tex);
            silhouette.anchor.set(0.5);
            this.context.attachToWorldRoot(silhouette, 2100); // Above units (Z=1000)
            silhouette.scale.y = -1;
            // Static blur as requested (set once if creating)
            silhouette.filters = [new BlurFilter({ strength: 4 })];
        }

        // Use new helper on RenderableUnit if available, else fallback
        let centerPos = targetUnit.getPosition();
        if (typeof rUnit.getVisualCenter === "function") {
            centerPos = rUnit.getVisualCenter(this.context.sceneSettings.getGridSettings());
        }

        const baseWidth = tex.width || 1;
        const targetSize = targetUnit.getSize() === 2 ? 256 : 128; // Standard sizes
        const scale = targetSize / baseWidth;

        silhouette.scale.set(scale, -scale);
        silhouette.position.set(centerPos.x, centerPos.y);
        silhouette.visible = true;
        silhouette.alpha = 0.8;
        // Caller-chosen tint: dark red for harmful targets, green for buff/heal spell targets.
        silhouette.tint = tint;

        this.hoverTargetSilhouettes.push(silhouette);
    }
    public drawAttackArrow(from: HoCMath.XY, to: HoCMath.XY, continuationTo?: HoCMath.XY): void {
        // If attacking from same position (Stand Ground), don't draw arrow
        const dist = Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2));
        if (dist < 10) {
            if (this.hoverAttackArrow) this.hoverAttackArrow.visible = false;
            return;
        }

        if (!this.isGraphicsUsable(this.hoverAttackArrow)) {
            this.hoverAttackArrow = new Graphics();
            if (!this.safeAttachGraphics(this.hoverAttackArrow, 2200)) {
                this.hoverAttackArrow.destroy();
                this.hoverAttackArrow = undefined;
                return;
            }
        }

        const g = this.hoverAttackArrow;
        g.clear();
        g.visible = true;

        // Draw glow/light effect (layered lines)
        const angle = Math.atan2(to.y - from.y, to.x - from.x);

        // Adjust arrow length to stop a bit before the visual center
        const stopDistance = 0; // Removed gap as per user request
        const arrowLen = Math.max(0, dist - stopDistance);

        if (arrowLen <= 0) return;

        // Outer glow
        g.moveTo(from.x, from.y)
            .lineTo(from.x + Math.cos(angle) * arrowLen, from.y + Math.sin(angle) * arrowLen)
            .stroke({ width: 12, color: 0xff4444, alpha: 0.4 });

        // Inner core
        g.moveTo(from.x, from.y)
            .lineTo(from.x + Math.cos(angle) * arrowLen, from.y + Math.sin(angle) * arrowLen)
            .stroke({ width: 4, color: 0xffffff, alpha: 0.9 });

        // Arrow Head
        const headLen = 20;
        const headAngle = Math.PI / 6;
        const endX = from.x + Math.cos(angle) * arrowLen;
        const endY = from.y + Math.sin(angle) * arrowLen;

        g.moveTo(endX, endY)
            .lineTo(endX - headLen * Math.cos(angle - headAngle), endY - headLen * Math.sin(angle - headAngle))
            .moveTo(endX, endY)
            .lineTo(endX - headLen * Math.cos(angle + headAngle), endY - headLen * Math.sin(angle + headAngle))
            .stroke({ width: 4, color: 0xffffff, alpha: 1.0 });

        // Optional faint dashed continuation PAST the arrow tip. Used when a ranged shot is stopped by a
        // mountain: the arrow ends at the rock, then this thin dotted line traces where the shot WOULD
        // have carried on to the intended unit, so the whole projection still reads at a glance.
        if (continuationTo) {
            const cDist = Math.hypot(continuationTo.x - endX, continuationTo.y - endY);
            if (cDist > 6) {
                const cAngle = Math.atan2(continuationTo.y - endY, continuationTo.x - endX);
                const dash = 9;
                const gap = 9;
                for (let d = 0; d < cDist; d += dash + gap) {
                    const segEnd = Math.min(d + dash, cDist);
                    g.moveTo(endX + Math.cos(cAngle) * d, endY + Math.sin(cAngle) * d)
                        .lineTo(endX + Math.cos(cAngle) * segEnd, endY + Math.sin(cAngle) * segEnd)
                        .stroke({ width: 2, color: 0xff4444, alpha: 0.4 });
                }
            }
        }
    }
    // Soft red glow marking an obstacle (a BLOCK_CENTER mountain) as the thing a blocked ranged shot
    // actually hits — used instead of the unit target-silhouette, since the unit behind it takes no damage.
    private hoverObstacleHighlight?: Graphics;
    public highlightObstacle(position: HoCMath.XY, cellSize: number): void {
        if (!this.isGraphicsUsable(this.hoverObstacleHighlight)) {
            this.hoverObstacleHighlight = new Graphics();
            if (!this.safeAttachGraphics(this.hoverObstacleHighlight, 2150)) {
                this.hoverObstacleHighlight.destroy();
                this.hoverObstacleHighlight = undefined;
                return;
            }
        }
        const g = this.hoverObstacleHighlight;
        g.clear();
        g.visible = true;
        const r = cellSize * 0.72;
        g.circle(position.x, position.y, r * 1.25).fill({ color: 0xaa0000, alpha: 0.22 });
        g.circle(position.x, position.y, r).fill({ color: 0xff2a2a, alpha: 0.3 });
        g.circle(position.x, position.y, r).stroke({ width: 3, color: 0xff4444, alpha: 0.85 });
    }
    public clearObstacleHighlight(): void {
        if (this.hoverObstacleHighlight) {
            this.hoverObstacleHighlight.clear();
            this.hoverObstacleHighlight.visible = false;
        }
    }
    // --- Armed-spell on-board preview: a colored beam caster→target plus a persistent icon+name
    // badge floating above the caster, so the player can always see which spell is about to fire. ---
    private spellBeam?: Graphics;
    private spellBadgeRing?: Graphics;
    private spellBadgeIcon?: Sprite;
    private spellBadgeText?: Text;
    public drawSpellCastPreview(opts: {
        casterPos: HoCMath.XY;
        targetPos?: HoCMath.XY;
        iconTex: Texture;
        label: string;
        color: number;
    }): void {
        const color = opts.color;

        // 1. Beam from caster to hovered target (only when a target is hovered).
        if (opts.targetPos) {
            if (!this.isGraphicsUsable(this.spellBeam)) {
                this.spellBeam = new Graphics();
                if (!this.safeAttachGraphics(this.spellBeam, 2199)) {
                    this.spellBeam.destroy();
                    this.spellBeam = undefined;
                    return;
                }
            }
            const g = this.spellBeam;
            g.clear();
            g.visible = true;
            const fx = opts.casterPos.x;
            const fy = opts.casterPos.y;
            const tx = opts.targetPos.x;
            const ty = opts.targetPos.y;
            const angle = Math.atan2(ty - fy, tx - fx);
            g.moveTo(fx, fy).lineTo(tx, ty).stroke({ width: 16, color, alpha: 0.22 });
            g.moveTo(fx, fy).lineTo(tx, ty).stroke({ width: 5, color, alpha: 0.9 });
            const hl = 22;
            const ha = Math.PI / 6;
            g.moveTo(tx, ty)
                .lineTo(tx - hl * Math.cos(angle - ha), ty - hl * Math.sin(angle - ha))
                .moveTo(tx, ty)
                .lineTo(tx - hl * Math.cos(angle + ha), ty - hl * Math.sin(angle + ha))
                .stroke({ width: 5, color, alpha: 1.0 });
        } else if (this.spellBeam) {
            this.safeClearGraphics(this.spellBeam);
        }

        // 2. Badge above the caster (world is y-up, so +Y floats it higher on screen).
        const cx = opts.casterPos.x;
        const cy = opts.casterPos.y + 96;
        const iconSize = 46;
        if (!this.isGraphicsUsable(this.spellBadgeRing)) {
            this.spellBadgeRing = new Graphics();
            if (!this.safeAttachGraphics(this.spellBadgeRing, 2202)) {
                this.spellBadgeRing.destroy();
                this.spellBadgeRing = undefined;
                return;
            }
        }
        const ring = this.spellBadgeRing;
        ring.clear();
        ring.visible = true;
        ring.circle(cx, cy, iconSize / 2 + 7).fill({ color: 0x000000, alpha: 0.5 });
        ring.circle(cx, cy, iconSize / 2 + 7).stroke({ width: 3, color, alpha: 0.95 });

        if (!this.spellBadgeIcon) {
            this.spellBadgeIcon = new Sprite(opts.iconTex);
            this.spellBadgeIcon.anchor.set(0.5);
            this.context.attachToWorldRoot(this.spellBadgeIcon, 2203);
        } else {
            this.spellBadgeIcon.texture = opts.iconTex;
        }
        const texW = opts.iconTex.width || iconSize;
        this.spellBadgeIcon.visible = true;
        this.spellBadgeIcon.scale.set(iconSize / texW, -iconSize / texW);
        this.spellBadgeIcon.position.set(cx, cy);
        this.spellBadgeIcon.tint = 0xffffff;

        if (!this.spellBadgeText) {
            this.spellBadgeText = new Text({
                text: opts.label,
                style: {
                    fontFamily: "Arial",
                    fontSize: 18,
                    fill: 0xffffff,
                    stroke: { color: 0x000000, width: 4, join: "round" },
                    align: "center",
                    fontWeight: "bold",
                },
            });
            this.context.attachToWorldRoot(this.spellBadgeText, 2203);
        } else {
            this.spellBadgeText.text = opts.label;
        }
        this.spellBadgeText.visible = true;
        this.spellBadgeText.anchor.set(0.5, 0.5);
        this.spellBadgeText.scale.set(1, -1);
        this.spellBadgeText.position.set(cx, cy - (iconSize / 2 + 18));
    }
    public clearSpellPreview(): void {
        if (this.spellBeam) this.safeClearGraphics(this.spellBeam);
        if (this.spellBadgeRing) this.safeClearGraphics(this.spellBadgeRing);
        if (this.spellBadgeIcon) this.spellBadgeIcon.visible = false;
        if (this.spellBadgeText) this.spellBadgeText.visible = false;
    }
    public updateHoverSilhouette(boundsCenter: HoCMath.XY): void {
        // Size/shape the move-preview from the ACTIVE unit's LIVE properties — this silhouette is
        // that unit's projected position. The cached selected-properties can be stale/mistyped and
        // made large units (e.g. Hydra) render a small silhouette. Fall back to selected (placement).
        const active = this.context.getCurrentActiveUnit();
        const selected = active ? active.getUnitProperties() : this.context.getSelectedUnitProperties();

        if (this.hoverAttackTargetUnit) {
            // If we have a target unit (red highlight), we might want to keep it?
            // Actually, Sandbox resets this every frame if attacking.
            // If we are here and NOT attacking, we should clear.
        }

        // If we are just moving (active unit), clear attack specifics
        if (this.hoverTargetSilhouette && !this.hoverAttackFromCell) {
            this.hoverTargetSilhouette.visible = false;
        }
        if (this.hoverAttackArrow && !this.hoverAttackFromCell) {
            this.hoverAttackArrow.visible = false;
        }

        // 1. If we have an attack-from cell, we behave differently:
        if (this.hoverAttackFromCell && selected) {
            // We force red tint for attack
            this.ensureHoverSilhouetteParams(selected, boundsCenter, true);
            return;
        }

        if (!selected || this.hoverSelectedCellsSwitchToRed || !this.hoverSelectedCells?.length) {
            this.clearHoverSilhouette();
            return;
        }

        this.ensureHoverSilhouetteParams(selected, boundsCenter, false);
    }
    private ensureHoverSilhouetteParams(selected: UnitProperties, boundsCenter: HoCMath.XY, isAttack: boolean): void {
        const texName = unitToTextureName(selected.name, TextureType.SMALL, selected.size);
        const tex = this.context.texAny(texName);
        if (!tex) {
            this.clearHoverSilhouette();
            return;
        }
        if (!this.hoverSilhouette) {
            this.hoverSilhouette = new Sprite(tex);
            this.hoverSilhouette.anchor.set(0.5);
            this.context.attachToWorldRoot(this.hoverSilhouette, 110);
            this.hoverSilhouette.scale.y = -1;
        } else if (this.hoverSilhouetteKey !== texName) {
            this.hoverSilhouette.texture = tex;
        }
        if (!this.hoverSilhouetteOutline) {
            this.hoverSilhouetteOutline = new Sprite(tex);
            this.hoverSilhouetteOutline.anchor.set(0.5);
            this.context.attachToWorldRoot(this.hoverSilhouetteOutline, 109);
            this.hoverSilhouetteOutline.scale.y = -1;
        } else if (this.hoverSilhouetteKey !== texName) {
            this.hoverSilhouetteOutline.texture = tex;
        }
        this.hoverSilhouetteKey = texName;
        const sprite = this.hoverSilhouette;
        const outline = this.hoverSilhouetteOutline;
        const targetSize = selected.size === 2 ? 256 : 128;
        const baseWidth = tex.width || 1;
        const scale = targetSize / baseWidth;
        const outlineScale = scale * 1.06;
        sprite.scale.set(scale, -scale);
        outline.scale.set(outlineScale, -outlineScale);
        sprite.x = boundsCenter.x;
        sprite.y = boundsCenter.y;
        outline.x = boundsCenter.x;
        outline.y = boundsCenter.y;
        outline.visible = true;
        outline.alpha = 0.9;
        outline.tint = 0xffffff;
        sprite.visible = true;
        sprite.alpha = 0.8;

        if (isAttack) {
            // User requested standard silhouette for attacker, so no red tint here.
            sprite.tint = 0x000000;
            outline.tint = 0xffffff;
        } else {
            sprite.tint = 0x000000;
            outline.tint = 0xffffff;
        }
    }
    /**
     * Show silhouette for a unit at a specific position - used for AI moves/attacks
     * Uses the same styling as normal hover silhouettes (black sprite + white outline)
     */
    public showSilhouetteForUnit(unitProps: UnitProperties, position: HoCMath.XY): void {
        this.ensureHoverSilhouetteParams(unitProps, position, false);
    }
    /**
     * Render a ghost of the opponent's active unit at the cell they are currently aiming
     * at during their turn in ranked play. Uses its own sprites (and a slightly more
     * transparent look) so it reads as a live "intent" preview without disturbing the
     * local player's own hover silhouette.
     */
    public showOpponentIntentSilhouette(props: UnitProperties, position: HoCMath.XY): void {
        const texName = unitToTextureName(props.name, TextureType.SMALL, props.size);
        const tex = this.context.texAny(texName);
        if (!tex) {
            this.clearOpponentIntentSilhouette();
            return;
        }
        if (!this.opponentIntentSilhouette) {
            this.opponentIntentSilhouette = new Sprite(tex);
            this.opponentIntentSilhouette.anchor.set(0.5);
            this.context.attachToWorldRoot(this.opponentIntentSilhouette, 110);
            this.opponentIntentSilhouette.scale.y = -1;
        } else if (this.opponentIntentKey !== texName) {
            this.opponentIntentSilhouette.texture = tex;
        }
        if (!this.opponentIntentOutline) {
            this.opponentIntentOutline = new Sprite(tex);
            this.opponentIntentOutline.anchor.set(0.5);
            this.context.attachToWorldRoot(this.opponentIntentOutline, 109);
            this.opponentIntentOutline.scale.y = -1;
        } else if (this.opponentIntentKey !== texName) {
            this.opponentIntentOutline.texture = tex;
        }
        this.opponentIntentKey = texName;
        const sprite = this.opponentIntentSilhouette;
        const outline = this.opponentIntentOutline;
        const targetSize = props.size === 2 ? 256 : 128;
        const baseWidth = tex.width || 1;
        const scale = targetSize / baseWidth;
        const outlineScale = scale * 1.06;
        sprite.scale.set(scale, -scale);
        outline.scale.set(outlineScale, -outlineScale);
        sprite.x = position.x;
        sprite.y = position.y;
        outline.x = position.x;
        outline.y = position.y;
        outline.visible = true;
        outline.alpha = 0.7;
        outline.tint = 0xffffff;
        sprite.visible = true;
        sprite.alpha = 0.55;
        sprite.tint = 0x000000;
    }
    public clearOpponentIntentSilhouette(): void {
        if (this.opponentIntentSilhouette) {
            this.opponentIntentSilhouette.visible = false;
        }
        if (this.opponentIntentOutline) {
            this.opponentIntentOutline.visible = false;
        }
    }
    public updateBoardHoverSilhouette(props: UnitProperties, center: HoCMath.XY): void {
        const texName = unitToTextureName(props.name, TextureType.SMALL, props.size);
        const tex = this.context.texAny(texName);
        if (!tex) {
            this.clearHoverSilhouette();
            return;
        }
        if (!this.hoverSilhouette) {
            this.hoverSilhouette = new Sprite(tex);
            this.hoverSilhouette.anchor.set(0.5);
            this.context.attachToWorldRoot(this.hoverSilhouette, 110);
            this.hoverSilhouette.scale.y = -1;
        } else if (this.hoverSilhouetteKey !== texName) {
            this.hoverSilhouette.texture = tex;
        }
        if (!this.hoverSilhouetteOutline) {
            this.hoverSilhouetteOutline = new Sprite(tex);
            this.hoverSilhouetteOutline.anchor.set(0.5);
            this.context.attachToWorldRoot(this.hoverSilhouetteOutline, 109);
            this.hoverSilhouetteOutline.scale.y = -1;
        } else if (this.hoverSilhouetteKey !== texName) {
            this.hoverSilhouetteOutline.texture = tex;
        }
        this.hoverSilhouetteKey = texName;
        const sprite = this.hoverSilhouette;
        const outline = this.hoverSilhouetteOutline;
        const targetSize = props.size === 2 ? 256 : 128;
        const baseWidth = tex.width || 1;
        const baseScale = targetSize / baseWidth;
        const scale = baseScale * this.boardHoverScale;
        const outlineScale = scale * 1.08;
        const y = center.y + this.boardHoverYOffset;
        sprite.scale.set(scale, -scale);
        outline.scale.set(outlineScale, -outlineScale);
        sprite.x = center.x;
        sprite.y = y;
        outline.x = center.x;
        outline.y = y;
        outline.visible = true;
        outline.alpha = 0.35;
        outline.tint = 0xffffff;
        sprite.visible = true;
        sprite.alpha = 1.0;
        sprite.tint = 0xffffff;
    }
    public updateActiveMoveSilhouetteForCell(cell: HoCMath.XY): void {
        if (this.silhouetteLocked) return;

        const currentActiveUnit = this.context.getCurrentActiveUnit();
        if (!currentActiveUnit) {
            this.clearHoverSilhouette();
            return;
        }

        const gs = this.context.sceneSettings.getGridSettings();
        const props = currentActiveUnit.getUnitProperties();

        let centerPos: HoCMath.XY | undefined;

        if (props.size === 2) {
            const candidate = this.findLargeUnitMoveCandidate(cell);
            if (!candidate) {
                this.clearHoverSilhouette();
                return;
            }
            // candidate is HoCMath.XY[] (footprint)
            // We need center.
            centerPos = GridMath.getPositionForCells(gs, candidate);
        } else {
            if (!this.isCellReachableForActiveUnit(cell)) {
                this.clearHoverSilhouette();
                return;
            }
            centerPos = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        }

        if (!centerPos) {
            this.clearHoverSilhouette();
            return;
        }

        const texName = unitToTextureName(props.name, TextureType.SMALL, props.size);
        const tex = this.context.texAny(texName);
        if (!tex) {
            this.clearHoverSilhouette();
            return;
        }

        if (!this.hoverSilhouette) {
            this.hoverSilhouette = new Sprite(tex);
            this.hoverSilhouette.anchor.set(0.5);
            this.context.attachToWorldRoot(this.hoverSilhouette, 110);
            this.hoverSilhouette.scale.y = -1;
        } else if (this.hoverSilhouetteKey !== texName) {
            this.hoverSilhouette.texture = tex;
        }

        if (!this.hoverSilhouetteOutline) {
            this.hoverSilhouetteOutline = new Sprite(tex);
            this.hoverSilhouetteOutline.anchor.set(0.5);
            this.context.attachToWorldRoot(this.hoverSilhouetteOutline, 109);
            this.hoverSilhouetteOutline.scale.y = -1;
        } else if (this.hoverSilhouetteKey !== texName) {
            this.hoverSilhouetteOutline.texture = tex;
        }

        this.hoverSilhouetteKey = texName;

        const sprite = this.hoverSilhouette;
        const outline = this.hoverSilhouetteOutline;

        const targetSize = props.size === 2 ? 256 : 128;
        const baseWidth = tex.width || 1;
        const scale = targetSize / baseWidth;
        const outlineScale = scale * 1.06;

        sprite.scale.set(scale, -scale);
        outline.scale.set(outlineScale, -outlineScale);

        sprite.x = centerPos.x;
        sprite.y = centerPos.y;
        outline.x = centerPos.x;
        outline.y = centerPos.y;

        outline.visible = true;
        outline.alpha = 0.9;
        outline.tint = 0xffffff;

        sprite.visible = true;
        sprite.alpha = 0.8;
        sprite.tint = 0x000000;
    }
    public updateHoverPlacementCell(worldPos: HoCMath.XY): void {
        const gs = this.context.sceneSettings.getGridSettings();
        const selected = this.context.getSelectedUnitProperties();
        const fightProps = FightStateManager.getInstance().getFightProperties();

        this.hoverPlacementCell = undefined;
        this.hoverPlacementCellTeam = undefined;
        this.hoverSelectedCells = undefined;
        this.hoverSelectedCellsSwitchToRed = false;

        // ⬅️ IMPORTANT: only require a selected unit,
        // do NOT depend on hasActiveSelection() here,
        // otherwise bench-placement hover dies.
        if (!selected) {
            this.clearAuraVisuals();
            this.clearHoverSilhouette();
            return;
        }

        const cell = GridMath.getCellForPosition(gs, worldPos);
        this.clearAuraVisuals();
        if (!cell) {
            this.clearHoverSilhouette();
            return;
        }

        const isLarge = selected.size === 2;
        const cellHash = (cell.x << 4) | cell.y;

        let teamFromPlacement: TeamType | undefined;
        if (this.context.placementManager.getAllowedPlacementCellHashesForTeam(TeamVals.LOWER)?.has(cellHash)) {
            teamFromPlacement = TeamVals.LOWER;
        } else if (this.context.placementManager.getAllowedPlacementCellHashesForTeam(TeamVals.UPPER)?.has(cellHash)) {
            teamFromPlacement = TeamVals.UPPER;
        }

        const draggingUnitTeam = this.context.getDraggingUnitTeam();
        const draggingUnitId = this.context.getDraggingUnitId();
        const effectiveTeam = teamFromPlacement ?? draggingUnitTeam ?? selected.team ?? TeamVals.LOWER;

        // Placing a NEW unit (not repositioning a board unit) while the cursor sits on another unit:
        // a click here SELECTS that unit, it isn't a placement. So don't show any placement square
        // (red read as "can't place" was misleading) — show the unit's selection highlight instead.
        if (!draggingUnitId) {
            const cursorOccupantId = this.context.grid.getOccupantUnitId(cell);
            if (cursorOccupantId) {
                const occupantUnit = this.context.unitsHolder.getAllUnits().get(cursorOccupantId);
                if (occupantUnit) {
                    this.clearAuraVisuals();
                    this.clearHoverSilhouette();
                    // (placement square vars were already reset at the top of this method)
                    this.hoveredUnitHighlight = this.getHighlightRectForUnit(occupantUnit);
                    this.hoveredUnitId = occupantUnit.getId();
                    return;
                }
            }
        }

        // --- 1. Calculate Candidate Cells (Early) ---
        // We need these for both Visualization (Mock Unit) and Validation
        let candidateCells: HoCMath.XY[];
        if (isLarge) {
            // If teamFromPlacement is known, prioritize that side's valid cells
            // If undefined (void), use dragging team's side or generic?
            // Existing logic used "allowedForThatSide" inside "Wrong Team" block, and "allowedForTeam" later.
            // We'll try to find best fit.
            const targetTeamForPath = teamFromPlacement ?? draggingUnitTeam ?? TeamVals.LOWER;
            const allowedForPath =
                this.context.placementManager.getAllowedPlacementCellHashesForTeam(targetTeamForPath);

            const occupiedKeys: string[] = [];
            candidateCells =
                this.context.pathHelper.getClosestSquareCellIndices(
                    this.context.getMouseWorld(),
                    allowedForPath,
                    occupiedKeys,
                    undefined,
                    undefined,
                    undefined,
                ) ?? [];

            // Fallback if pathing fails (e.g. void): just use the cell under mouse
            if (candidateCells.length === 0) {
                candidateCells = [cell];
            }
        } else {
            candidateCells = [cell];
        }

        // --- 2. Draw Aura & Attack Range (ALWAYS, Visuals First) ---
        // Verify we have a position to draw at
        const possiblePosition = GridMath.getPositionForCells(gs, candidateCells);
        if (possiblePosition) {
            const gridType = FightStateManager.getInstance().getFightProperties().getGridType();
            const skipPreStartGeom =
                gridType === GridVals.LAVA_CENTER ||
                gridType === GridVals.WATER_CENTER ||
                gridType === GridVals.BLOCK_CENTER;

            if (!skipPreStartGeom) {
                const mockUnit = Unit.createUnit(
                    selected,
                    gs,
                    effectiveTeam,
                    UnitVals.CREATURE,
                    this.context.abilityFactory,
                    this.context.abilityFactory.getEffectsFactory(),
                    false,
                );
                mockUnit.setPosition(possiblePosition.x, possiblePosition.y, false);

                // Draw Aura
                const auras = mockUnit.getAuraRanges();
                const auraBuffs = mockUnit.getAuraIsBuff();
                if (auras && auras.length > 0) {
                    const center = possiblePosition;
                    const bonus = fightProps.getAdditionalAuraRangePerTeam(effectiveTeam);
                    for (let i = 0; i < auras.length; i++) {
                        if (auras[i] > 0) {
                            const range = (auras[i] + bonus) * gs.getStep();
                            const isBuff = auraBuffs && i < auraBuffs.length ? auraBuffs[i] : true;
                            this.drawAuraArea(center, range, isBuff, mockUnit.isSmallSize(), 0.7);
                        }
                    }
                }

                // Draw Attack Range
                if (mockUnit.getAttackType() === 3 /* AttackVals.RANGE */ && !mockUnit.hasAbilityActive("Handyman")) {
                    const dist = mockUnit.getRangeShotDistance();
                    if (dist > 0) {
                        const rangePixel = dist * gs.getStep();
                        this.drawAttackRange(possiblePosition, rangePixel);
                    }
                }
            }
        }

        // --- 3. Validation & Interaction Highlight ---

        // Case A: Void (Outside any placement zone) -> No Red Square, Just Return
        if (!teamFromPlacement) {
            this.resetHover(false); // keep aura
            return;
        }

        // Case B: Wrong Team Zone -> Red Square
        if (draggingUnitTeam && teamFromPlacement !== draggingUnitTeam) {
            this.hoverSelectedCells = candidateCells;
            this.hoverSelectedCellsSwitchToRed = true;
            this.hoverPlacementCell = cell;
            this.hoverPlacementCellTeam = teamFromPlacement;
            this.clearHoverSilhouette();
            return;
        }

        // Case C: Valid Team Zone, but placement invalid (Blocked / Not Allowed / Max Units)
        const allowedForTeam = this.context.placementManager.getAllowedPlacementCellHashesForTeam(teamFromPlacement);

        // Standard Validation Checks
        let invalid = false;

        // Check 1: Allowed Cells existence
        if (!allowedForTeam || allowedForTeam.size === 0) {
            invalid = true;
        }

        // Check 2: Large Unit Shape
        if (!invalid && isLarge) {
            if (candidateCells.length !== 4) {
                invalid = true; // Should ideally limit to valid cells, but if we can't find 4, it's invalid
            } else if (!this.context.pathHelper.areCellsFormingSquare(candidateCells)) {
                invalid = true;
            }
        }

        // Check 3: Cells in Allowed Set
        if (!invalid) {
            for (const c of candidateCells) {
                const h = (c.x << 4) | c.y;
                if (!allowedForTeam?.has(h)) {
                    invalid = true;
                    break;
                }
            }
        }

        // Check 4: Occupied by other unit (that isn't self)
        if (!invalid) {
            for (const c of candidateCells) {
                const occId = this.context.grid.getOccupantUnitId(c);
                if (occId && this.context.unitsHolder.getAllUnits().has(occId)) {
                    if (!(draggingUnitId && occId === draggingUnitId)) {
                        invalid = true;
                        break;
                    }
                }
            }
        }

        // Check 5: Max Units Limit
        if (!invalid && !draggingUnitId) {
            // Only check count if spawning new, not moving existing
            // ... existing max unit check ...
            // Simplified: logic was checking "alliesPlacedCount >= maxUnitsForTeam"
            const lowerLeftPlacement = this.context.getPlacement(TeamVals.LOWER, 0);
            const upperRightPlacement = this.context.getPlacement(TeamVals.UPPER, 0);
            const lowerRightPlacement = this.context.getPlacement(TeamVals.LOWER, 1);
            const upperLeftPlacement = this.context.getPlacement(TeamVals.UPPER, 1);
            if (lowerLeftPlacement && upperRightPlacement) {
                const alliesPlacedCount = this.context.unitsHolder.getAllAlliesPlaced(
                    teamFromPlacement,
                    lowerLeftPlacement,
                    upperRightPlacement,
                    lowerRightPlacement,
                    upperLeftPlacement,
                ).length;
                const maxUnitsForTeam = fightProps.getNumberOfUnitsAvailableForPlacement(teamFromPlacement);
                if (alliesPlacedCount >= maxUnitsForTeam) {
                    invalid = true;
                }
            }
        }

        // Handle Invalid Result
        if (invalid) {
            this.hoverSelectedCells = candidateCells;
            this.hoverSelectedCellsSwitchToRed = true;
            this.hoverPlacementCell = cell;
            this.hoverPlacementCellTeam = teamFromPlacement;
            return;
        }

        // --- 4. Success: Green/Blue Highlight ---
        this.hoverSelectedCells = candidateCells;
        this.hoverSelectedCellsSwitchToRed = false; // Green
        this.hoverPlacementCell = cell;
        this.hoverPlacementCellTeam = teamFromPlacement;
        // set silhouette if needed? existing code did clearHoverSilhouette() in failure cases.
        // Success case used generic drawHoverPlacementCell in SandboxDrawer?
        // No, SandboxDrawer draws hoverPlacementCell.
        if (!invalid && candidateCells.length > 0) {
            const size = gs.getCellSize();
            const half = size / 2;

            let minX = Number.POSITIVE_INFINITY;
            let maxX = Number.NEGATIVE_INFINITY;
            let minY = Number.POSITIVE_INFINITY;
            let maxY = Number.NEGATIVE_INFINITY;

            for (const c of candidateCells) {
                const pos = GridMath.getPositionForCell(c, gs.getMinX(), gs.getStep(), gs.getHalfStep());
                if (pos) {
                    const left = pos.x - half;
                    const right = pos.x + half;
                    const bottom = pos.y - half;
                    const top = pos.y + half;

                    if (left < minX) minX = left;
                    if (right > maxX) maxX = right;
                    if (bottom < minY) minY = bottom;
                    if (top > maxY) maxY = top;
                }
            }

            const centerX = (minX + maxX) * 0.5;
            const centerY = (minY + maxY) * 0.5;

            this.updateHoverSilhouette({ x: centerX, y: centerY });
        } else {
            this.clearHoverSilhouette();
        }
    }
    public calculatePassiveHover(): void {
        // If we have an active selection, we shouldn't show passive hover
        if (this.context.hasActiveSelection()) {
            this.hoveredUnitHighlight = undefined;
            this.hoveredUnitId = undefined;
            return;
        }

        const p = this.context.getMouseWorld();
        const gs = this.context.sceneSettings.getGridSettings();

        // Find unit under mouse
        const cell = GridMath.getCellForPosition(gs, p);
        if (!cell) {
            this.hoveredUnitHighlight = undefined;
            this.hoveredUnitId = undefined;
            this.clearHoverSilhouette();
            return;
        }

        const occupantId = this.context.grid.getOccupantUnitId(cell);
        if (!occupantId) {
            this.hoveredUnitHighlight = undefined;
            this.hoveredUnitId = undefined;
            this.clearHoverSilhouette();
            return;
        }

        const unit = this.context.unitsHolder.getAllUnits().get(occupantId);
        if (!unit) {
            this.hoveredUnitHighlight = undefined;
            this.hoveredUnitId = undefined;
            this.clearHoverSilhouette();
            return;
        }

        // Prevent highlighting the unit we just placed for a brief moment (handled by Rearm)
        const nowSec = HoCLib.getTimeMillis() / 1000;
        if (
            this.lastPlacementUnitId &&
            nowSec - this.lastPlacementTimestampSec < this.hoverRearmDelaySec &&
            unit.getId() === this.lastPlacementUnitId
        ) {
            this.hoveredUnitHighlight = undefined;
            this.hoveredUnitId = undefined;
            this.clearHoverSilhouette();
            return;
        }

        this.hoveredUnitHighlight = this.getHighlightRectForUnit(unit);
        this.hoveredUnitId = unit.getId();
    }
}
