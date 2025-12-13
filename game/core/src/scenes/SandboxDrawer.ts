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
            hoverManager,
            sidebarUnitRanges,
            hoveredAuraRanges,
            lingeringTracks,
        } = ctx;
        const fightStarted = fightProps.hasFightStarted();

        // 0. Hovered Unit Range (New Feature)
        if (hoveredShotRange && (!fightStarted || !isActiveUnitMoving)) {
            const { xy, distance } = hoveredShotRange;
            // distinct color, e.g., Cyan or Light Blue to differentiate from active yellow
            const hoverColor = 0x00ffff;
            g.circle(xy.x, xy.y, distance).stroke({
                width: 2,
                color: hoverColor,
                alpha: 0.6,
            });
        }

        // 0.5 Sidebar Unit Range (New Feature)
        if (sidebarUnitRanges) {
            const { xy, attackRange, auraRanges, isSmall } = sidebarUnitRanges;
            SandboxDrawer.drawAuraAndAttackRanges(g, xy, attackRange, auraRanges, isSmall, gs.getCellSize());
        }

        // 0.51 Hovered Aura Ranges
        if (hoveredAuraRanges) {
            const { xy, auraRanges, isSmall } = hoveredAuraRanges;
            SandboxDrawer.drawAuraAndAttackRanges(g, xy, 0, auraRanges, isSmall, gs.getCellSize());
        }

        // 0.6 Active Unit Aura Range (Requested Feature)
        if (currentActiveUnit && fightStarted && !isActiveUnitMoving) {
            const ar = currentActiveUnit.getAuraRanges();
            const ab = currentActiveUnit.getAuraIsBuff();
            if (ar && ar.length > 0) {
                const auraRanges = ar.map((range, i) => ({ range, isBuff: ab[i] })).filter(a => a.range > 0);
                const xy = currentActiveUnit.getVisualCenter(gs);
                const isSmall = currentActiveUnit.isSmallSize();
                // Draw only Aura ranges (skip attack range as it's handled elsewhere or we can add it if needed)
                SandboxDrawer.drawAuraAndAttackRanges(g, xy, 0, auraRanges, isSmall, gs.getCellSize());
            }
        }

        // 1. Shift Selected Shot Range (Same style as Active)
        if (shiftSelectedShotRange) {
            const { xy, distance } = shiftSelectedShotRange;
            const cellSize = gs.getCellSize();
            const baseColor = 0xffff00;
            const ringWidth = fightStarted ? 3 : 2;

            g.circle(xy.x, xy.y, distance).stroke({
                width: ringWidth,
                color: baseColor,
                alpha: fightStarted ? 0.95 : 0.8,
            });

            const steps = 8;
            const pulse = (Math.sin(hoverGlowPhase) + 1) / 2;
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
                        color: baseColor,
                        alpha: 0.6 + 0.3 * pulse,
                    });
            }

            const glowSteps = 12;
            const glowSpread = cellSize * 0.8;
            const glowBaseAlpha = fightStarted ? 0.25 : 0.2;
            for (let i = 1; i <= glowSteps; i++) {
                const fraction = i / glowSteps;
                const glowRadius = distance + fraction * glowSpread;
                const glowAlpha = glowBaseAlpha * (1 - fraction) * (0.7 + 0.3 * pulse);
                g.circle(xy.x, xy.y, glowRadius).stroke({
                    width: 1.5,
                    color: baseColor,
                    alpha: glowAlpha,
                });
            }
        }

        // 2. Shot range ring (Active Unit)
        if (currentActiveShotRange && !isActiveUnitMoving) {
            const { xy, distance } = currentActiveShotRange;
            const cellSize = gs.getCellSize();
            const baseColor = 0xffff00;
            const ringWidth = fightStarted ? 3 : 2;

            g.circle(xy.x, xy.y, distance).stroke({
                width: ringWidth,
                color: baseColor,
                alpha: fightStarted ? 0.95 : 0.8,
            });

            const steps = 8;
            const pulse = (Math.sin(hoverGlowPhase) + 1) / 2;
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
                        color: baseColor,
                        alpha: 0.6 + 0.3 * pulse,
                    });
            }

            const glowSteps = 12;
            const glowSpread = cellSize * 0.8;
            const glowBaseAlpha = fightStarted ? 0.25 : 0.2;
            for (let i = 1; i <= glowSteps; i++) {
                const fraction = i / glowSteps;
                const glowRadius = distance + fraction * glowSpread;
                const glowAlpha = glowBaseAlpha * (1 - fraction) * (0.7 + 0.3 * pulse);
                g.circle(xy.x, xy.y, glowRadius).stroke({
                    width: 1.5,
                    color: baseColor,
                    alpha: glowAlpha,
                });
            }
        }

        // 2. Active path lights
        if (currentActivePath && currentActiveUnit && !sc_isAnimating) {
            const path = currentActivePath;
            if (path.length > 0) {
                for (let i = 0; i < path.length; i++) {
                    const pos = GridMath.getPositionForCell(path[i], gs.getMinX(), gs.getStep(), gs.getHalfStep());
                    const baseRadius = gs.getCellSize() * 0.18;
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

        // 3. Active unit highlight
        if (currentActiveUnit) {
            hoverManager.hoveredUnitHighlight = hoverManager.getHighlightRectForUnit(currentActiveUnit);
            hoverManager.hoveredUnitId = currentActiveUnit.getId();
            hoverManager.drawHoveredUnitHighlight(g);
        }

        // 4. Lingering tracks
        if (lingeringTracks.length) {
            for (const t of lingeringTracks) {
                const k = t.life / t.maxLife;
                const numRings = 4;
                for (let r = 0; r < numRings; r++) {
                    const frac = r / (numRings - 1);
                    const ringRadius = t.radius * (0.35 + frac * (0.55 + 0.5 * (1 - k)));
                    const ringWidth = 0.8 * (1 - frac) + 0.4;
                    const ringAlpha = 0.55 * k * (1 - frac) * (0.8 + 0.2 * Math.sin(t.phase + frac * Math.PI));
                    g.circle(t.x, t.y, ringRadius).stroke({
                        width: ringWidth,
                        color: 0xffffff,
                        alpha: ringAlpha,
                    });
                }
                const innerRadius = t.radius * 0.3 * k;
                const innerAlpha = 0.32 * k * (0.7 + 0.3 * Math.sin(t.phase));
                g.circle(t.x, t.y, innerRadius).fill({
                    color: 0xffffff,
                    alpha: innerAlpha,
                });
            }
        }
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
    ): void {
        // Attack Range
        if (attackRange > 0) {
            // Style: Thin white/cyan ring, distinct from active unit
            g.circle(xy.x, xy.y, attackRange).stroke({
                width: 1.5,
                color: 0x00ffff, // Cyan
                alpha: 0.5,
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
                    alpha: 0.6,
                });
                // Optional: Fill slightly
                g.rect(xy.x - extent, xy.y - extent, extent * 2, extent * 2).fill({
                    color: color,
                    alpha: 0.05,
                });
            }
        }
    }
}
