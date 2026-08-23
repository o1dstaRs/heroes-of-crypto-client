import { Container, Graphics } from "pixi.js";
import { FightProperties, FightStateManager, GridMath, GridSettings, HoCMath, TeamType } from "@heroesofcrypto/common";

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

/**
 * Red used across the board to signal "it is the enemy's turn" in ranked play — the active-unit
 * aura, the movement highlight, and the board-edge glow all share this color for a consistent cue.
 */
export const ENEMY_TURN_HIGHLIGHT_COLOR = 0xff3636;
/** Muted tactical gold: readable over terrain without the neon-yellow picture-frame look. */
const SHOT_RANGE_COLOR = 0xe7bc6a;

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
                const xy = currentActiveUnit.getVisualCenter(gs);
                const isSmall = currentActiveUnit.isSmallSize();
                // Draw only Aura ranges (skip attack range as it's handled elsewhere or we can add it if needed)
                SandboxDrawer.drawAuraAndAttackRanges(g, xy, 0, auraRanges, isSmall, gs, hoverGlowPhase, 0.5);
            }
        }

        // 1. Shift Selected Shot Range (Same style as Active)
        if (shiftSelectedShotRange) {
            const { xy, distance } = shiftSelectedShotRange;
            SandboxDrawer.drawShotRangeSquare(g, xy, distance, gs, hoverGlowPhase, SHOT_RANGE_COLOR, fightStarted);
        }

        // 2. Full-damage shot square (Active Unit)
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

        // An explicitly inspected ally needs a dark tile body plus a contrasting grey edge. A uniformly
        // near-black low-alpha colour disappears into the floor and the green aura, as the screenshots show.
        if (hasHoveredMovement && !ctx.hoveredUnitMoveRangeIsEnemy) {
            SandboxDrawer.drawMovementArea(
                movementGraphics,
                hoveredUnitMoveRange!,
                gs,
                0x4d4d4d,
                hoverGlowPhase,
                1,
                true,
            );
        }

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
        } = ctx;
        if (!placementGraphics || !placementFrameContainer) return;
        const g = placementGraphics;
        g.clear();
        // Remove transient 9-slice frames together with the glow geometry so a hidden or resized
        // deployment zone can never leave stale light on the board. Frames live in a Container because
        // Pixi v8 deprecates adding display-object children directly to Graphics.
        placementFrameContainer.removeChildren();
        if (!fightProps.hasFightStarted()) {
            placementManager.draw(g, placementFrameContainer, restrictToTeam);
            hoverManager.drawHoverPlacementCell(g);
        }
    }
    private static drawMovementArea(
        g: Graphics,
        cells: HoCMath.XY[],
        gs: GridSettings,
        color: number,
        phase: number,
        intensity = 1,
        allyInspection = false,
    ): void {
        if (!cells.length) return;
        const half = gs.getStep() * 0.5;
        const edgeInset = gs.getCellSize() * 0.055;
        const pulse = (Math.sin(phase * 0.65) + 1) * 0.5;
        const boundsFor = (cell: HoCMath.XY) => {
            const pos = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
            return {
                left: pos.x - half + edgeInset,
                right: pos.x + half - edgeInset,
                bottom: pos.y - half + edgeInset,
                top: pos.y + half - edgeInset,
            };
        };
        const radius = Math.max(2, gs.getCellSize() * 0.025);

        for (const cell of cells) {
            const { left, right, bottom, top } = boundsFor(cell);
            g.roundRect(left, bottom, right - left, top - bottom, radius).fill({
                color: allyInspection ? 0x11151a : color,
                alpha: allyInspection ? 0.2 + pulse * 0.04 : (0.052 + pulse * 0.018) * intensity,
            });
            g.roundRect(left, bottom, right - left, top - bottom, radius).stroke({
                width: Math.max(3, gs.getCellSize() * 0.055),
                color: allyInspection ? 0x59616a : color,
                alpha: allyInspection ? 0.2 + pulse * 0.05 : (0.045 + pulse * 0.025) * intensity,
            });
            g.roundRect(left, bottom, right - left, top - bottom, radius).stroke({
                width: Math.max(1, gs.getCellSize() * 0.012),
                color: allyInspection ? 0xa0a5ab : color,
                alpha: allyInspection ? 0.5 + pulse * 0.12 : (0.16 + pulse * 0.06) * intensity,
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
            const bounds = SandboxDrawer.clampSquareToBoard(xy, attackRange, gs);
            if (bounds) {
                g.rect(bounds.left, bounds.bottom, bounds.width, bounds.height).stroke({
                    width: Math.max(1, cellSize * 0.01),
                    color: 0x6dbfc8,
                    alpha: 0.28 * alphaMultiplier,
                });
            }
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
                const extent = (range + unitHalfSizeCells) * cellSize - cellSize * 0.055;
                const feather = Math.min(cellSize * 0.28, extent * 0.12);

                // Nested, very transparent sheets feather the edge instead of producing a hard rectangle.
                const featherLayers = 5;
                for (let layer = 0; layer < featherLayers; layer++) {
                    const inset = (feather * layer) / (featherLayers - 1);
                    const layerExtent = extent - inset;
                    const layerAlpha = (0.022 + layer * 0.006) * alphaMultiplier;
                    g.rect(xy.x - layerExtent, xy.y - layerExtent, layerExtent * 2, layerExtent * 2).fill({
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
                    const radius = Math.min(cellSize * 0.18, waveExtent * 0.12);
                    g.roundRect(xy.x - waveExtent, xy.y - waveExtent, waveExtent * 2, waveExtent * 2, radius).stroke({
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
        halfExtent: number,
        gs: GridSettings,
        pulsePhase: number,
        color: number,
        fightStarted: boolean,
    ): void {
        const bounds = SandboxDrawer.clampSquareToBoard(xy, halfExtent, gs);
        if (!bounds) {
            return;
        }
        const { left, bottom, width, height } = bounds;
        const cellSize = gs.getCellSize();
        const pulse = (Math.sin(pulsePhase) + 1) / 2;

        // One restrained hairline states the exact gameplay boundary. The old treatment stacked six
        // inner rectangles under a thick neon border, turning a useful guide into a glowing picture frame.
        g.rect(left, bottom, width, height).stroke({
            width: Math.max(1, cellSize * 0.012),
            color,
            alpha: (fightStarted ? 0.28 : 0.2) + pulse * 0.04,
        });

        // Short corner cues keep the square discoverable over busy terrain. Only these breathe; the full
        // boundary stays still, so the overlay does not compete with projectiles and active-unit VFX.
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
            g.moveTo(cornerX + towardX * bracket, cornerY)
                .lineTo(cornerX, cornerY)
                .lineTo(cornerX, cornerY + towardY * bracket)
                .stroke({
                    width: Math.max(1.25, cellSize * 0.014),
                    color,
                    alpha: 0.4 + 0.12 * pulse,
                });
        }
    }
}
