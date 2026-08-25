import { Assets, Sprite, Graphics, Texture, Text } from "pixi.js";
import {
    FightStateManager,
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
    type IWeightedRoute,
} from "@heroesofcrypto/common";
import { SceneSettings } from "./SceneSettings";
import { PlacementManager } from "./PlacementManager";
import { TextureType, unitToTextureName } from "@/pixi/PixiUnitsFactory";
import { HOC_NUMERIC_ARIAL_FONT_FAMILY } from "../fontFamilies";
import { images } from "../generated/image_imports";
import { projectBattlefieldPoint, projectedPolyline, projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";
import type { BattlefieldUnitPreview } from "./RenderableUnit";
import { placementFacingDirectionForTeam } from "./RenderableUnit";

const MELEE_SWORD_ANGLE_STEP = Math.PI / 4;
// Dedicated top layer for pointer-like attack markers. They must remain above units, badges, projected
// damage and spell overlays regardless of which battlefield object the pointer is currently crossing.
const ATTACK_CURSOR_MARKER_Z = 1_000_000;
// The visible blade-to-pommel diagonal inside the 20x24 cursor artwork.
const MELEE_SWORD_ART_LENGTH = 29;
// The source is 20x24, so its painted blade is not geometrically aligned to a perfect 45-degree
// square diagonal. Measure the actual pommel -> tip vector; subtracting 135deg made every supposedly
// horizontal/vertical marker visibly lean by several degrees.
const MELEE_SWORD_NATIVE_WORLD_ANGLE = Math.atan2(23, -18);

// cursor_ranged.webp is a 22x24 arrow drawn along the up-left diagonal. Measured off the actual
// artwork — opaque tip at (1, 0), tail at (21, 20) — so the axis lands on exactly 135 degrees once
// the world's Y flip is accounted for, and its drawn length is 28.3px rather than the 22 or 24 a
// glance at the canvas would suggest.
const RANGED_ARROW_ART_LENGTH = 28.3;
const RANGED_ARROW_NATIVE_WORLD_ANGLE = Math.atan2(20, -20);
const RANGED_ARROW_TIP_ANCHOR_X = 1 / 22;
const RANGED_ARROW_TIP_ANCHOR_Y = 0;
// Roughly the span the old triangular head occupied, so replacing it does not change how far down
// the flight line the marker reaches.
const RANGED_ARROW_DISPLAY_LENGTH = 36;
const THIEF_PREVIEW_VISIBLE_HEIGHT_RATIO = 186 / 192;

const usesTallThiefPreview = (props: UnitProperties): boolean =>
    props.size === 1 && (props.name === "Thief" || props.name === "Scavenger");

/**
 * Footprint sides read straight off raw properties. Unit.getFootprintWidth() is not available here: the
 * hover surfaces preview bench selections, relayed opponent intents and snapshot payloads, any of which
 * can be a plain UnitProperties bag that predates footprints and carries only `size`.
 */
export const footprintWidthOf = (props: UnitProperties): number =>
    GridMath.normalizeFootprintSide(props.footprint_width, GridMath.normalizeFootprintSide(props.size));

export const footprintHeightOf = (props: UnitProperties): number =>
    GridMath.normalizeFootprintSide(props.footprint_height, GridMath.normalizeFootprintSide(props.size));

/** Whether these properties describe a body that covers more than its anchor cell. */
const occupiesManyCells = (props: UnitProperties): boolean =>
    footprintWidthOf(props) > 1 || footprintHeightOf(props) > 1;

const unitPreviewScale = (props: UnitProperties, texture: Texture, cellSize: number): number => {
    if (usesTallThiefPreview(props)) {
        return (cellSize * 1.5) / (Math.max(1, texture.height) * THIEF_PREVIEW_VISIBLE_HEIGHT_RATIO);
    }
    // 128 authored pixels is one cell of board art, so a ghost spans as many of them as its footprint is
    // WIDE — 128 for a 1x1 and 256 for a 2x2, the two numbers this used to hard-code off `size`. Height
    // deliberately follows the texture's own aspect: the art tiers are square (_128 / _256) and none of
    // them is rectangular yet, so a wide creature's vertical framing stays RenderableUnit's authored
    // profile rather than a stretch applied here.
    return (128 * footprintWidthOf(props)) / Math.max(1, texture.width);
};

const unitPreviewY = (props: UnitProperties, centerY: number, cellSize: number): number =>
    usesTallThiefPreview(props) ? centerY + cellSize * 0.5 : centerY;

/** Cells occupied by a unit whose battlefield anchor is the top-right cell of its footprint. */
export const combatFootprintCellsForBase = (base: HoCMath.XY, width: number, height = width): HoCMath.XY[] => {
    const cells: HoCMath.XY[] = [];
    for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) cells.push({ x: base.x - dx, y: base.y - dy });
    }
    return cells;
};

export const snapMeleeSwordAngle = (angle: number): number =>
    Math.round(angle / MELEE_SWORD_ANGLE_STEP) * MELEE_SWORD_ANGLE_STEP;

/** Compact original cursor: half a cell, regardless of side, projection, or attacker offset. */
export const meleeSwordDisplayLength = (cellSize: number): number => cellSize * 0.5;

/** Resolve the eight-way facing from logical cells, never from an authored sprite's shifted foot anchor. */
export const meleeSwordFacingAngle = (landingCenter: HoCMath.XY, targetCenter: HoCMath.XY): number =>
    snapMeleeSwordAngle(Math.atan2(targetCenter.y - landingCenter.y, targetCenter.x - landingCenter.x));

/** Keep the blade tip on the target anchor while the sword body stays outside the target footprint. */
export const meleeSwordSpriteCenter = (
    targetAnchor: HoCMath.XY,
    snappedAngle: number,
    displayLength: number,
): HoCMath.XY => ({
    x: targetAnchor.x - Math.cos(snappedAngle) * (displayLength / 2),
    y: targetAnchor.y - Math.sin(snappedAngle) * (displayLength / 2),
});

/**
 * Intersection of the landing-cell -> target-centre ray with the target's footprint rectangle.
 * Cardinal landings meet the middle of an edge; diagonal landings meet the corresponding corner.
 *
 * The two half-extents are separate because a rectangular body reaches further on its long axis; they
 * are equal for every square shape, which is why the callers used to pass a single number.
 */
