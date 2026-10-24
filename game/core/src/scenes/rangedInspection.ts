import type { Grid, GridSettings, HoCMath, TeamType, Unit } from "@heroesofcrypto/common";
import { GridMath } from "@heroesofcrypto/common";
import type { Graphics } from "pixi.js";
import type { RangeTargetEdgeVisual } from "./HoverManager";
import { projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";

export interface RangedInspectionCell {
    cell: HoCMath.XY;
    reachable: boolean;
}

export interface RangedInspection {
    cells: RangedInspectionCell[];
    edges: RangeTargetEdgeVisual[];
}

interface InspectionInput {
    shooter: Unit;
    grid: Grid;
    units: ReadonlyMap<string, Unit>;
    viewerTeam?: TeamType;
    canShoot: boolean;
    edgesForTarget(target: Unit): RangeTargetEdgeVisual[];
}

const emptyInspection = (): RangedInspection => ({ cells: [], edges: [] });
const concealed = (unit: Unit, viewerTeam?: TeamType): boolean =>
    viewerTeam !== undefined && unit.getTeam() !== viewerTeam && unit.hasBuffActive("Hidden");

/** Reuse the actual aiming edges; never treat a clear line to a large body's centre as its only aim. */
export class RangedInspectionCache {
    private key?: string;
    private value = emptyInspection();
    public clear(): void {
        this.key = undefined;
        this.value = emptyInspection();
    }
    public get(input: InspectionInput): RangedInspection {
        const { shooter, grid, units, viewerTeam, canShoot, edgesForTarget } = input;
        if (
            !canShoot ||
            shooter.isDead() ||
            concealed(shooter, viewerTeam) ||
            shooter.getCells().some((cell) => grid.getOccupantUnitId(cell) !== shooter.getId())
        ) {
            this.clear();
            return this.value;
        }
        const key = JSON.stringify([
            shooter.getId(),
            viewerTeam,
            shooter.hasAbilityActive("Through Shot"),
            shooter.hasAbilityActive("Large Caliber"),
            shooter.hasAbilityActive("Area Throw"),
            grid.getMatrix(),
            [...units.values()].map((unit) => [
                unit.getId(),
                unit.getTeam(),
                unit.getPosition(),
                unit.getFootprintWidth(),
                unit.getFootprintHeight(),
                unit.isDead(),
                unit.hasBuffActive("Hidden"),
                unit.hasAbilityActive("Arrows Wingshield Blessing"),
            ]),
        ]);
        if (key === this.key) return this.value;

        const result = emptyInspection();
        const size = grid.getSettings().getGridSize();
        for (const target of units.values()) {
            if (target.isDead() || target.getTeam() === shooter.getTeam() || concealed(target, viewerTeam)) continue;
            const cells = target.getCells().filter((cell) => GridMath.isCellWithinGrid(grid.getSettings(), cell));
            if (!cells.length || cells.some((cell) => grid.getOccupantUnitId(cell) !== target.getId())) continue;
            const edges = edgesForTarget(target).filter((edge) => edge.shootable);
            const reachable = new Set(edges.map((edge) => edge.cell.x * size + edge.cell.y));
            result.cells.push(
                ...cells.map((cell) => ({ cell: { ...cell }, reachable: reachable.has(cell.x * size + cell.y) })),
            );
            result.edges.push(...edges);
        }
        this.key = key;
        this.value = result;
        return result;
    }
}

export function drawRangedInspection(g: Graphics, inspection: RangedInspection, gs: GridSettings): void {
    const half = gs.getHalfStep();
    for (const { cell, reachable } of inspection.cells) {
        const center = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), half);
        const color = reachable ? 0x52e2a3 : 0xe38b83;
        g.poly(projectedRectPoints(center.x - half, center.y - half, center.x + half, center.y + half, gs))
            .fill({ color, alpha: reachable ? 0.18 : 0.13 })
            .stroke({ color, alpha: reachable ? 0.65 : 0.55, width: 1 });
    }
    for (const edge of inspection.edges) {
        g.moveTo(edge.from.x, edge.from.y)
            .lineTo(edge.to.x, edge.to.y)
            .stroke({ color: 0x52e2a3, alpha: 0.95, width: 2.5 });
    }
}
