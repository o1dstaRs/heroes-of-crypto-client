import { Graphics } from "pixi.js";
import { FightProperties, GridMath, GridSettings, HoCMath, TeamType } from "@heroesofcrypto/common";
import { HoverManager } from "./HoverManager";
import { PlacementManager } from "./PlacementManager";
import { RenderableUnit } from "./RenderableUnit";

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
        isSmall: boolean;
    };
    hoveredAuraRanges?: {
        xy: HoCMath.XY;
        auraRanges: { range: number; isBuff: boolean }[];
        isSmall: boolean;
    };
    lingeringTracks: ILingeringTrack[];
    hoveredMoveRange?: HoCMath.XY[];
}

export interface IPlacementDrawContext {
    fightProps: FightProperties;
    placementManager: PlacementManager;
    hoverManager: HoverManager;
    placementGraphics?: Graphics;
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
        } = ctx;
        const fightStarted = fightProps.hasFightStarted();

        // 0. Hovered Move Range (Placement Phase)
        // 0. Hovered Move Range (Placement Phase) - Animated Dots
        if (ctx.hoveredMoveRange && ctx.hoveredMoveRange.length > 0) {
            const step = gs.getStep();
            const hs = gs.getHalfStep();
            const minX = gs.getMinX();

            // Animation Pulse
            const pulse = (Math.sin(hoverGlowPhase * 3) + 1) / 2;
            // [VISUAL TWEAK] Different sizes for Placement vs Combat
            const dotBaseRadius = fightStarted ? step * 0.04 : step * 0.12;
            const dotRadius = dotBaseRadius * (1 + 0.2 * pulse);
            const dotAlpha = 0.4 + 0.3 * pulse;

            for (const cell of ctx.hoveredMoveRange) {
                const pos = GridMath.getPositionForCell(cell, minX, step, hs);
                if (pos) {
                    // Draw animated dot at center
                    g.circle(pos.x, pos.y, dotRadius).fill({ color: 0xffffff, alpha: dotAlpha });

                    // Optional: Faint outer ring for better visibility on light terrain
                    g.circle(pos.x, pos.y, dotRadius + 2).stroke({ width: 1, color: 0x000000, alpha: 0.1 });
                }
            }
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
                gs.getCellSize(),
                hoverGlowPhase,
                0xffff00, // Yellow
                fightStarted,
            );
        }

        // 0.5 Sidebar Unit Range (New Feature)
        if (sidebarUnitRanges) {
            const { xy, attackRange, auraRanges, isSmall } = sidebarUnitRanges;
            SandboxDrawer.drawAuraAndAttackRanges(g, xy, attackRange, auraRanges, isSmall, gs.getCellSize(), 0.7);
        }

        // 0.51 Hovered Aura Ranges
        if (hoveredAuraRanges) {
            const { xy, auraRanges, isSmall } = hoveredAuraRanges;
            SandboxDrawer.drawAuraAndAttackRanges(g, xy, 0, auraRanges, isSmall, gs.getCellSize(), 0.7);
        }

        // 0.6 Active Unit Aura Range (Requested Feature)
        if (currentActiveUnit && !isActiveUnitMoving) {
            const ar = currentActiveUnit.getAuraRanges();
            const ab = currentActiveUnit.getAuraIsBuff();
            if (ar && ar.length > 0) {
                const auraRanges = ar.map((range, i) => ({ range, isBuff: ab[i] })).filter((a) => a.range > 0);
                const xy = currentActiveUnit.getVisualCenter(gs);
                const isSmall = currentActiveUnit.isSmallSize();
                // Draw only Aura ranges (skip attack range as it's handled elsewhere or we can add it if needed)
                SandboxDrawer.drawAuraAndAttackRanges(g, xy, 0, auraRanges, isSmall, gs.getCellSize(), 0.5);
            }
        }

        // 1. Shift Selected Shot Range (Same style as Active)
        if (shiftSelectedShotRange) {
            const { xy, distance } = shiftSelectedShotRange;
            SandboxDrawer.drawRangeRing(g, xy, distance, gs.getCellSize(), hoverGlowPhase, 0xffff00, fightStarted);
        }

        // 2. Shot range ring (Active Unit)
        if (currentActiveShotRange && !isActiveUnitMoving) {
            const { xy, distance } = currentActiveShotRange;
            SandboxDrawer.drawRangeRing(g, xy, distance, gs.getCellSize(), hoverGlowPhase, 0xffff00, fightStarted);
        }

        // 2. Active path lights
        if (currentActivePath && currentActiveUnit && !sc_isAnimating) {
            const path = currentActivePath;
            if (path.length > 0) {
                for (let i = 0; i < path.length; i++) {
                    const pos = GridMath.getPositionForCell(path[i], gs.getMinX(), gs.getStep(), gs.getHalfStep());
                    const baseRadius = gs.getCellSize() * 0.12; // Reduced from 0.18 to 0.06 (Small dots)
                    const phase = hoverGlowPhase + i * 0.4;
                    const wave = (Math.sin(phase) + 1) / 2;
                    const innerRadius = baseRadius * (0.9 + 0.2 * wave);
                    const outerRadius = baseRadius * 1.8 * (0.9 + 0.25 * wave);
                    const innerAlpha = 0.38 + 0.2 * wave;
                    const outerAlpha = 0.08 + 0.06 * wave;
                    g.circle(pos.x, pos.y, outerRadius).fill({
                        color: 0xffffff,
                        alpha: outerAlpha,
                    });
                    g.circle(pos.x, pos.y, innerRadius).fill({
                        color: 0xffffff,
                        alpha: innerAlpha,
                    });
                }
            }
        }

        // 3. Active unit indication is the pulsing light-wave aura rendered on the unit itself
        //    (see RenderableUnit.updateActiveAura) — no separate highlight glow here.

        // 4. Lingering tracks (movement smoke) are now rendered by SmokeLayer, which runs an fBM
        //    shader over its own dust layer — see scenes/sandbox/SmokeLayer.ts.
    }
    public static drawPlacements(ctx: IPlacementDrawContext): void {
        const { fightProps, placementManager, hoverManager, placementGraphics } = ctx;
        if (!placementGraphics) return;
        const g = placementGraphics;
        g.clear();
        if (!fightProps.hasFightStarted()) {
            let team: TeamType | undefined = undefined;
            placementManager.draw(g, team);
            hoverManager.drawHoverPlacementCell(g);
            if (hoverManager.hoveredUnitHighlight) {
                hoverManager.drawHoveredUnitHighlight(g);
            }
        }
    }
    private static drawAuraAndAttackRanges(
        g: Graphics,
        xy: HoCMath.XY,
        attackRange: number,
        auraRanges: { range: number; isBuff: boolean }[],
        isSmall: boolean,
        cellSize: number,
        alphaMultiplier = 1.0,
    ): void {
        // Attack Range
        if (attackRange > 0) {
            // Style: Thin white/cyan ring, distinct from active unit
            g.circle(xy.x, xy.y, attackRange).stroke({
                width: 1.5,
                color: 0x00ffff, // Cyan
                alpha: 0.5 * alphaMultiplier,
            });
        }

        // Aura Ranges (Squares)
        if (auraRanges && auraRanges.length > 0) {
            for (const aura of auraRanges) {
                const { range, isBuff } = aura;
                const color = isBuff ? 0x00ff00 : 0xff0000; // Green for Buff, Red for Debuff

                // Calculate half-extent based on range cells
                // Formula: (Range + (UnitSizeCells / 2)) * CellSize
                const unitHalfSizeCells = isSmall ? 0.5 : 1.0;
                const extent = (range + unitHalfSizeCells) * cellSize;

                // Draw Square
                // x, y are center. TopLeft = x - extent, y - extent.
                // Width/Height = extent * 2
                g.rect(xy.x - extent, xy.y - extent, extent * 2, extent * 2).stroke({
                    width: 2,
                    color: color,
                    alpha: 0.6 * alphaMultiplier,
                });
                // Optional: Fill slightly
                g.rect(xy.x - extent, xy.y - extent, extent * 2, extent * 2).fill({
                    color: color,
                    alpha: 0.2 * alphaMultiplier,
                });
            }
        }
    }
    private static drawRangeRing(
        g: Graphics,
        xy: HoCMath.XY,
        distance: number,
        cellSize: number,
        pulsePhase: number,
        color: number,
        fightStarted: boolean,
    ): void {
        const ringWidth = fightStarted ? 3 : 2;

        // Main Ring
        g.circle(xy.x, xy.y, distance).stroke({
            width: ringWidth,
            color: color,
            alpha: fightStarted ? 0.95 : 0.8,
        });

        const pulse = (Math.sin(pulsePhase) + 1) / 2;

        // Ticks
        const steps = 8;
        const tickLen = cellSize * (0.25 + 0.15 * pulse);
        for (let i = 0; i < steps; i++) {
            const angle = (Math.PI * 2 * i) / steps;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const r0 = distance - tickLen * 0.5;
            const r1 = distance + tickLen * 0.5;
            const x0 = xy.x + cos * r0;
            const y0 = xy.y + sin * r0;
            const x1 = xy.x + cos * r1;
            const y1 = xy.y + sin * r1;
            g.moveTo(x0, y0)
                .lineTo(x1, y1)
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
            g.circle(xy.x, xy.y, glowRadius).stroke({
                width: 1.5,
                color: color,
                alpha: glowAlpha,
            });
        }
    }
}