export const meleeSwordTargetPoint = (
    landingCenter: HoCMath.XY,
    targetCenter: HoCMath.XY,
    targetHalfExtentX: number,
    targetHalfExtentY: number = targetHalfExtentX,
): HoCMath.XY => {
    const dx = landingCenter.x - targetCenter.x;
    const dy = landingCenter.y - targetCenter.y;
    const maxAxis = Math.max(Math.abs(dx), Math.abs(dy));
    if (maxAxis === 0) return { ...targetCenter };
    return {
        x: targetCenter.x + (dx / maxAxis) * targetHalfExtentX,
        y: targetCenter.y + (dy / maxAxis) * targetHalfExtentY,
    };
};

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
    getCurrentActiveKnownPaths(): Map<number, IWeightedRoute[]> | undefined;
    getDraggingUnitId(): string | undefined;
    getDraggingUnitTeam(): TeamType | undefined;
    getPlacementPreviewUnit(): Unit | undefined;
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
    public hoverBattlefieldFootprintCells?: HoCMath.XY[];
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
    private hoverAttackSwordTexture?: Texture;
    private hoverRangedArrowTexture?: Texture;
    private hoverRangedArrowHead?: Sprite;
    public constructor(context: ISandboxHoverContext) {
        this.context = context;
        this.auraGraphics = new Graphics();
        this.aoeGraphics = new Graphics();
        // Pixi v8's Texture.from(string) only resolves textures already present in its cache. The cursor
        // artwork comes from the Dropbox-backed generated image set; load it explicitly so the melee
        // geometry never starts with Texture.EMPTY.
        void Assets.load<Texture>(images.cursor_melee).then((texture) => {
            // Keep the tiny pixel-art sword crisp when it is enlarged to span a grid-cell segment.
            texture.source.scaleMode = "nearest";
            this.hoverAttackSwordTexture = texture;
        });
        // Same treatment for the ranged marker: the flight line ends in this arrow instead of a
        // drawn triangle, so the shot reads as an actual arrow in flight rather than a pointer.
        void Assets.load<Texture>(images.cursor_ranged).then((texture) => {
            texture.source.scaleMode = "nearest";
            this.hoverRangedArrowTexture = texture;
        });
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
    private getLiveUnitPreview(
        props: UnitProperties,
        logicalPosition: HoCMath.XY,
        preferredUnit?: Unit,
    ): BattlefieldUnitPreview | undefined {
        const active = (preferredUnit ?? this.context.getCurrentActiveUnit()) as
            | (Unit & {
                  getBattlefieldPreviewAt?: (
                      position: HoCMath.XY,
                      gridSettings: ReturnType<SceneSettings["getGridSettings"]>,
                  ) => BattlefieldUnitPreview | undefined;
              })
            | undefined;
        if (!active?.getBattlefieldPreviewAt) return undefined;
        const activeProps = active.getUnitProperties();
        // The live frame may only be cloned onto a preview that stands on the same rectangle. Comparing
        // `size` collapsed 2x1 and 2x2 onto the same number, so a stack of one shape could borrow the
        // other's transform.
        if (
            activeProps.name !== props.name ||
            footprintWidthOf(activeProps) !== footprintWidthOf(props) ||
            footprintHeightOf(activeProps) !== footprintHeightOf(props)
        ) {
            return undefined;
        }
        return active.getBattlefieldPreviewAt(logicalPosition, this.context.sceneSettings.getGridSettings());
    }
    private applyLiveUnitPreview(
        sprite: Sprite,
        outline: Sprite,
        preview: BattlefieldUnitPreview,
        outlineGrowth = 1.06,
    ): void {
        sprite.texture = preview.texture;
        outline.texture = preview.texture;
        sprite.anchor.set(preview.anchorX, preview.anchorY);
        outline.anchor.set(preview.anchorX, preview.anchorY);
        sprite.scale.set(preview.scaleX, preview.scaleY);
        outline.scale.set(preview.scaleX * outlineGrowth, preview.scaleY * outlineGrowth);
        sprite.position.set(preview.x, preview.y);
        outline.position.set(preview.x, preview.y);
        sprite.rotation = preview.rotation;
        outline.rotation = preview.rotation;
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
            .poly(projectedRectPoints(minX + 1, minY + 1, maxX - 1, maxY - 1, gs))
            .fill({ color: 0xff3333, alpha: 0.18 })
            .stroke({ width: 2, color: 0xff6666, alpha: 0.85 });
    }
    public clear(): void {
        this.hoverAttackUnits = undefined;
        this.hoverAttackFromCell = undefined;
        this.hoverPlacementCell = undefined;
        this.hoverSelectedCells = undefined;
        this.hoverBattlefieldFootprintCells = undefined;
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
        footprintWidth: number,
        footprintHeight = footprintWidth,
        alphaMultiplier = 1.0,
    ): void {
        // Aesthetic Configuration
        const color = isBuff ? 0x00ff88 : 0xff4444; // Green vs Red
        const fillColor = isBuff ? 0x00ff88 : 0xff0000;
        const fillAlpha = 0.15 * alphaMultiplier;
        const strokeAlpha = 0.6 * alphaMultiplier;
        const strokeWidth = 2;

        const gs = this.context.sceneSettings.getGridSettings();
        // The aura reaches `radius` out from the BODY, so each axis is widened by that axis' own half
        // footprint: half a cell for a side of 1, a whole cell for a side of 2 — the previous
        // isSmallUnit branch, once per axis instead of once for both.
        const extentX = radius + GridMath.normalizeFootprintSide(footprintWidth) * gs.getHalfStep();
        const extentY = radius + GridMath.normalizeFootprintSide(footprintHeight) * gs.getHalfStep();

        const auraGraphics = this.ensureAuraGraphics();
        if (!auraGraphics) return;
        auraGraphics
            .poly(
                projectedRectPoints(center.x - extentX, center.y - extentY, center.x + extentX, center.y + extentY, gs),
            )
            .fill({ color: fillColor, alpha: fillAlpha })
            .stroke({ width: strokeWidth, color: color, alpha: strokeAlpha });
    }
    public drawAttackRange(center: HoCMath.XY, radius: number): void {
        const color = 0xffff00; // Yellow (matches Active/Hovered Range)
        const alpha = 0.8;
        const width = 2;

        const auraGraphics = this.ensureAuraGraphics();
        if (!auraGraphics) return;
        const points: HoCMath.XY[] = [];
        const segments = 96;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
        }
        auraGraphics.poly(projectedPolyline(points, this.context.sceneSettings.getGridSettings())).stroke({
            width,
            color,
            alpha,
        });
    }
    public update(dt: number): void {
        this.hoverGlowPhase += dt * (5 / 3);
        if (this.animatedRangeArrow) {
            const arrow = this.animatedRangeArrow;
            this.drawAttackArrow(arrow.from, arrow.to, arrow.continuationTo, arrow.smokeFrom, "arrow", false);
        }
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
    private drawFootprintCells(gfx: Graphics, cells: HoCMath.XY[], invalid: boolean): void {
        const gs = this.context.sceneSettings.getGridSettings();
        const size = gs.getCellSize();
        const half = size / 2;
        const inset = Math.max(2, size * 0.055);
        const pulse = (Math.sin(this.hoverGlowPhase * 1.2) + 1) / 2;
        const strokeColor = invalid ? 0xff5555 : 0xffe2a0;
        const fillColor = invalid ? 0xff3333 : 0xffc85a;
        const fillAlpha = invalid ? 0.25 : 0.16 + pulse * 0.06;
        const strokeAlpha = invalid ? 1 : 0.82 + pulse * 0.18;

        for (const c of cells) {
            const pos = GridMath.getPositionForCell(c, gs.getMinX(), gs.getStep(), gs.getHalfStep());
            const left = pos.x - half;
            const right = pos.x + half;
            const bottom = pos.y - half;
            const top = pos.y + half;

            gfx.poly(projectedRectPoints(left + inset, bottom + inset, right - inset, top - inset, gs))
                .fill({ color: fillColor, alpha: fillAlpha })
                .stroke({ width: Math.max(2, size * 0.035), color: strokeColor, alpha: strokeAlpha });
        }
    }
    public drawHoverPlacementCell(gfx: Graphics): void {
        const cells = this.hoverSelectedCells;
        if (!cells || cells.length === 0) return;
        this.drawFootprintCells(gfx, cells, this.hoverSelectedCellsSwitchToRed);
    }
    public drawHoverBattlefieldFootprint(gfx: Graphics): void {
        const cells = this.hoverBattlefieldFootprintCells;
        if (!cells || cells.length === 0) return;
        this.drawFootprintCells(gfx, cells, false);
    }
    public isCellReachableForActiveUnit(cell: HoCMath.XY): boolean {
        const currentActiveUnit = this.context.getCurrentActiveUnit();
        const currentActivePathHashes = this.context.getCurrentActivePathHashes();

        if (!currentActiveUnit) return false;
        if (!currentActivePathHashes || !currentActivePathHashes.size) return false;

        const props = currentActiveUnit.getUnitProperties();
        const hash = (x: number, y: number) => (x << 4) | y;

        // A one-cell body is reachable exactly when its own cell is in the path set; anything larger has to
        // find a whole footprint that fits, which is what the candidate finder answers.
        if (!occupiesManyCells(props)) {
            return currentActivePathHashes.has(hash(cell.x, cell.y));
        }

        return this.findLargeUnitMoveCandidate(cell) !== null;
    }
    // Copied from Sandbox (assumed private there)
    public findLargeUnitMoveCandidate(cell: HoCMath.XY): HoCMath.XY[] | null {
        const currentActiveUnit = this.context.getCurrentActiveUnit();
        const currentActivePathHashes = this.context.getCurrentActivePathHashes();
        const currentActiveKnownPaths = this.context.getCurrentActiveKnownPaths();
        if (!currentActiveUnit || !currentActivePathHashes) return null;

        const hash = (x: number, y: number) => (x << 4) | y;
        const gs = this.context.sceneSettings.getGridSettings();

        const props = currentActiveUnit.getUnitProperties();
        const width = footprintWidthOf(props);
        const height = footprintHeightOf(props);

        // Every footprint that COVERS the hovered cell is a candidate landing: the cursor may sit on any
        // of the body's W*H cells. The candidate order decides which landing wins when several are legal,
        // so it is kept exactly as it was — cursor cell as the block's minimum corner first, then the
        // block sliding down and left over it — which is also the order the placement ghost enumerates.
        for (let cursorDx = 0; cursorDx < width; cursorDx++) {
            for (let cursorDy = 0; cursorDy < height; cursorDy++) {
                const anchor = { x: cell.x - cursorDx + width - 1, y: cell.y - cursorDy + height - 1 };
                // Reject the whole block before any of its cells is hashed: an off-board cell packs into
                // (x << 4) | y as a key that collides with a real one ((-1 << 4) | y === -1 for every y).
                if (!GridMath.isFootprintWithinGrid(gs, anchor, width, height)) continue;

                // Ascending from the minimum corner, so the LAST cell is the anchor. Callers hand this
                // list straight to executeMoveSequence as the move path, which keys the route metadata off
                // its final cell — and only the anchor is a key in knownPaths.
                const footprint: HoCMath.XY[] = [];
                for (let dx = 0; dx < width; dx++) {
                    for (let dy = 0; dy < height; dy++) {
                        footprint.push({ x: anchor.x - width + 1 + dx, y: anchor.y - height + 1 + dy });
                    }
                }
                if (!footprint.every((c) => currentActivePathHashes.has(hash(c.x, c.y)))) continue;
                if (!currentActiveKnownPaths?.has(hash(anchor.x, anchor.y))) continue;

                return footprint;
            }
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
        // Use the exact world position of the unit, which is the CENTRE of its whole footprint.
        const pos = unit.getPosition();
        const gs = this.context.sceneSettings.getGridSettings();
        const cellSize = gs.getCellSize();

        // The rect is the body's own cells: one cell per footprint side. `size` gave the same answer for
        // 1x1 and 2x2 and a square for everything else, which both over-covered the short axis (hovering
        // empty board lit the unit) and under-covered the long one (half the body was not hoverable).
        const w = cellSize * unit.getFootprintWidth();
        const h = cellSize * unit.getFootprintHeight();

        // Top-left corner relative to that centre.
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
    private animatedRangeArrow?: {
        from: HoCMath.XY;
        to: HoCMath.XY;
        continuationTo?: HoCMath.XY;
        smokeFrom?: HoCMath.XY;
    };
    private hoverAttackSword?: Sprite;
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
        if (this.hoverRangedArrowHead) this.hoverRangedArrowHead.visible = false;
        if (this.hoverAttackArrow) {
            this.safeClearGraphics(this.hoverAttackArrow);
            this.hoverAttackArrow.visible = false;
        }
        this.animatedRangeArrow = undefined;
        if (this.hoverAttackSword) this.hoverAttackSword.visible = false;
        this.hoverBattlefieldFootprintCells = undefined;
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
        if (this.hoverRangedArrowHead) this.hoverRangedArrowHead.visible = false;
        if (this.hoverAttackArrow) {
            this.safeClearGraphics(this.hoverAttackArrow);
            this.hoverAttackArrow.visible = false;
        }
        if (this.hoverAttackSword) this.hoverAttackSword.visible = false;
        this.hoverBattlefieldFootprintCells = undefined;
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
                    fontFamily: HOC_NUMERIC_ARIAL_FONT_FAMILY,
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
                        fontFamily: HOC_NUMERIC_ARIAL_FONT_FAMILY,
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
        this.animatedRangeArrow = undefined;
        if (this.hoverAttackSword) this.hoverAttackSword.visible = false;
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

        // Hide the per-unit AOE damage labels (Gargantuan Area Throw preview) and return them to the pool,
        // exactly like the silhouettes above. updateAreaThrowHover calls clearAttackVisuals() at the top of
        // every hover frame, so the labels refresh each frame and clear on every aim-exit path.
        for (const label of this.aoeDamageLabels) {
            label.visible = false;
            this.aoeDamageLabelPool.push(label);
        }
        this.aoeDamageLabels = [];

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
    public addTargetHighlight(targetUnit: Unit, tint: number = 0xff3030): void {
        this.hoverAttackTargetUnit = targetUnit; // Keep referring to last added (primary usually added first, but overwritten here is fine for now as long as we track all in highlightedUnits)
        this.highlightedUnits.push(targetUnit);

        // Hide stack on target for cleaner visual
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rUnit = targetUnit as any;
        if (typeof rUnit.setStackVisibility === "function") {
            rUnit.setStackVisibility(false);
        }

        const targetProps = targetUnit.getUnitProperties();
        const livePreview = this.getLiveUnitPreview(targetProps, targetUnit.getPosition(), targetUnit);
        // Board art, never the _512 card portrait, and the REAL shape: passing `size` as both axes
        // collapsed the rectangular texture tiers, so the ghost picked a different texture (and a
        // different normalized scale) than the live sprite.
        const texName = unitToTextureName(
            targetUnit.getName(),
            TextureType.SMALL,
            targetUnit.getFootprintWidth(),
            targetUnit.getFootprintHeight(),
        );
        const tex = livePreview?.texture ?? this.context.texAny(texName);
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
        }
        // The old blurred legacy portrait produced an amorphous red spot. Use the current authored
        // frame and exact live transform so the creature itself is what turns red.
        silhouette.filters = [];

        if (livePreview) {
            silhouette.texture = livePreview.texture;
            silhouette.anchor.set(livePreview.anchorX, livePreview.anchorY);
            silhouette.scale.set(livePreview.scaleX, livePreview.scaleY);
            silhouette.position.set(livePreview.x, livePreview.y);
            silhouette.rotation = livePreview.rotation;
        } else {
            let centerPos = targetUnit.getPosition();
            if (typeof rUnit.getVisualCenter === "function") {
                centerPos = rUnit.getVisualCenter(this.context.sceneSettings.getGridSettings());
            }
            const baseWidth = tex.width || 1;
            // Same authored-pixels-per-cell rule as the hover ghost (unitPreviewScale): the overlay is as
            // wide as the body it covers, so it never overhangs a narrow creature.
            const scale = (128 * targetUnit.getFootprintWidth()) / baseWidth;
            silhouette.anchor.set(0.5);
            silhouette.scale.set(scale, -scale);
            silhouette.position.set(centerPos.x, centerPos.y);
            silhouette.rotation = 0;
        }
        silhouette.visible = true;
        silhouette.alpha = 0.72;
        // Caller-chosen tint: dark red for harmful targets, green for buff/heal spell targets.
        silhouette.tint = tint;

        this.hoverTargetSilhouettes.push(silhouette);
    }
    private aoeDamageLabels: Text[] = [];
    private aoeDamageLabelPool: Text[] = [];
    /**
     * Floating projected-damage number over ONE splashed unit, for the Gargantuan Area Throw (3x3) aim
     * preview. Unlike drawDamagePrediction (which reuses a single shared Text and so can only show one
     * number), this pools N labels — one per unit in the splash — recycled each hover frame in
     * clearAttackVisuals(). Same style + Y-flip as drawDamagePrediction. Works in ranked unchanged, since
     * the whole area-throw hover path is inherited by RankedPlayScene.
     */
    public addAOEDamageLabel(position: HoCMath.XY, damageStr: string, isLargeTarget: boolean): void {
        const scale = isLargeTarget ? 2 : 1;
        let label: Text;
        if (this.aoeDamageLabelPool.length > 0) {
            label = this.aoeDamageLabelPool.pop()!;
            label.text = damageStr;
        } else {
            label = new Text({
                text: damageStr,
                style: {
                    fontFamily: HOC_NUMERIC_ARIAL_FONT_FAMILY,
                    fontSize: 24,
                    fill: 0xffffff,
                    stroke: { color: 0x000000, width: 4, join: "round" },
                    align: "center",
                    fontWeight: "bold",
                },
            });
            label.anchor.set(0.5, 0.5);
            // Above the translucent 3x3 AOE fill (drawAOEArea attaches at z 4500) so the numbers sit on top of
            // it rather than under its red wash — and above units/silhouettes/arrow like the single-target text.
            this.context.attachToWorldRoot(label, 4600);
        }
        label.visible = true;
        // The world root is Y-inverted (see drawDamagePrediction / the silhouettes) — a negative Y scale
        // keeps the number upright instead of mirrored.
        label.scale.set(scale, -scale);
        label.position.set(position.x, position.y);
        this.aoeDamageLabels.push(label);
    }
    /**
     * `smokeFrom` marks where the shot first enters SMOKE. From that point to the target the arrow is
     * drawn thick and red, because the smoke rule is STICKY: once the ray crosses a smoked cell every
     * target after it takes half damage (divisor doubles, capped at 1/8). Highlighting only the smoked
     * CELLS would understate that — the penalty applies to the whole remainder of the flight, so that is
     * what the emphasis covers. The cloud is neutral, so this shows for either side's shots.
     */
    public drawAttackArrow(
        from: HoCMath.XY,
        to: HoCMath.XY,
        continuationTo?: HoCMath.XY,
        smokeFrom?: HoCMath.XY,
        marker: "arrow" | "melee" = "arrow",
        rememberAnimation = true,
        meleeFacingAngle?: number,
    ): void {
        // If attacking from same position (Stand Ground), don't draw arrow
        const dist = Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2));
        if (dist < 10) {
            if (this.hoverAttackArrow) this.hoverAttackArrow.visible = false;
            if (this.hoverAttackSword) this.hoverAttackSword.visible = false;
            if (this.hoverRangedArrowHead) this.hoverRangedArrowHead.visible = false;
            return;
        }

        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        if (marker === "melee") {
            this.animatedRangeArrow = undefined;
            if (this.hoverAttackArrow) this.hoverAttackArrow.visible = false;
            if (this.hoverRangedArrowHead) this.hoverRangedArrowHead.visible = false;
            if (!this.hoverAttackSwordTexture) return;
            if (!this.hoverAttackSword || this.hoverAttackSword.destroyed) {
                this.hoverAttackSword = new Sprite(this.hoverAttackSwordTexture);
                this.hoverAttackSword.anchor.set(0.5);
                // The marker crosses the unit portrait by design. Keep it above units and their hover
                // silhouettes; at the old arrow layer the compact sprite disappeared underneath them.
                this.context.attachToWorldRoot(this.hoverAttackSword, ATTACK_CURSOR_MARKER_Z);
            }
            const sword = this.hoverAttackSword;
            sword.visible = true;
            // Melee landings occupy the eight cells around a target. Snap to those eight 45-degree
            // facings so the marker never wobbles with tiny pointer movements inside the same cell.
            // Projection and authored foot anchors make the measured segment differ by side. Resolve the
            // eight-way melee facing from logical cells when supplied, while keeping the cursor compact.
            const snappedAngle = snapMeleeSwordAngle(meleeFacingAngle ?? angle);
            const displayLength = meleeSwordDisplayLength(this.context.sceneSettings.getGridSettings().getCellSize());
            const swordScale = displayLength / MELEE_SWORD_ART_LENGTH;
            sword.scale.set(swordScale, -swordScale);
            // Negative Y keeps the PNG upright inside the inverted world. Rotate from the artwork's
            // measured axis rather than assuming its non-square 20x24 canvas has a perfect 45° diagonal.
            sword.rotation = snappedAngle - MELEE_SWORD_NATIVE_WORLD_ANGLE;
            sword.roundPixels = true;
            // `to` is one of the eight projected edge/corner anchors around the target. It marks the
            // BLADE TIP from the user's sketch, not the sprite centre: keep the whole sword on the
            // attacker's side instead of letting half of it cross the target figure.
            const swordCenter = meleeSwordSpriteCenter(to, snappedAngle, displayLength);
            sword.position.set(swordCenter.x, swordCenter.y);
            return;
        }
        if (rememberAnimation) {
            this.animatedRangeArrow = {
                from: { ...from },
                to: { ...to },
                continuationTo: continuationTo ? { ...continuationTo } : undefined,
                smokeFrom: smokeFrom ? { ...smokeFrom } : undefined,
            };
        }
        if (this.hoverAttackSword) this.hoverAttackSword.visible = false;

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
        // Adjust arrow length to stop a bit before the visual center
        const stopDistance = 0; // Removed gap as per user request
        const arrowLen = Math.max(0, dist - stopDistance);

        if (arrowLen <= 0) return;

        // Animated broken trajectory: compact ivory strokes flow toward the target over a warm glow.
        // The gaps leave the board readable even for a shot crossing most of the map.
        const dashLength = 18;
        const dashGap = 11;
        const dashCycle = dashLength + dashGap;
        const dashPhase = (this.hoverGlowPhase * 58) % dashCycle;
        const drawDashes = (start: number, finish: number, width: number, color: number, alpha: number) => {
            for (let d = start - dashCycle + dashPhase; d < finish; d += dashCycle) {
                const segmentStart = Math.max(start, d);
                const segmentEnd = Math.min(finish, d + dashLength);
                if (segmentEnd <= segmentStart) continue;
                g.moveTo(from.x + Math.cos(angle) * segmentStart, from.y + Math.sin(angle) * segmentStart)
                    .lineTo(from.x + Math.cos(angle) * segmentEnd, from.y + Math.sin(angle) * segmentEnd)
                    .stroke({ width, color, alpha, cap: "round" });
            }
        };
        drawDashes(0, arrowLen, 16, 0xff4028, 0.28);
        drawDashes(0, arrowLen, 7, 0xffa13d, 0.58);
        drawDashes(0, arrowLen, 2.5, 0xfff4dc, 0.98);

        // A bright travelling bead makes the direction unmistakably animated even on dark or busy tiles.
        const flightPulse = (this.hoverGlowPhase * 92) % Math.max(arrowLen, 1);
        const pulseX = from.x + Math.cos(angle) * flightPulse;
        const pulseY = from.y + Math.sin(angle) * flightPulse;
        g.circle(pulseX, pulseY, 11).fill({ color: 0xff542e, alpha: 0.2 });
        g.circle(pulseX, pulseY, 5).fill({ color: 0xffbc58, alpha: 0.62 });
        g.circle(pulseX, pulseY, 2).fill({ color: 0xffffee, alpha: 1 });

        const endX = from.x + Math.cos(angle) * arrowLen;
        const endY = from.y + Math.sin(angle) * arrowLen;

        // SMOKED SEGMENT: from where the ray enters smoke to the tip, overdrawn thick and red so the
        // halved stretch of the flight is unmistakable against the plain white core above. Clamped to the
        // arrow so a smoke entry resolved slightly off-axis can't draw past the target.
        if (smokeFrom) {
            const along = (smokeFrom.x - from.x) * Math.cos(angle) + (smokeFrom.y - from.y) * Math.sin(angle);
            const startAlong = Math.max(0, Math.min(arrowLen, along));
            const sx = from.x + Math.cos(angle) * startAlong;
            const sy = from.y + Math.sin(angle) * startAlong;
            drawDashes(startAlong, arrowLen, 15, 0xff2020, 0.26);
            drawDashes(startAlong, arrowLen, 5, 0xff5f4f, 0.95);
            const smokeLength = arrowLen - startAlong;
            if (smokeLength > 0) {
                const smokePulse = startAlong + ((this.hoverGlowPhase * 76) % smokeLength);
                const smokePulseX = from.x + Math.cos(angle) * smokePulse;
                const smokePulseY = from.y + Math.sin(angle) * smokePulse;
                g.circle(smokePulseX, smokePulseY, 12).fill({ color: 0xff1818, alpha: 0.24 });
                g.circle(smokePulseX, smokePulseY, 4).fill({ color: 0xff7666, alpha: 0.95 });
            }
            // A tick at the entry point so it is obvious WHERE the smoke starts, not just that it exists.
            const nx = Math.cos(angle + Math.PI / 2);
            const ny = Math.sin(angle + Math.PI / 2);
            g.moveTo(sx - nx * 11, sy - ny * 11)
                .lineTo(sx + nx * 11, sy + ny * 11)
                .stroke({ width: 4, color: 0xff8a8a, alpha: 0.95 });
        }

        // The head is the cursor_ranged arrow itself, rotated onto the flight line so it reads as a
        // continuation of it. Keep its geometry fixed: pulsing the scale moved the painted tip even when
        // the intended endpoint stayed still.
        const headPulse = (Math.sin(this.hoverGlowPhase * 6) + 1) / 2;
        const headLen = RANGED_ARROW_DISPLAY_LENGTH;
        // A soft ember behind the sprite. Without it the arrow loses its silhouette on lit tiles —
        // the old head kept its own glow polygon for the same reason.
        g.circle(endX - Math.cos(angle) * headLen * 0.35, endY - Math.sin(angle) * headLen * 0.35, 13).fill({
            color: 0xff3b24,
            alpha: 0.2 + headPulse * 0.12,
        });

        if (this.hoverRangedArrowTexture) {
            if (!this.hoverRangedArrowHead || this.hoverRangedArrowHead.destroyed) {
                this.hoverRangedArrowHead = new Sprite(this.hoverRangedArrowTexture);
                // The painted tip is at (1, 0) in the 22x24 source. Anchor that exact pixel to the target
                // edge instead of estimating it by backing a canvas-centred sprite up half its length.
                this.hoverRangedArrowHead.anchor.set(RANGED_ARROW_TIP_ANCHOR_X, RANGED_ARROW_TIP_ANCHOR_Y);
                // Same layer as the melee sword: the marker is meant to cross the target portrait,
                // and at the arrow graphics' own depth it slid underneath units and silhouettes.
                this.context.attachToWorldRoot(this.hoverRangedArrowHead, ATTACK_CURSOR_MARKER_Z);
            }
            const head = this.hoverRangedArrowHead;
            head.visible = true;
            const headScale = headLen / RANGED_ARROW_ART_LENGTH;
            // Negative Y keeps the artwork upright inside the inverted world, exactly as the sword does.
            head.scale.set(headScale, -headScale);
            head.rotation = angle - RANGED_ARROW_NATIVE_WORLD_ANGLE;
            head.roundPixels = true;
            head.position.set(endX, endY);
        }

        // Optional faint dashed continuation PAST the arrow tip. Used when a ranged shot is stopped by a
        // mountain: the arrow ends at the rock, then this thin dotted line traces where the shot WOULD
        // have carried on to the intended unit, so the whole projection still reads at a glance.
        if (continuationTo) {
            const cDist = Math.hypot(continuationTo.x - endX, continuationTo.y - endY);
            if (cDist > 6) {
                const cAngle = Math.atan2(continuationTo.y - endY, continuationTo.x - endX);
                const dash = 9;
                const gap = 9;
                const continuationPhase = (this.hoverGlowPhase * 58) % (dash + gap);
                for (let d = -dash - gap + continuationPhase; d < cDist; d += dash + gap) {
                    const segmentStart = Math.max(0, d);
                    const segEnd = Math.min(d + dash, cDist);
                    if (segEnd <= segmentStart) continue;
                    g.moveTo(endX + Math.cos(cAngle) * segmentStart, endY + Math.sin(cAngle) * segmentStart)
                        .lineTo(endX + Math.cos(cAngle) * segEnd, endY + Math.sin(cAngle) * segEnd)
                        .stroke({ width: 2, color: 0xff9c70, alpha: 0.42, cap: "round" });
                }
                const continuationPulse = (this.hoverGlowPhase * 74) % cDist;
                const continuationPulseX = endX + Math.cos(cAngle) * continuationPulse;
                const continuationPulseY = endY + Math.sin(cAngle) * continuationPulse;
                g.circle(continuationPulseX, continuationPulseY, 7).fill({ color: 0xff6540, alpha: 0.2 });
                g.circle(continuationPulseX, continuationPulseY, 2.5).fill({ color: 0xffb27f, alpha: 0.8 });
            }
        }
    }
    // Soft red glow marking an obstacle (a BLOCK_CENTER mountain) as the thing a blocked ranged shot
    // actually hits — used instead of the unit target-silhouette, since the unit behind it takes no damage.
    private hoverObstacleHighlight?: Graphics;
    public highlightObstacle(position: HoCMath.XY, cellSize: number, subtleInteractive = false): void {
        this.highlightObstacles([position], cellSize, subtleInteractive);
    }
    public highlightObstacles(positions: readonly HoCMath.XY[], cellSize: number, subtleInteractive = false): void {
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
        if (subtleInteractive) {
            const pulse = 0.5 + 0.5 * Math.sin(this.hoverGlowPhase * 2.2);
            const inset = cellSize * (0.09 - pulse * 0.018);
            // Animated white focus brackets stay readable on every tombstone texture without tinting
            // the art. A soft outer trace breathes around a crisp inner rim, so crossed obstacles read
            // as interactive trajectory hits rather than enemy targets or selected board cells.
            for (const position of positions) {
                const points = projectedRectPoints(
                    position.x - cellSize * 0.5 + inset,
                    position.y - cellSize * 0.5 + inset,
                    position.x + cellSize * 0.5 - inset,
                    position.y + cellSize * 0.5 - inset,
                    this.context.sceneSettings.getGridSettings(),
                );
                g.poly(points).stroke({ width: 5 + pulse * 2, color: 0xffffff, alpha: 0.08 + pulse * 0.12 });
                g.poly(points).stroke({
                    width: 1.5 + pulse * 0.7,
                    color: 0xffffff,
                    alpha: 0.72 + pulse * 0.25,
                });
            }
            return;
        }
        for (const position of positions) {
            const outer = projectedRectPoints(
                position.x - cellSize * 0.48,
                position.y - cellSize * 0.48,
                position.x + cellSize * 0.48,
                position.y + cellSize * 0.48,
                this.context.sceneSettings.getGridSettings(),
            );
            const inner = projectedRectPoints(
                position.x - cellSize * 0.42,
                position.y - cellSize * 0.42,
                position.x + cellSize * 0.42,
                position.y + cellSize * 0.42,
                this.context.sceneSettings.getGridSettings(),
            );
            g.poly(outer).fill({ color: 0xaa0000, alpha: 0.22 });
            g.poly(inner).fill({ color: 0xff2a2a, alpha: 0.3 });
            g.poly(inner).stroke({ width: 3, color: 0xff4444, alpha: 0.85 });
        }
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
        beamStyle: "positive" | "negative";
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
            const negative = opts.beamStyle === "negative";
            const glowColor = negative ? 0x9e1308 : 0x00a94f;
            const midColor = negative ? 0xff3b12 : 0x18e875;
            const coreColor = negative ? 0xffc04a : 0xbaffd2;

            // Variant 1: a narrow luminous core, broad magical glow and a sharp arcane spearhead.
            g.moveTo(fx, fy).lineTo(tx, ty).stroke({ width: 20, color: glowColor, alpha: 0.16 });
            g.moveTo(fx, fy).lineTo(tx, ty).stroke({ width: 9, color: midColor, alpha: 0.38 });
            g.moveTo(fx, fy).lineTo(tx, ty).stroke({ width: 3, color: coreColor, alpha: 0.95 });

            const dx = tx - fx;
            const dy = ty - fy;
            const length = Math.max(1, Math.hypot(dx, dy));
            const nx = -dy / length;
            const ny = dx / length;
            for (let i = 1; i <= 6; i++) {
                const t = i / 8;
                const wave = Math.sin(i * 2.35) * (negative ? 8 : 5);
                const px = fx + dx * t + nx * wave;
                const py = fy + dy * t + ny * wave;
                const runeSize = negative ? 4 + (i % 2) : 3 + (i % 2);
                if (negative) {
                    // Ember tongues trail off the fiery red beam.
                    g.moveTo(px - nx * runeSize, py - ny * runeSize)
                        .quadraticCurveTo(
                            px + nx * runeSize * 2.5 - (dx / length) * 5,
                            py + ny * runeSize * 2.5 - (dy / length) * 5,
                            px + nx * runeSize * 0.6,
                            py + ny * runeSize * 0.6,
                        )
                        .stroke({ width: 2, color: i % 2 ? 0xff6a18 : 0xffc13b, alpha: 0.72 });
                } else {
                    // Small diamond runes keep the green beam magical without obscuring the board.
                    g.poly([px, py - runeSize, px + runeSize, py, px, py + runeSize, px - runeSize, py]).stroke({
                        width: 1.5,
                        color: coreColor,
                        alpha: 0.72,
                    });
                }
            }

            const hl = 28;
            const hw = 12;
            const ux = Math.cos(angle);
            const uy = Math.sin(angle);
            const bx = tx - ux * hl;
            const by = ty - uy * hl;
            g.poly([tx, ty, bx + nx * hw, by + ny * hw, bx + ux * 7, by + uy * 7, bx - nx * hw, by - ny * hw])
                .fill({ color: midColor, alpha: 0.28 })
                .stroke({ width: 3, color: coreColor, alpha: 1 });
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
                    fontFamily: HOC_NUMERIC_ARIAL_FONT_FAMILY,
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
            if (this.hoverRangedArrowHead) this.hoverRangedArrowHead.visible = false;
        }
        if (this.hoverAttackSword && !this.hoverAttackFromCell) {
            this.hoverAttackSword.visible = false;
        }

        // 1. If we have an attack-from cell, we behave differently:
        if (this.hoverAttackFromCell && selected) {
            this.hoverBattlefieldFootprintCells = combatFootprintCellsForBase(
                this.hoverAttackFromCell,
                footprintWidthOf(selected),
                footprintHeightOf(selected),
            );
            // We force red tint for attack
            this.ensureHoverSilhouetteParams(selected, boundsCenter, true);
            return;
        }

        this.hoverBattlefieldFootprintCells = undefined;

        if (!selected || this.hoverSelectedCellsSwitchToRed || !this.hoverSelectedCells?.length) {
            this.clearHoverSilhouette();
            return;
        }

        this.ensureHoverSilhouetteParams(selected, boundsCenter, false);
    }
    private ensureHoverSilhouetteParams(
        selected: UnitProperties,
        boundsCenter: HoCMath.XY,
        isAttack: boolean,
        previewUnit?: Unit,
        exactPlacementCopy = false,
    ): void {
        const outlineGrowth = exactPlacementCopy ? 1 : 1.06;
        const livePreview = this.getLiveUnitPreview(selected, boundsCenter, previewUnit);
        const texName = unitToTextureName(
            selected.name,
            TextureType.SMALL,
            footprintWidthOf(selected),
            footprintHeightOf(selected),
        );
        const tex = livePreview?.texture ?? this.context.texAny(texName);
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
        const cellSize = this.context.sceneSettings.getGridSettings().getCellSize();
        if (livePreview) {
            this.applyLiveUnitPreview(sprite, outline, livePreview, outlineGrowth);
        } else {
            const projectedCenter = projectBattlefieldPoint(boundsCenter, this.context.sceneSettings.getGridSettings());
            const scale = unitPreviewScale(selected, tex, cellSize);
            const outlineScale = scale * outlineGrowth;
            sprite.anchor.set(0.5);
            outline.anchor.set(0.5);
            sprite.scale.set(scale, -scale);
            outline.scale.set(outlineScale, -outlineScale);
            // Placement is a face-off: the silhouette mirrors like the unit it previews — red/UPPER
            // looks left toward green. Without this the drag preview on the right flank faced
            // off-board (live report). The live-preview branch above copies the real unit's facing.
            {
                const facing = placementFacingDirectionForTeam(selected.team);
                sprite.scale.x *= facing;
                outline.scale.x *= facing;
            }
            sprite.x = projectedCenter.x;
            sprite.y = unitPreviewY(selected, projectedCenter.y, cellSize);
            outline.x = projectedCenter.x;
            outline.y = sprite.y;
            sprite.rotation = 0;
            outline.rotation = 0;
        }
        outline.visible = true;
        // With identical placement scales the white backing sits inside the live-sized silhouette rather
        // than enlarging it. Let a little more of it show through the black layer so the copy remains
        // readable after it leaves the source, while the live unit fully occludes it at the start point.
        outline.alpha = exactPlacementCopy ? 0.72 : 0.9;
        outline.tint = 0xffffff;
        sprite.visible = true;
        sprite.alpha = exactPlacementCopy ? 0.58 : 0.8;

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
        const livePreview = this.getLiveUnitPreview(props, position);
        const texName = unitToTextureName(
            props.name,
            TextureType.SMALL,
            footprintWidthOf(props),
            footprintHeightOf(props),
        );
        const tex = livePreview?.texture ?? this.context.texAny(texName);
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
        const cellSize = this.context.sceneSettings.getGridSettings().getCellSize();
        if (livePreview) {
            this.applyLiveUnitPreview(sprite, outline, livePreview);
        } else {
            const projectedCenter = projectBattlefieldPoint(position, this.context.sceneSettings.getGridSettings());
            const scale = unitPreviewScale(props, tex, cellSize);
            const outlineScale = scale * 1.06;
            const intentFacing = placementFacingDirectionForTeam(props.team);
            sprite.anchor.set(0.5);
            outline.anchor.set(0.5);
            sprite.scale.set(scale * intentFacing, -scale);
            outline.scale.set(outlineScale * intentFacing, -outlineScale);
            sprite.x = projectedCenter.x;
            sprite.y = unitPreviewY(props, projectedCenter.y, cellSize);
            outline.x = projectedCenter.x;
            outline.y = sprite.y;
            sprite.rotation = 0;
            outline.rotation = 0;
        }
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
        const texName = unitToTextureName(
            props.name,
            TextureType.SMALL,
            footprintWidthOf(props),
            footprintHeightOf(props),
        );
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
        const cellSize = this.context.sceneSettings.getGridSettings().getCellSize();
        const baseScale = unitPreviewScale(props, tex, cellSize);
        const scale = baseScale * this.boardHoverScale;
        const outlineScale = scale * 1.08;
        const y = unitPreviewY(props, center.y, cellSize) + this.boardHoverYOffset;
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

        let centerPos: HoCMath.XY;
        let footprintCells: HoCMath.XY[];

        if (occupiesManyCells(props)) {
            const candidate = this.findLargeUnitMoveCandidate(cell);
            if (!candidate) {
                this.clearHoverSilhouette();
                return;
            }
            // The ghost stands on the centre of the landing rectangle. Any rectangle resolves, so there is
            // no shape here that can leave the preview without a position.
            footprintCells = candidate;
            centerPos = GridMath.getPositionForFootprintAnchor(
                gs,
                GridMath.getFootprintAnchorForCells(candidate) ?? cell,
                footprintWidthOf(props),
                footprintHeightOf(props),
            );
        } else {
            if (!this.isCellReachableForActiveUnit(cell)) {
                this.clearHoverSilhouette();
                return;
            }
            footprintCells = [cell];
            centerPos = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        }

        this.hoverBattlefieldFootprintCells = footprintCells;
        this.ensureHoverSilhouetteParams(props, centerPos, false);
    }
    public updateHoverPlacementCell(worldPos: HoCMath.XY): void {
        const gs = this.context.sceneSettings.getGridSettings();
        // Sandbox stores the pointer in logical board coordinates. Re-unprojecting an already logical
        // point shifts the chosen cell a second time and makes the ghost land beside the cursor.
        const logicalWorldPos = worldPos;
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

        const cell = GridMath.getCellForPosition(gs, logicalWorldPos);
        this.clearAuraVisuals();
        if (!cell) {
            this.clearHoverSilhouette();
            return;
        }

        const isLarge = occupiesManyCells(selected);
        const cellHash = (cell.x << 4) | cell.y;

        let teamFromPlacement: TeamType | undefined;
        if (this.context.placementManager.getAllowedPlacementCellHashesForTeam(TeamVals.LOWER)?.has(cellHash)) {
            teamFromPlacement = TeamVals.LOWER;
        } else if (this.context.placementManager.getAllowedPlacementCellHashesForTeam(TeamVals.UPPER)?.has(cellHash)) {
            teamFromPlacement = TeamVals.UPPER;
        }

        const draggingUnitTeam = this.context.getDraggingUnitTeam();
        const draggingUnitId = this.context.getDraggingUnitId();

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

            // Let the square finder skip terrain and other stacks while still allowing a dragged 2x2
            // creature to overlap its own current footprint. Previously this list was always empty, so
            // hovering beside lava/another unit selected the blocked square first and made otherwise
            // available placement cells impossible to use.
            const draggedUnit = draggingUnitId ? this.context.unitsHolder.getAllUnits().get(draggingUnitId) : undefined;
            const ownCells = draggedUnit?.getCells();
            const occupiedKeys: string[] = [];
            for (let x = 0; x < gs.getGridSize(); x += 1) {
                for (let y = 0; y < gs.getGridSize(); y += 1) {
                    const occupantId = this.context.grid.getOccupantUnitId({ x, y });
                    if (occupantId && occupantId !== draggingUnitId) occupiedKeys.push(`${x}:${y}`);
                }
            }
            const ownKeys = new Set(ownCells?.map((own) => `${own.x}:${own.y}`) ?? []);
            const blocked = new Set(occupiedKeys);
            const width = footprintWidthOf(selected);
            const height = footprintHeightOf(selected);
            // Every W x H block that covers the cursor cell, in the same order the move-candidate finder
            // uses: cursor cell as the block's minimum corner first, then the block sliding down and left
            // over it. Off-board anchors are dropped before any cell is hashed, since an out-of-grid cell
            // packs into (x << 4) | y as a key that collides with a real one.
            const footprints: HoCMath.XY[][] = [];
            for (let cursorDx = 0; cursorDx < width; cursorDx++) {
                for (let cursorDy = 0; cursorDy < height; cursorDy++) {
                    const anchor = { x: cell.x - cursorDx + width - 1, y: cell.y - cursorDy + height - 1 };
                    if (!GridMath.isFootprintWithinGrid(gs, anchor, width, height)) continue;
                    const footprint: HoCMath.XY[] = [];
                    for (let dx = 0; dx < width; dx++) {
                        for (let dy = 0; dy < height; dy++) {
                            footprint.push({ x: anchor.x - width + 1 + dx, y: anchor.y - height + 1 + dy });
                        }
                    }
                    footprints.push(footprint);
                }
            }
            candidateCells =
                footprints.find((footprint) =>
                    footprint.every(
                        (candidate) =>
                            allowedForPath?.has((candidate.x << 4) | candidate.y) &&
                            (!blocked.has(`${candidate.x}:${candidate.y}`) ||
                                ownKeys.has(`${candidate.x}:${candidate.y}`)),
                    ),
                ) ?? [];

            // Fallback if pathing fails (e.g. void): just use the cell under mouse
            if (candidateCells.length === 0) {
                candidateCells = [cell];
            }
        } else {
            candidateCells = [cell];
        }

        // --- 2. (Removed) Aura & attack-range preview for the unplaced selection ---
        // Selecting a unit for placement (sandbox UnitsOverlay / ranked bench) used to project its
        // aura square + range circle at the candidate drop cell via a mock unit. Range visuals are
        // now reserved for units actually PLACED on the board (hovered/selected board units); the
        // cursor-following placement preview shows only the silhouette + placement square.

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
            const width = footprintWidthOf(selected);
            const height = footprintHeightOf(selected);
            if (candidateCells.length !== width * height) {
                // The fallback above degrades to the single cell under the cursor when no whole block
                // fits, and a partial body is never placeable.
                invalid = true;
            } else if (!this.context.pathHelper.areCellsFormingFootprint(candidateCells, width, height)) {
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

        // Check 4: Occupied by another stack or terrain (that isn't the dragged unit itself).
        // The old check ignored terrain ids such as lava/water/mountains because they aren't in
        // UnitsHolder. That painted a green valid preview which the grid then rejected on click.
        if (!invalid) {
            for (const c of candidateCells) {
                const occId = this.context.grid.getOccupantUnitId(c);
                if (occId && occId !== draggingUnitId) {
                    invalid = true;
                    break;
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
            const logicalCenter = GridMath.getPositionForCells(gs, candidateCells);
            if (logicalCenter) {
                // Placement has no combat-active unit. Use the actual selected board/bench instance so
                // the preview clones its refreshed idle frame and framing instead of the legacy portrait.
                this.ensureHoverSilhouetteParams(
                    selected,
                    logicalCenter,
                    false,
                    this.context.getPlacementPreviewUnit(),
                    // Placement is a literal copy of the live creature. Growing the white backing sprite
                    // made the combined preview look larger than the unit and exposed it while both were
                    // at the same cell. Keep both layers at the exact live scale.
                    true,
                );
            }
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
