import { Container, Graphics, Matrix, Sprite, Texture } from "pixi.js";
import { FightProperties, FightStateManager, GridSettings, HoCMath, TeamType } from "@heroesofcrypto/common";

/**
 * The aura rings a unit should DISPLAY: real auras only, each widened by the team's "+N aura range"
 * synergy. aura_ranges is ABILITY-aligned — non-aura abilities carry 0 — so the zero entries must be
 * dropped BEFORE the bonus is added. Adding first turned every 0 into the bonus and painted a phantom
 * aura ring on every ability of every unit the moment the Might aura-range synergy was picked (live
 * report 2026-08-02); the mirror mistake — never adding the bonus — drew real auras one cell too small.
 */
export const visibleAuraRanges = (
    ranges: readonly number[] | undefined,
    isBuff: readonly boolean[] | undefined,
    bonus: number,
    target: { range: number; isBuff: boolean }[] = [],
): { range: number; isBuff: boolean }[] => {
    const configuredRanges = ranges ?? [];
    let visibleCount = 0;
    for (let index = 0; index < configuredRanges.length; index += 1) {
        const range = configuredRanges[index];
        if (range <= 0) continue;
        const visible = (target[visibleCount] ??= { range: 0, isBuff: true });
        visible.range = range + bonus;
        visible.isBuff = isBuff && index < isBuff.length ? isBuff[index] : true;
        visibleCount += 1;
    }
    target.length = visibleCount;
    return target;
};
import { HoverManager } from "./HoverManager";
import { PlacementManager } from "./PlacementManager";
import { RenderableUnit } from "./RenderableUnit";
import { placementZonePolygon } from "@/pixi/PixiDrawablePlacement";
import { projectedPolyline, projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";
import { drawMovementArea, drawMovementAreaCalibration, ENEMY_MOVEMENT_HIGHLIGHT_COLOR } from "./movementAreaVisual";
export { movementFillAlphaForPhase } from "./movementAreaVisual";

/**
 * Red used across the board to signal "it is the enemy's turn" in ranked play — the active-unit
 * aura, the movement highlight, and the board-edge glow all share this color for a consistent cue.
 */
export const ENEMY_TURN_HIGHLIGHT_COLOR = 0xff3636;
const ALLY_MOVEMENT_INSPECTION_COLOR = 0xc08a45;
/** Neutral cold-steel treatment selected for the active/shift-selected shooting range. */
export const SHOT_RANGE_COLOR = 0xaeb9bd;
export const ALLY_HOVERED_SHOT_RANGE_COLOR = 0x35df72;
export const ENEMY_HOVERED_SHOT_RANGE_COLOR = 0xff3b3b;

export const hoveredShotRangeColor = (isEnemy: boolean): number =>
    isEnemy ? ENEMY_HOVERED_SHOT_RANGE_COLOR : ALLY_HOVERED_SHOT_RANGE_COLOR;

const shotRangeCornerTextureForColor = (
    color: number,
    neutral?: Texture,
    friendly?: Texture,
    enemy?: Texture,
): Texture | undefined =>
    color === ALLY_HOVERED_SHOT_RANGE_COLOR
        ? (friendly ?? neutral)
        : color === ENEMY_HOVERED_SHOT_RANGE_COLOR
          ? (enemy ?? neutral)
          : neutral;

const sameShotRangeOverlay = (a: ShotRangeOverlay, b: ShotRangeOverlay): boolean =>
    a.xy.x === b.xy.x &&
    a.xy.y === b.xy.y &&
    a.distance === b.distance &&
    (a.verticalDistance ?? a.distance) === (b.verticalDistance ?? b.distance) &&
    (a.color ?? SHOT_RANGE_COLOR) === (b.color ?? SHOT_RANGE_COLOR);

const movementCellKey = (cell: HoCMath.XY): number => (cell.x << 8) | cell.y;

/** Reachable destinations never repaint the cells already occupied by the creature whose turn it is. */
export const movementCellsOutsideUnitFootprint = (
    reachable: readonly HoCMath.XY[],
    occupied: readonly HoCMath.XY[],
    target: HoCMath.XY[] = [],
): HoCMath.XY[] => {
    target.length = 0;
    for (const cell of reachable) {
        const key = movementCellKey(cell);
        let isOccupied = false;
        for (const occupiedCell of occupied) {
            if (movementCellKey(occupiedCell) === key) {
                isOccupied = true;
                break;
            }
        }
        if (!isOccupied) target.push(cell);
    }
    return target;
};

export interface ShotRangeBounds {
    left: number;
    bottom: number;
    width: number;
    height: number;
}

/**
 * A ranged creature may occupy a rectangular footprint (Centaur is 2x1), so the visible full-damage
 * boundary needs independent horizontal and vertical half-extents. Square units omit verticalDistance
 * to keep the long-standing overlay shape backwards-compatible.
 */
export interface ShotRangeOverlay {
    xy: HoCMath.XY;
    distance: number;
    verticalDistance?: number;
    /** Hover-only relationship cue. Active and shift-selected ranges keep the neutral cold-steel default. */
    color?: number;
}

export const SHOT_RANGE_LINE_WIDTH_CELLS = 0.011;
/** The authored bitmap occupies almost the full square; keep the visible ornament compact at the frame corners. */
export const SHOT_RANGE_CORNER_SPRITE_SIZE_CELLS = 0.37536 * 1.15;
/** Centre lines of the authored vertical/horizontal rails (normalised texture coordinates). */
export const SHOT_RANGE_CORNER_SPRITE_ANCHOR = { x: 0.137, y: 0.891 } as const;
/** Each shared source needs its downsampling setup once, before its next GPU upload. */
const stableShotRangeCornerSources = new WeakSet<object>();

export interface ShotRangeCornerSpritePlacement {
    xy: HoCMath.XY;
    horizontal: HoCMath.XY;
    vertical: HoCMath.XY;
}

/** Scene-owned ornament pool reused while animated range frames repaint. */
export interface ShotRangeCornerSpritePool {
    sprites: Sprite[];
    matrices: Matrix[];
    placements: ShotRangeCornerSpritePlacement[];
    used: number;
}

const setShotRangeCornerPlacement = (
    target: ShotRangeCornerSpritePlacement[],
    index: number,
    x: number,
    y: number,
    horizontalX: number,
    horizontalY: number,
    verticalX: number,
    verticalY: number,
): void => {
    const placement = (target[index] ??= {
        xy: { x: 0, y: 0 },
        horizontal: { x: 0, y: 0 },
        vertical: { x: 0, y: 0 },
    });
    placement.xy.x = x;
    placement.xy.y = y;
    placement.horizontal.x = horizontalX;
    placement.horizontal.y = horizontalY;
    placement.vertical.x = verticalX;
    placement.vertical.y = verticalY;
};

/**
 * The source bitmap is authored as the bottom-left corner: its arms run up/right and its layered arrow
 * points into the advertised full-damage area. The direction vectors let the art follow the projected
 * battlefield seams instead of assuming that every visible corner remains a perfect 90-degree angle.
 */
export function shotRangeCornerSpritePlacements(
    bounds: ShotRangeBounds,
    target: ShotRangeCornerSpritePlacement[] = [],
): ShotRangeCornerSpritePlacement[] {
    const right = bounds.left + bounds.width;
    const top = bounds.bottom + bounds.height;
    setShotRangeCornerPlacement(target, 0, bounds.left, bounds.bottom, 1, 0, 0, 1);
    setShotRangeCornerPlacement(target, 1, right, bounds.bottom, -1, 0, 0, 1);
    setShotRangeCornerPlacement(target, 2, right, top, -1, 0, 0, -1);
    setShotRangeCornerPlacement(target, 3, bounds.left, top, 1, 0, 0, -1);
    target.length = 4;
    return target;
}

/**
 * Maps the two authored corner rails directly onto the two locally projected perimeter directions.
 * The resulting affine transform also handles the non-right angles on the slanted battlefield sides.
 */
export function shotRangeCornerSpriteMatrix(
    placement: ShotRangeCornerSpritePlacement,
    spriteScale: number,
    cellSize: number,
    gs: GridSettings,
    target = new Matrix(),
): Matrix {
    const projectedDirection = (direction: HoCMath.XY): HoCMath.XY => {
        const points = projectedPolyline(
            [
                placement.xy,
                {
                    x: placement.xy.x + direction.x * cellSize,
                    y: placement.xy.y + direction.y * cellSize,
                },
            ],
            gs,
        );
        const x = points[points.length - 2] - points[0];
        const y = points[points.length - 1] - points[1];
        const length = Math.max(1e-6, Math.hypot(x, y));
        return { x: x / length, y: y / length };
    };
    const horizontal = projectedDirection(placement.horizontal);
    const vertical = projectedDirection(placement.vertical);
    const [x, y] = projectedPolyline([placement.xy], gs);

    // The authored vertical rail extends toward negative texture Y, hence the negated second basis column.
    return target.set(
        horizontal.x * spriteScale,
        horizontal.y * spriteScale,
        -vertical.x * spriteScale,
        -vertical.y * spriteScale,
        x,
        y,
    );
}

/**
 * The owner's body, in cells, for overlays that grow out of it. Both sides are needed because an aura
 * square hugs the footprint: it reaches half a cell past a side of 1 and a whole cell past a side of 2,
 * and only a square body makes those two the same number.
 */
export interface IFootprintExtent {
    width: number;
    height: number;
}

export interface ILingeringTrack {
    x: number;
    y: number;
    radius: number;
    life: number;
    maxLife: number;
    phase: number;
    team: TeamType;
    /** Flying units kick up wind instead of ground dust. */
    flying: boolean;
    /** Normalized movement direction at the moment this track was dropped. */
    dirX: number;
    dirY: number;
    cellSize: number;
}

export interface IGameplayDrawContext {
    fightProps: FightProperties;
    currentActiveShotRange?: ShotRangeOverlay;
    shiftSelectedShotRange?: ShotRangeOverlay; // [NEW] Shift-click range
    hoveredShotRange?: ShotRangeOverlay;
    isActiveUnitMoving: boolean;
    gridSettings: GridSettings;
    hoverGlowPhase: number;
    currentActivePath?: HoCMath.XY[];
    sc_isAnimating: boolean;
    currentActiveUnit?: RenderableUnit;
    hoverManager: HoverManager;
    sidebarUnitRanges?: {
        xy: HoCMath.XY;
        attackRange: number; // World distance radius
        auraRanges: { range: number; isBuff: boolean }[]; // Range in cells
        footprint: IFootprintExtent;
    };
    hoveredAuraRanges?: {
        xy: HoCMath.XY;
        auraRanges: { range: number; isBuff: boolean }[];
        footprint: IFootprintExtent;
    };
    lingeringTracks: ILingeringTrack[];
    hoveredMoveRange?: HoCMath.XY[];
    /** Fight-phase: reachable cells of the unit under the cursor, drawn as larger rings than the
     *  active unit's own path (currentActivePath) so the inspection overlay reads separately. */
    hoveredUnitMoveRange?: HoCMath.XY[];
    // True when hoveredUnitMoveRange belongs to an ENEMY of the active unit — only then do the
    // active unit's own move dots switch to the light-orange threat cue (allies aren't a threat).
    hoveredUnitMoveRangeIsEnemy?: boolean;
    /**
     * Ranked play: true while the active unit belongs to the viewer's enemy. Tints the movement
     * highlight red and draws a glowing red border around the board to signal it is not your turn.
     */
    enemyTurnView?: boolean;
    /**
     * Ground-level destination cells can be drawn separately from rings and targeting previews. This lets
     * tall terrain (tombstones, mountains) occlude the cell sheet while shot lines remain above terrain.
     */
    movementGraphics?: Graphics;
    /** Bitmap ornaments live beside Graphics because Pixi v8 deprecates DisplayObject children on Graphics. */
    shotRangeCornerContainer?: Container;
    shotRangeCornerPool?: ShotRangeCornerSpritePool;
    /** Legacy neutral-steel corner used only for neutral/shift-selected frames. */
    shotRangeCornerTexture?: Texture;
    /** High-resolution relationship-coloured corners; these are already authored in their final hue. */
    shotRangeCornerFriendlyTexture?: Texture;
    shotRangeCornerEnemyTexture?: Texture;
    /** Scene-owned buffers keep animated range redraws from producing garbage every frame. */
    activeAuraRangesScratch?: { range: number; isBuff: boolean }[];
    movementCellsScratch?: HoCMath.XY[];
}

export interface IPlacementDrawContext {
    fightProps: FightProperties;
    placementManager: PlacementManager;
    hoverManager: HoverManager;
    placementGraphics?: Graphics;
    placementFrameContainer?: Container;
    /**
     * When set, only this team's placement zone is drawn. Ranked play uses it so the viewer
     * never sees the opponent's placement area — revealed enemy units are shown there instead.
     */
    restrictToTeam?: TeamType;
    /**
     * Footprints of the units already standing on the board, grid-confirmed by the caller. Drawn as a
     * pale wash so the free ground in a deployment zone reads at a glance — the tall silhouettes cover
     * far more board than the cells they actually hold, which makes "what is still free" guesswork
     * without it. Empty/omitted draws nothing.
     */
    occupiedFootprints?: readonly (readonly HoCMath.XY[])[];
    /** Grid settings for the occupied-cell wash (the polygons are perspective-projected). */
    gridSettings?: GridSettings;
    /**
     * Visual-only switch for the red/green deployment fields. Placement rules and hover validation
     * remain active when this is false, so the zones can be restored without changing game logic.
     */
    showTeamPlacementZones?: boolean;
}

export class SandboxDrawer {
    public static drawGameplayVisuals(g: Graphics, ctx: IGameplayDrawContext): void {
        const {
            fightProps,
            currentActiveShotRange,
            shiftSelectedShotRange,
            hoveredShotRange,
            isActiveUnitMoving,
            gridSettings: gs,
            hoverGlowPhase,
            currentActivePath,
            sc_isAnimating,
            currentActiveUnit,
            sidebarUnitRanges,
            hoveredAuraRanges,
            hoveredUnitMoveRange,
            shotRangeCornerContainer,
            shotRangeCornerPool,
            shotRangeCornerTexture,
            shotRangeCornerFriendlyTexture,
            shotRangeCornerEnemyTexture,
        } = ctx;
        const fightStarted = fightProps.hasFightStarted();
        const movementGraphics = ctx.movementGraphics ?? g;
        // The unit whose turn is active always receives a neutral white movement preview. Team colours are
        // reserved for placement zones and hovered-unit inspection, so overlapping aura/team overlays stay legible.
        const movementColor = 0xffffff;
        // The board no longer gets a red frame on the enemy's turn — the turn card already says "Enemy
        // turn" in red, and the frame fought with the board art. The red movement highlight above still
        // carries the cue on the board itself.

        // 0. Placement/sandbox movement preview uses the same continuous sheet as live combat. Keeping
        // this on a separate dot renderer made the sandbox look like a different rules/UI mode.
        if (ctx.hoveredMoveRange && ctx.hoveredMoveRange.length > 0) {
            drawMovementArea(movementGraphics, ctx.hoveredMoveRange, gs, movementColor, hoverGlowPhase);
        }

        // The editor paints the two complete rows even without a selected unit, making the precise projected
        // fill bounds visible while their top edges are dragged by hand.
        drawMovementAreaCalibration(movementGraphics, gs);

        // 0.5 Sidebar Unit Range (New Feature)
        if (sidebarUnitRanges) {
            const { xy, attackRange, auraRanges, footprint } = sidebarUnitRanges;
            SandboxDrawer.drawAuraAndAttackRanges(g, xy, attackRange, auraRanges, footprint, gs, hoverGlowPhase, 0.7);
        }

        // 0.51 Hovered Aura Ranges
        if (hoveredAuraRanges) {
            const { xy, auraRanges, footprint } = hoveredAuraRanges;
            SandboxDrawer.drawAuraAndAttackRanges(g, xy, 0, auraRanges, footprint, gs, hoverGlowPhase, 0.7);
        }

        // 0.6 Active Unit Aura Range (Requested Feature)
        if (currentActiveUnit && !isActiveUnitMoving) {
            const auraRanges = visibleAuraRanges(
                currentActiveUnit.getAuraRanges(),
                currentActiveUnit.getAuraIsBuff(),
                FightStateManager.getInstance()
                    .getFightProperties()
                    .getAdditionalAuraRangePerTeam(currentActiveUnit.getTeam()),
                ctx.activeAuraRangesScratch,
            );
            if (auraRanges.length > 0) {
                // The range drawer performs the battlefield projection itself. Passing the sprite's
                // already projected centre here bent the active aura a second time.
                const xy = currentActiveUnit.getPosition();
                const footprint = {
                    width: currentActiveUnit.getFootprintWidth(),
                    height: currentActiveUnit.getFootprintHeight(),
                };
                // Draw only Aura ranges (skip attack range as it's handled elsewhere or we can add it if needed)
                SandboxDrawer.drawAuraAndAttackRanges(g, xy, 0, auraRanges, footprint, gs, hoverGlowPhase, 0.5);
            }
        }

        // 1. Shift Selected Shot Range (Same style as Active)
        if (shiftSelectedShotRange) {
            const { xy, distance, verticalDistance = distance } = shiftSelectedShotRange;
            SandboxDrawer.drawShotRangeSquare(
                g,
                xy,
                distance,
                verticalDistance,
                gs,
                hoverGlowPhase,
                SHOT_RANGE_COLOR,
                fightStarted,
                shotRangeCornerContainer,
                shotRangeCornerPool,
                shotRangeCornerTextureForColor(
                    SHOT_RANGE_COLOR,
                    shotRangeCornerTexture,
                    shotRangeCornerFriendlyTexture,
                    shotRangeCornerEnemyTexture,
                ),
            );
        }

        // 2. Shot range ring (Active Unit)
        if (currentActiveShotRange && !isActiveUnitMoving) {
            const { xy, distance, verticalDistance = distance, color = SHOT_RANGE_COLOR } = currentActiveShotRange;
            SandboxDrawer.drawShotRangeSquare(
                g,
                xy,
                distance,
                verticalDistance,
                gs,
                hoverGlowPhase,
                color,
                fightStarted,
                shotRangeCornerContainer,
                shotRangeCornerPool,
                shotRangeCornerTextureForColor(
                    color,
                    shotRangeCornerTexture,
                    shotRangeCornerFriendlyTexture,
                    shotRangeCornerEnemyTexture,
                ),
            );
        }

        // Hover inspection is the player's immediate focus. Paint it after the active unit's neutral range
        // so an enemy with identical bounds remains visibly red instead of being covered by the grey frame.
        if (
            hoveredShotRange &&
            (!fightStarted || !isActiveUnitMoving) &&
            (!currentActiveShotRange || !sameShotRangeOverlay(hoveredShotRange, currentActiveShotRange))
        ) {
            const { xy, distance, verticalDistance = distance, color = SHOT_RANGE_COLOR } = hoveredShotRange;
            SandboxDrawer.drawShotRangeSquare(
                g,
                xy,
                distance,
                verticalDistance,
                gs,
                hoverGlowPhase,
                color,
                fightStarted,
                shotRangeCornerContainer,
                shotRangeCornerPool,
                shotRangeCornerTextureForColor(
                    color,
                    shotRangeCornerTexture,
                    shotRangeCornerFriendlyTexture,
                    shotRangeCornerEnemyTexture,
                ),
            );
        }

        const hasHoveredMovement = !!hoveredUnitMoveRange?.length && !sc_isAnimating;

        // Enemy inspection stays underneath the active white cells, so it cannot recolour the current mover.
        if (hasHoveredMovement && ctx.hoveredUnitMoveRangeIsEnemy) {
            drawMovementArea(
                movementGraphics,
                hoveredUnitMoveRange!,
                gs,
                ENEMY_MOVEMENT_HIGHLIGHT_COLOR,
                hoverGlowPhase,
            );
        }

        // White is the authoritative "unit whose turn it is" colour over enemy inspection.
        if (currentActivePath && currentActiveUnit && !sc_isAnimating) {
            drawMovementArea(
                movementGraphics,
                movementCellsOutsideUnitFootprint(
                    currentActivePath,
                    currentActiveUnit.getCells(),
                    ctx.movementCellsScratch,
                ),
                gs,
                movementColor,
                hoverGlowPhase,
            );
        }

        // Ally inspection stays seamless, but uses an antique brown-gold wash so it cannot be mistaken for
        // the active unit's authoritative white movement range.
        if (hasHoveredMovement && !ctx.hoveredUnitMoveRangeIsEnemy) {
            drawMovementArea(
                movementGraphics,
                hoveredUnitMoveRange!,
                gs,
                ALLY_MOVEMENT_INSPECTION_COLOR,
                hoverGlowPhase,
                2,
            );
        }

        // The silhouette shows the creature, while these cells show the exact board footprint it will
        // occupy after a move or a melee approach. This is especially important for 2x2 creatures.
        ctx.hoverManager.drawHoverBattlefieldFootprint(g);

        // 3. Active unit indication is the pulsing light-wave aura rendered on the unit itself
        //    (see RenderableUnit.updateActiveAura) — no separate highlight glow here.

        // 4. Lingering tracks (movement smoke) are now rendered by SmokeLayer, which runs an fBM
        //    shader over its own dust layer — see scenes/sandbox/SmokeLayer.ts.
    }
    public static drawPlacements(ctx: IPlacementDrawContext): void {
        const {
            fightProps,
            placementManager,
            hoverManager,
            placementGraphics,
            placementFrameContainer,
            restrictToTeam,
            showTeamPlacementZones = true,
        } = ctx;
        if (!placementGraphics || !placementFrameContainer) return;
        const g = placementGraphics;
        g.clear();
        // Remove transient 9-slice frames together with the glow geometry so a hidden or resized
        // deployment zone can never leave stale light on the board. Frames live in a Container because
        // Pixi v8 deprecates adding display-object children directly to Graphics.
        placementFrameContainer.removeChildren();
        if (!fightProps.hasFightStarted()) {
            if (showTeamPlacementZones) {
                placementManager.draw(g, placementFrameContainer, restrictToTeam);
            }
            // Under the zones and under the hover preview: an occupied-ground wash must never outrank
            // the cell the player is about to click, and the hover's own footprint reads on top of it.
            SandboxDrawer.drawOccupiedFootprints(g, ctx.occupiedFootprints, ctx.gridSettings);
            hoverManager.drawHoverPlacementCell(g);
        }
    }
    /**
     * Pale white ground under every unit already standing on the board, one rounded shape per FOOTPRINT
     * (so a 2x1 reads as one body, not two tiles — the same treatment the hover preview uses). Purely
     * informational: it answers "which cells are still free" during deployment, which the drawn
     * silhouettes actively obscure by covering more board than they occupy.
     */
    private static drawOccupiedFootprints(
        g: Graphics,
        footprints: readonly (readonly HoCMath.XY[])[] | undefined,
        gs: GridSettings | undefined,
    ): void {
        if (!footprints?.length || !gs) return;
        const size = gs.getCellSize();
        for (const cells of footprints) {
            if (!cells.length) continue;
            g.poly(placementZonePolygon(cells, gs))
                .fill({ color: 0xffffff, alpha: 0.14 })
                .stroke({ width: Math.max(1, size * 0.02), color: 0xffffff, alpha: 0.4 });
        }
    }
    private static drawAuraAndAttackRanges(
        g: Graphics,
        xy: HoCMath.XY,
        attackRange: number,
        auraRanges: { range: number; isBuff: boolean }[],
        footprint: IFootprintExtent,
        gs: GridSettings,
        pulsePhase: number,
        alphaMultiplier = 1.0,
    ): void {
        // Shot reach of a unit selected in the sidebar.
        //
        // Drawn as a RECTANGLE, like the aura fields below and like the live shot-range bounds, because
        // reach on this board is measured in cells: a circle claims the diagonal corners are out of range
        // when they are not, and it was the last visual still speaking the pre-grid vocabulary — the
        // "thin cyan ring" that read as leftover next to everything else. Half-extents come off the
        // FOOTPRINT for the same reason the auras do: a 2x1 body measured from its centre would otherwise
        // advertise half a cell of reach it does not have on its short axis.
        if (attackRange > 0) {
            const cellSize = gs.getCellSize();
            const extentX = attackRange + (footprint.width / 2) * cellSize - cellSize * 0.055;
            const extentY = attackRange + (footprint.height / 2) * cellSize - cellSize * 0.055;
            g.poly(projectedRectPoints(xy.x - extentX, xy.y - extentY, xy.x + extentX, xy.y + extentY, gs)).stroke({
                width: 1.5,
                color: 0x00ffff,
                alpha: 0.5 * alphaMultiplier,
            });
        }

        // Aura ranges are soft energy fields. The edge stays slightly inside the outer grid separators,
        // while broad, fading square waves travel from the owner toward the aura's full reach.
        if (auraRanges && auraRanges.length > 0) {
            for (const aura of auraRanges) {
                const { range, isBuff } = aura;
                const color = isBuff ? 0x00ff00 : 0xff0000; // Green for Buff, Red for Debuff

                // Half-extent per axis: the aura reaches `range` cells out from the BODY, so each side of
                // the square starts half that axis' footprint away from the centre. The old single
                // `isSmall ? 0.5 : 1.0` is this formula for a square body; a 2x1 owner would otherwise
                // advertise a whole extra cell of reach above and below itself.
                const cellSize = gs.getCellSize();
                const extentX = (range + footprint.width / 2) * cellSize - cellSize * 0.055;
                const extentY = (range + footprint.height / 2) * cellSize - cellSize * 0.055;
                const feather = Math.min(cellSize * 0.28, Math.min(extentX, extentY) * 0.12);

                // Nested, very transparent sheets feather the edge instead of producing a hard rectangle.
                const featherLayers = 5;
                for (let layer = 0; layer < featherLayers; layer++) {
                    const inset = (feather * layer) / (featherLayers - 1);
                    const layerExtentX = extentX - inset;
                    const layerExtentY = extentY - inset;
                    const layerAlpha = (0.022 + layer * 0.006) * alphaMultiplier;
                    g.poly(
                        projectedRectPoints(
                            xy.x - layerExtentX,
                            xy.y - layerExtentY,
                            xy.x + layerExtentX,
                            xy.y + layerExtentY,
                            gs,
                        ),
                    ).fill({
                        color,
                        alpha: layerAlpha,
                    });
                }

                // Three wave fronts continuously leave the unit. They broaden and fade as they approach
                // the outer cells, giving the field a direction of energy rather than a static box border.
                const cycle = (((pulsePhase / (Math.PI * 2)) % 1) + 1) % 1;
                for (let waveIndex = 0; waveIndex < 3; waveIndex++) {
                    const progress = (cycle + waveIndex / 3) % 1;
                    const waveExtentX = Math.max(cellSize * 0.42, extentX * progress);
                    const waveExtentY = Math.max(cellSize * 0.42, extentY * progress);
                    const fade = Math.sin(progress * Math.PI);
                    g.poly(
                        projectedRectPoints(
                            xy.x - waveExtentX,
                            xy.y - waveExtentY,
                            xy.x + waveExtentX,
                            xy.y + waveExtentY,
                            gs,
                        ),
                    ).stroke({
                        width: Math.max(2, cellSize * (0.035 - progress * 0.012)),
                        color,
                        alpha: fade * 0.3 * alphaMultiplier,
                    });
                }
            }
        }
    }
    private static clampSquareToBoard(
        xy: HoCMath.XY,
        horizontalHalfExtent: number,
        verticalHalfExtent: number,
        gs: GridSettings,
    ): ShotRangeBounds | undefined {
        const left = Math.max(xy.x - horizontalHalfExtent, gs.getMinX());
        const right = Math.min(xy.x + horizontalHalfExtent, gs.getMaxX());
        const bottom = Math.max(xy.y - verticalHalfExtent, gs.getMinY());
        const top = Math.min(xy.y + verticalHalfExtent, gs.getMaxY());
        const width = right - left;
        const height = top - bottom;
        return width > 0 && height > 0 ? { left, bottom, width, height } : undefined;
    }
    private static drawShotRangeSquare(
        g: Graphics,
        xy: HoCMath.XY,
        horizontalHalfExtent: number,
        verticalHalfExtent: number,
        gs: GridSettings,
        _pulsePhase: number,
        color: number,
        _fightStarted: boolean,
        cornerContainer?: Container,
        cornerPool?: ShotRangeCornerSpritePool,
        cornerTexture?: Texture,
    ): void {
        const bounds = SandboxDrawer.clampSquareToBoard(xy, horizontalHalfExtent, verticalHalfExtent, gs);
        if (!bounds) return;
        const { left, bottom, width, height } = bounds;
        const cellSize = gs.getCellSize();
        const lineWidth = Math.max(1.15, cellSize * SHOT_RANGE_LINE_WIDTH_CELLS);
        const lineAlpha = 0.83;
        const cornerAlpha = 0.85;
        // One unbroken perimeter follows the hand-painted perspective seams exactly.
        // A single opaque rail keeps all four sides pixel-identical. The former dark bed + bright
        // highlight blended differently over light and dark floor tiles and read as dashes/tone shifts.
        g.poly(projectedRectPoints(left, bottom, left + width, bottom + height, gs)).stroke({
            width: lineWidth,
            color,
            alpha: lineAlpha,
            cap: "square",
            join: "miter",
        });

        if (cornerContainer && cornerTexture && cornerTexture !== Texture.EMPTY) {
            const source = cornerTexture.source;
            if (!stableShotRangeCornerSources.has(source)) {
                // The 512 px hammered-metal art is rendered at roughly 20-30 px. Mipmaps keep its tiny
                // highlights from alternating between bright and dark samples while the camera moves.
                source.scaleMode = "linear";
                source.autoGenerateMipmaps = true;
                source.unload();
                stableShotRangeCornerSources.add(source);
            }
            const spriteSize = cellSize * SHOT_RANGE_CORNER_SPRITE_SIZE_CELLS;
            const textureWidth = Math.max(1, cornerTexture.width);
            const scale = spriteSize / textureWidth;
            for (const placement of shotRangeCornerSpritePlacements(bounds, cornerPool?.placements)) {
                const cornerIndex = cornerPool?.used ?? 0;
                let corner = cornerPool?.sprites[cornerIndex];
                if (!corner || corner.destroyed) {
                    corner = new Sprite(cornerTexture);
                    corner.anchor.set(SHOT_RANGE_CORNER_SPRITE_ANCHOR.x, SHOT_RANGE_CORNER_SPRITE_ANCHOR.y);
                    corner.eventMode = "none";
                    // The projected corners are rotated/sheared. Pixel snapping makes their vertices jump by a
                    // whole screen pixel during small camera movements, which reads as a metallic shimmer.
                    corner.roundPixels = false;
                    if (cornerPool) cornerPool.sprites[cornerIndex] = corner;
                    cornerContainer.addChild(corner);
                } else {
                    corner.texture = cornerTexture;
                    corner.visible = true;
                }
                if (cornerPool) cornerPool.used += 1;
                const matrix = cornerPool ? (cornerPool.matrices[cornerIndex] ??= new Matrix()) : new Matrix();
                corner.setFromMatrix(shotRangeCornerSpriteMatrix(placement, scale, cellSize, gs, matrix));
                corner.alpha = cornerAlpha;
            }
        }
    }
}
