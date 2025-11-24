// game/core/src/scenes/HoverManager.ts
import { Sprite, Graphics, Texture } from "pixi.js";
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
import { SceneSettings } from "../scenes/scene_settings";
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
    attachToWorldRoot(obj: Sprite | Graphics, zIndex: number): void;
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
    public hoverPlacementCell?: HoCMath.XY;
    public hoverPlacementCellTeam?: TeamType;
    public hoverSelectedCells?: HoCMath.XY[];
    public hoverSelectedCellsSwitchToRed = false;
    private hoverSilhouette?: Sprite;
    private hoverSilhouetteOutline?: Sprite;
    private hoverSilhouetteKey?: string;
    public hoveredUnitHighlight?: { x: number; y: number; w: number; h: number };
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
    public constructor(context: ISandboxHoverContext) {
        this.context = context;
    }
    public onCameraChanged(): void {
        if (this.hoverSilhouette) this.context.attachToWorldRoot(this.hoverSilhouette, 110);
        if (this.hoverSilhouetteOutline) this.context.attachToWorldRoot(this.hoverSilhouetteOutline, 109);
    }
    public update(dt: number): void {
        this.hoverGlowPhase += dt * 5;
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
        const gs = this.context.sceneSettings.getGridSettings();
        const size = gs.getCellSize();
        const half = size / 2;
        let strokeColor = 0xffffff;
        let fillColor = 0xffffff;
        let fillAlpha = 0.18;
        if (this.hoverSelectedCellsSwitchToRed) {
            strokeColor = 0xff5555;
            fillColor = 0xff3333;
            fillAlpha = 0.25;
        }
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
            gfx.ellipse(cx, cy - yOffset, w * 0.5, h * 0.5).fill({ color: 0xffffff, alpha });
        }
        const baseR = iconSide * 0.6;
        const aroundLayers = 6;
        for (let i = 0; i < aroundLayers; i++) {
            const t = (i + 1) / aroundLayers;
            const rg = baseR * (1 + 0.45 * t) * (1 + pulseFactor);
            const alpha = 0.22 * (1 - t * 0.8) * (1 - pulseFactor * 0.5);
            gfx.circle(cx, cy, rg).fill({ color: 0xffffff, alpha });
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
            return;
        }

        const unit = this.context.unitsHolder.getAllUnits().get(draggingId);
        if (!unit) {
            this.hoveredUnitHighlight = undefined;
            return;
        }

        // Reuse the logic used for passive hover to set the highlight rect
        this.hoveredUnitHighlight = this.getHighlightRectForUnit(unit);
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
        }
        // These were in Sandbox, need to check if we need to expose them or if they are local to hover
        // sc_hoverAttackIsTargetingObstacle -> seems attack related
        // sc_moveBlocked -> seems move related
        // sc_isSelection -> seems selection related

        // We might need to tell Sandbox to reset these flags via context or just ignore them here if they are not strictly hover state.
        // But resetHover was clearing them.

        this.clearHoverSilhouette();
    }
    public clearHoverSilhouette(): void {
        if (this.hoverSilhouette) this.hoverSilhouette.visible = false;
        if (this.hoverSilhouetteOutline) this.hoverSilhouetteOutline.visible = false;
    }
    public updateHoverSilhouette(boundsCenter: HoCMath.XY): void {
        const selected = this.context.getSelectedUnitProperties();
        if (!selected || this.hoverSelectedCellsSwitchToRed || !this.hoverSelectedCells?.length) {
            this.clearHoverSilhouette();
            return;
        }
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
        sprite.tint = 0x000000;
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
        this.clearHoverSilhouette();

        // ⬅️ IMPORTANT: only require a selected unit,
        // do NOT depend on hasActiveSelection() here,
        // otherwise bench-placement hover dies.
        if (!selected) return;

        const cell = GridMath.getCellForPosition(gs, worldPos);
        if (!cell) return;

        const isLarge = selected.size === 2;
        const cellHash = (cell.x << 4) | cell.y;

        let teamFromPlacement: TeamType | undefined;
        if (this.context.placementManager.getAllowedPlacementCellHashesForTeam(TeamVals.LOWER)?.has(cellHash)) {
            teamFromPlacement = TeamVals.LOWER;
        } else if (this.context.placementManager.getAllowedPlacementCellHashesForTeam(TeamVals.UPPER)?.has(cellHash)) {
            teamFromPlacement = TeamVals.UPPER;
        }

        if (!teamFromPlacement) {
            this.resetHover();
            return;
        }

        const draggingUnitTeam = this.context.getDraggingUnitTeam();
        const draggingUnitId = this.context.getDraggingUnitId();

        // Wrong team → red highlight only
        if (draggingUnitTeam && teamFromPlacement !== draggingUnitTeam) {
            let cells: HoCMath.XY[];
            if (isLarge) {
                const allowedForThatSide =
                    this.context.placementManager.getAllowedPlacementCellHashesForTeam(teamFromPlacement);
                const occupiedKeys: string[] = [];
                cells =
                    this.context.pathHelper.getClosestSquareCellIndices(
                        this.context.getMouseWorld(),
                        allowedForThatSide,
                        occupiedKeys,
                        undefined,
                        undefined,
                        undefined,
                    ) ?? [];
                if (cells.length === 0) {
                    cells = [cell];
                }
            } else {
                cells = [cell];
            }

            this.hoverSelectedCells = cells;
            this.hoverSelectedCellsSwitchToRed = true;
            this.hoverPlacementCell = cell;
            this.hoverPlacementCellTeam = teamFromPlacement;
            this.clearHoverSilhouette();
            return;
        }

        const allowedForTeam =
            (teamFromPlacement &&
                this.context.placementManager.getAllowedPlacementCellHashesForTeam(teamFromPlacement)) ??
            undefined;

        let candidateCells: HoCMath.XY[];

        if (isLarge) {
            const occupiedKeys: string[] = [];
            candidateCells =
                this.context.pathHelper.getClosestSquareCellIndices(
                    this.context.getMouseWorld(),
                    allowedForTeam,
                    occupiedKeys,
                    undefined,
                    undefined,
                    undefined,
                ) ?? [];
        } else {
            candidateCells = [cell];
        }

        if (!allowedForTeam || allowedForTeam.size === 0) {
            this.hoverSelectedCells = candidateCells;
            this.hoverSelectedCellsSwitchToRed = true;
            this.hoverPlacementCell = cell;
            this.hoverPlacementCellTeam = teamFromPlacement;
            return;
        }

        let invalid = false;

        if (isLarge) {
            if (candidateCells?.length !== 4) {
                this.resetHover();
                return;
            } else if (!this.context.pathHelper.areCellsFormingSquare(candidateCells)) {
                invalid = true;
            }
        }

        for (const c of candidateCells) {
            const h = (c.x << 4) | c.y;
            if (!this.context.placementManager.getAllowedPlacementCellHashes().has(h)) {
                this.resetHover();
                return;
            }
        }

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

        const gridType = FightStateManager.getInstance().getFightProperties().getGridType();

        const skipPreStartGeom =
            gridType === GridVals.LAVA_CENTER ||
            gridType === GridVals.WATER_CENTER ||
            gridType === GridVals.BLOCK_CENTER;

        if (!invalid && teamFromPlacement && !skipPreStartGeom) {
            const mockUnit = Unit.createUnit(
                selected,
                gs,
                teamFromPlacement,
                UnitVals.CREATURE,
                this.context.abilityFactory,
                this.context.abilityFactory.getEffectsFactory(),
                false,
            );

            const possiblePosition = GridMath.getPositionForCells(gs, candidateCells);
            if (possiblePosition) {
                mockUnit.setPosition(possiblePosition.x, possiblePosition.y, false);
            }

            const lowerLeftPlacement = this.context.getPlacement(TeamVals.LOWER, 0);
            const upperRightPlacement = this.context.getPlacement(TeamVals.UPPER, 0);
            const lowerRightPlacement = this.context.getPlacement(TeamVals.LOWER, 1);
            const upperLeftPlacement = this.context.getPlacement(TeamVals.UPPER, 1);

            if (
                !this.context.pathHelper.isAllowedPreStartUnitPosition(
                    mockUnit,
                    candidateCells,
                    this.context.unitsHolder,
                    lowerLeftPlacement,
                    upperRightPlacement,
                    lowerRightPlacement,
                    upperLeftPlacement,
                )
            ) {
                invalid = true;
            }
        }

        if (!invalid && !draggingUnitId) {
            const lowerLeftPlacement = this.context.getPlacement(TeamVals.LOWER, 0);
            const upperRightPlacement = this.context.getPlacement(TeamVals.UPPER, 0);
            const lowerRightPlacement = this.context.getPlacement(TeamVals.LOWER, 1);
            const upperLeftPlacement = this.context.getPlacement(TeamVals.UPPER, 1);

            if (lowerLeftPlacement && upperRightPlacement && teamFromPlacement) {
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

        this.hoverSelectedCellsSwitchToRed = invalid;
        this.hoverPlacementCell = cell;
        this.hoverSelectedCells = candidateCells;
        this.hoverPlacementCellTeam = teamFromPlacement;

        if (!invalid && candidateCells.length > 0) {
            const size = gs.getCellSize();
            const half = size / 2;

            let minX = Number.POSITIVE_INFINITY;
            let maxX = Number.NEGATIVE_INFINITY;
            let minY = Number.POSITIVE_INFINITY;
            let maxY = Number.NEGATIVE_INFINITY;

            for (const c of candidateCells) {
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
            return;
        }

        const p = this.context.getMouseWorld();
        const gs = this.context.sceneSettings.getGridSettings();

        // Find unit under mouse
        const cell = GridMath.getCellForPosition(gs, p);
        if (!cell) {
            this.hoveredUnitHighlight = undefined;
            this.clearHoverSilhouette();
            return;
        }

        const occupantId = this.context.grid.getOccupantUnitId(cell);
        if (!occupantId) {
            this.hoveredUnitHighlight = undefined;
            this.clearHoverSilhouette();
            return;
        }

        const unit = this.context.unitsHolder.getAllUnits().get(occupantId);
        if (!unit) {
            this.hoveredUnitHighlight = undefined;
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
            this.clearHoverSilhouette();
            return;
        }

        this.hoveredUnitHighlight = this.getHighlightRectForUnit(unit);
    }
}
