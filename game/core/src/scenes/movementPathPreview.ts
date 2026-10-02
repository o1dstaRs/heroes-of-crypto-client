import { Graphics } from "pixi.js";
import { GridMath, type FireWallHelper, type GridSettings, type HoCMath, type Unit } from "@heroesofcrypto/common";

import { tunedCellFillPolygon } from "./movementAreaVisual";
import { projectBattlefieldPoint, projectedPolyline } from "./sandbox/BattlefieldVisualGrid";

/** Show the chosen walk, with every burning cell the creature's body enters along that route. */
export function drawMovementPathPreview(
    g: Graphics,
    route: readonly HoCMath.XY[],
    unit: Unit,
    gs: GridSettings,
    fireWalls: FireWallHelper.FireWalls,
): void {
    const destination = route[route.length - 1];
    const origin = unit.getBaseCell();
    if (!destination || (destination.x === origin.x && destination.y === origin.y)) return;

    const width = unit.getFootprintWidth();
    const height = unit.getFootprintHeight();
    const worldPath = [unit.getPosition()];
    const cellKey = (cell: HoCMath.XY): number => (cell.x << 4) | cell.y;
    // Standing in fire does not charge a new crossing. Highlight only newly entered burning cells,
    // including those under the non-anchor parts of a rectangular creature.
    const occupied = new Set(unit.getCells().map(cellKey));
    const highlighted = new Set<number>();
    for (const anchor of route) {
        const center = GridMath.getPositionForFootprintAnchor(gs, anchor, width, height);
        const previous = worldPath[worldPath.length - 1];
        if (center.x !== previous.x || center.y !== previous.y) worldPath.push(center);

        for (const cell of GridMath.getFootprintCellsForAnchor(anchor, width, height)) {
            const key = cellKey(cell);
            if (occupied.has(key) || highlighted.has(key) || !fireWalls.has(cell)) continue;
            highlighted.add(key);
            g.poly(tunedCellFillPolygon(cell, gs))
                .fill({ color: 0xff6a28, alpha: 0.3 })
                .stroke({ color: 0xff6a28, width: 2, alpha: 0.95 });
        }
    }

    // Follow the same footprint-centred waypoints as the movement animation, projected onto the floor.
    // A dark edge keeps the white route readable over both the movement wash and the flames.
    const points = projectedPolyline(worldPath, gs);
    g.poly(points, false).stroke({ color: 0x17100c, width: 5, alpha: 0.85, cap: "round", join: "round" });
    g.poly(points, false).stroke({ color: 0xffffff, width: 2, alpha: 0.95, cap: "round", join: "round" });
    const radius = gs.getStep() * 0.045;
    for (let index = 1; index < worldPath.length; index += 1) {
        const point = projectBattlefieldPoint(worldPath[index], gs);
        g.circle(point.x, point.y, radius)
            .fill({ color: 0xffffff, alpha: 0.95 })
            .stroke({ color: 0x17100c, width: 1.5, alpha: 0.85 });
    }
}
