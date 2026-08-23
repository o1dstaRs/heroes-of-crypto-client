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
import {
    projectBattlefieldPoint,
    projectedCellPoints,
    projectedPolyline,
    projectedRectPoints,
} from "./sandbox/BattlefieldVisualGrid";

/**
 * Red used across the board to signal "it is the enemy's turn" in ranked play — the active-unit
 * aura, the movement highlight, and the board-edge glow all share this color for a consistent cue.
 */
export const ENEMY_TURN_HIGHLIGHT_COLOR = 0xff3636;
const ALLY_MOVEMENT_INSPECTION_COLOR = 0xc08a45;

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
    /**
     * Shot ranges are carried as `distance` = half-width of the FULL-DAMAGE square in world units
     * (GridMath.getFullDamageSquareHalfExtent), not as a circle radius: the board floors the unit's
     * fractional shot_distance stat to whole cells, so the drawn edge lands on a cell border.
     */
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
        attackRange: number; // Half-width of the full-damage square, in world units
        auraRanges: { range: number; isBuff: boolean }[]; // Range in cells
        isSmall: boolean;
    };
    hoveredAuraRanges?: {
        xy: HoCMath.XY;
        auraRanges: { range: number; isBuff: boolean }[];
        isSmall: boolean;
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
            SandboxDrawer.drawRangeRing(
                g,
                xy,
                distance,
                gs,
                hoverGlowPhase,
                0xffff00, // Yellow
                fightStarted,
            );
        }

        // 0.5 Sidebar Unit Range (New Feature)
        if (sidebarUnitRanges) {
            const { xy, attackRange, auraRanges, isSmall } = sidebarUnitRanges;
            SandboxDrawer.drawAuraAndAttackRanges(g, xy, attackRange, auraRanges, isSmall, gs, hoverGlowPhase, 0.7);
        }

        // 0.51 Hovered Aura Ranges
        if (hoveredAuraRanges) {
            const { xy, auraRanges, isSmall } = hoveredAuraRanges;
            SandboxDrawer.drawAuraAndAttackRanges(g, xy, 0, auraRanges, isSmall, gs, hoverGlowPhase, 0.7);
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
                const isSmall = currentActiveUnit.isSmallSize();
                // Draw only Aura ranges (skip attack range as it's handled elsewhere or we can add it if needed)
                SandboxDrawer.drawAuraAndAttackRanges(g, xy, 0, auraRanges, isSmall, gs, hoverGlowPhase, 0.5);
            }
        }

        // 1. Shift Selected Shot Range (Same style as Active)
        if (shiftSelectedShotRange) {
            const { xy, distance } = shiftSelectedShotRange;
            SandboxDrawer.drawRangeRing(g, xy, distance, gs, hoverGlowPhase, 0xffff00, fightStarted);
        }

        // 2. Full-damage shot square (Active Unit)
        if (currentActiveShotRange && !isActiveUnitMoving) {
            const { xy, distance } = currentActiveShotRange;
            SandboxDrawer.drawRangeRing(g, xy, distance, gs, hoverGlowPhase, 0xffff00, fightStarted);
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
        isSmall: boolean,
        gs: GridSettings,
        pulsePhase: number,
        alphaMultiplier = 1.0,
    ): void {
        const cellSize = gs.getCellSize();

        // Attack Range: the same whole-cell full-damage square the active unit gets, in a thin cyan
        // so the sidebar's read-only inspection stays distinct from the unit whose turn it is.
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

                // Calculate half-extent based on range cells
                // Formula: (Range + (UnitSizeCells / 2)) * CellSize
                const unitHalfSizeCells = isSmall ? 0.5 : 1.0;
                const cellSize = gs.getCellSize();
                const extent = (range + unitHalfSizeCells) * cellSize - cellSize * 0.055;
                const feather = Math.min(cellSize * 0.28, extent * 0.12);

                // Nested, very transparent sheets feather the edge instead of producing a hard rectangle.
                const featherLayers = 5;
                for (let layer = 0; layer < featherLayers; layer++) {
                    const inset = (feather * layer) / (featherLayers - 1);
                    const layerExtent = extent - inset;
                    const layerAlpha = (0.022 + layer * 0.006) * alphaMultiplier;
                    g.poly(
                        projectedRectPoints(
                            xy.x - layerExtent,
                            xy.y - layerExtent,
                            xy.x + layerExtent,
                            xy.y + layerExtent,
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
                    const waveExtent = Math.max(cellSize * 0.42, extent * progress);
                    const fade = Math.sin(progress * Math.PI);
                    g.poly(
                        projectedRectPoints(
                            xy.x - waveExtent,
                            xy.y - waveExtent,
                            xy.x + waveExtent,
                            xy.y + waveExtent,
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
    /**
     * The part of the shot square that is actually on the board. Cells outside the arena do not exist,
     * so a shooter standing near an edge gets a truthful (clipped) area instead of a box hanging off
     * the field. Returns undefined when nothing is left to draw.
     */
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
        if (width <= 0 || height <= 0) {
            return undefined;
        }

        return { left, bottom, width, height };
    }
    /**
     * The shooter's FULL-DAMAGE area: every cell inside this square takes an undivided 1/1 arrow, the
     * next square band out takes 1/2, and so on (AttackHandler.getRangeAttackDivisor). It is a square of
     * whole cells rather than a circle, so its border always falls on cell edges and the player can
     * count the cells it covers - which is the whole point of showing it.
     */
    private static drawShotRangeSquare(
        g: Graphics,
        xy: HoCMath.XY,
        distance: number,
        gs: GridSettings,
        pulsePhase: number,
        color: number,
        fightStarted: boolean,
    ): void {
        const ringWidth = fightStarted ? 3 : 2;

        // Main Ring
        SandboxDrawer.drawProjectedRing(g, xy, distance, gs, {
            width: ringWidth,
            color: color,
            alpha: fightStarted ? 0.95 : 0.8,
        });

        const pulse = (Math.sin(pulsePhase) + 1) / 2;
        const cellSize = gs.getCellSize();

        // Ticks
        const steps = 8;
        const tickLen = cellSize * (0.25 + 0.15 * pulse);
        for (let i = 0; i < steps; i++) {
            const angle = (Math.PI * 2 * i) / steps;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const r0 = distance - tickLen * 0.5;
            const r1 = distance + tickLen * 0.5;
            const p0 = projectBattlefieldPoint({ x: xy.x + cos * r0, y: xy.y + sin * r0 }, gs);
            const p1 = projectBattlefieldPoint({ x: xy.x + cos * r1, y: xy.y + sin * r1 }, gs);
            g.moveTo(p0.x, p0.y)
                .lineTo(p1.x, p1.y)
                .stroke({
                    width: 1.5,
                    color: color,
                    alpha: 0.6 + 0.3 * pulse,
                });
        }

        // Glow
        const glowSteps = 12;
        const glowSpread = cellSize * 0.8;
        const glowBaseAlpha = fightStarted ? 0.25 : 0.2;
        for (let i = 1; i <= glowSteps; i++) {
            const fraction = i / glowSteps;
            const glowRadius = distance + fraction * glowSpread;
            const glowAlpha = glowBaseAlpha * (1 - fraction) * (0.7 + 0.3 * pulse);
            SandboxDrawer.drawProjectedRing(g, xy, glowRadius, gs, {
                width: 1.5,
                color: color,
                alpha: glowAlpha,
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
