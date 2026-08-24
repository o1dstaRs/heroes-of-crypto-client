import { Container, Graphics } from "pixi.js";
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
): { range: number; isBuff: boolean }[] =>
    (ranges ?? [])
        .map((range, i) => ({ range, isBuff: isBuff && i < isBuff.length ? isBuff[i] : true }))
        .filter((aura) => aura.range > 0)
        .map((aura) => ({ range: aura.range + bonus, isBuff: aura.isBuff }));
import { HoverManager } from "./HoverManager";
import { PlacementManager } from "./PlacementManager";
import { RenderableUnit } from "./RenderableUnit";
import { projectedCellPoints, projectedPolyline, projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";

/**
 * Red used across the board to signal "it is the enemy's turn" in ranked play — the active-unit
 * aura, the movement highlight, and the board-edge glow all share this color for a consistent cue.
 */
export const ENEMY_TURN_HIGHLIGHT_COLOR = 0xff3636;
const ALLY_MOVEMENT_INSPECTION_COLOR = 0xc08a45;
const SHOT_RANGE_COLOR = 0xe7bc6a;

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
    currentActiveShotRange?: { xy: HoCMath.XY; distance: number };
    shiftSelectedShotRange?: { xy: HoCMath.XY; distance: number }; // [NEW] Shift-click range
    hoveredShotRange?: { xy: HoCMath.XY; distance: number };
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
            SandboxDrawer.drawMovementArea(movementGraphics, ctx.hoveredMoveRange, gs, movementColor, hoverGlowPhase);
        }

        // 0. Hovered Unit Range (New Feature - Unified Visuals)
        if (hoveredShotRange && (!fightStarted || !isActiveUnitMoving)) {
            const { xy, distance } = hoveredShotRange;
            // Use Yellow (same as Active) for consistent "Expected Range" visualization
            // even in placement mode.
            SandboxDrawer.drawShotRangeSquare(g, xy, distance, gs, hoverGlowPhase, SHOT_RANGE_COLOR, fightStarted);
        }

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
            const { xy, distance } = shiftSelectedShotRange;
            SandboxDrawer.drawShotRangeSquare(g, xy, distance, gs, hoverGlowPhase, SHOT_RANGE_COLOR, fightStarted);
        }

        // 2. Shot range ring (Active Unit)
        if (currentActiveShotRange && !isActiveUnitMoving) {
            const { xy, distance } = currentActiveShotRange;
            SandboxDrawer.drawShotRangeSquare(g, xy, distance, gs, hoverGlowPhase, SHOT_RANGE_COLOR, fightStarted);
        }

        const hasHoveredMovement = !!hoveredUnitMoveRange?.length && !sc_isAnimating;

        // Enemy inspection stays underneath the active white cells, so it cannot recolour the current mover.
        if (hasHoveredMovement && ctx.hoveredUnitMoveRangeIsEnemy) {
            SandboxDrawer.drawMovementArea(movementGraphics, hoveredUnitMoveRange!, gs, 0xff3b3b, hoverGlowPhase);
        }

        // White is the authoritative "unit whose turn it is" colour over enemy inspection.
        if (currentActivePath && currentActiveUnit && !sc_isAnimating) {
            SandboxDrawer.drawMovementArea(movementGraphics, currentActivePath, gs, movementColor, hoverGlowPhase);
        }

        // Ally inspection stays seamless, but uses an antique brown-gold wash so it cannot be mistaken for
        // the active unit's authoritative white movement range.
        if (hasHoveredMovement && !ctx.hoveredUnitMoveRangeIsEnemy) {
            SandboxDrawer.drawMovementArea(
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
            hoverManager.drawHoverPlacementCell(g);
        }
    }
    private static drawMovementArea(
        g: Graphics,
        cells: HoCMath.XY[],
        gs: GridSettings,
        color: number,
        phase: number,
        opacityScale = 1,
    ): void {
        if (!cells.length) return;
        const pulse = (Math.sin(phase * 0.65) + 1) * 0.5;
        // The board's own dark seams provide the cell boundaries. A moderately visible white wash
        // keeps the reachable area readable without bringing back the opaque grey outlined grid.
        const movementFillAlpha = 0.05 + pulse * 0.01;

        for (const cell of cells) {
            // Use the full projected cell so every movement edge sits on the painted stone seam.
            const polygon = projectedCellPoints(cell, gs);
            g.poly(polygon).fill({
                color,
                alpha: movementFillAlpha * opacityScale,
            });
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
        // Attack Range
        if (attackRange > 0) {
            // Style: Thin white/cyan ring, distinct from active unit
            SandboxDrawer.drawProjectedRing(g, xy, attackRange, gs, {
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
        halfExtent: number,
        gs: GridSettings,
    ): { left: number; bottom: number; width: number; height: number } | undefined {
        const left = Math.max(xy.x - halfExtent, gs.getMinX());
        const right = Math.min(xy.x + halfExtent, gs.getMaxX());
        const bottom = Math.max(xy.y - halfExtent, gs.getMinY());
        const top = Math.min(xy.y + halfExtent, gs.getMaxY());
        const width = right - left;
        const height = top - bottom;
        return width > 0 && height > 0 ? { left, bottom, width, height } : undefined;
    }
    private static drawShotRangeSquare(
        g: Graphics,
        xy: HoCMath.XY,
        halfExtent: number,
        gs: GridSettings,
        pulsePhase: number,
        color: number,
        fightStarted: boolean,
    ): void {
        const bounds = SandboxDrawer.clampSquareToBoard(xy, halfExtent, gs);
        if (!bounds) return;
        const { left, bottom, width, height } = bounds;
        const pulse = (Math.sin(pulsePhase) + 1) / 2;
        const cellSize = gs.getCellSize();

        // The floor artwork has a hand-traced 16x16 grid, so an axis-aligned Graphics.rect cuts
        // across its perspective seams. Project every side (including intermediate seam vertices)
        // through the same mapping used by movement cells and ranged trajectories.
        g.poly(projectedRectPoints(left, bottom, left + width, bottom + height, gs)).stroke({
            width: Math.max(1, cellSize * 0.012),
            color,
            alpha: (fightStarted ? 0.28 : 0.2) + pulse * 0.04,
        });

        const bracket = Math.min(cellSize * (0.22 + 0.04 * pulse), Math.min(width, height) * 0.18);
        const right = left + width;
        const top = bottom + height;
        const corners: [number, number, number, number][] = [
            [left, bottom, 1, 1],
            [right, bottom, -1, 1],
            [left, top, 1, -1],
            [right, top, -1, -1],
        ];
        for (const [cornerX, cornerY, towardX, towardY] of corners) {
            g.poly(
                projectedPolyline(
                    [
                        { x: cornerX + towardX * bracket, y: cornerY },
                        { x: cornerX, y: cornerY },
                        { x: cornerX, y: cornerY + towardY * bracket },
                    ],
                    gs,
                ),
            ).stroke({
                width: Math.max(1.25, cellSize * 0.014),
                color,
                alpha: 0.4 + 0.12 * pulse,
            });
        }
    }
    private static drawProjectedRing(
        g: Graphics,
        center: HoCMath.XY,
        radius: number,
        gs: GridSettings,
        style: { width: number; color: number; alpha: number },
    ): void {
        const segments = 72;
        const points: HoCMath.XY[] = [];
        for (let i = 0; i < segments; i++) {
            const angle = (Math.PI * 2 * i) / segments;
            points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
        }
        g.poly(projectedPolyline(points, gs)).stroke(style);
    }
}
