import type { GridSettings, HoCMath } from "@heroesofcrypto/common";
import { projectedCellPoints } from "./BattlefieldVisualGrid";
import type { WhirlpoolFootprint } from "./WhirlpoolSprites";

/** Bounds of the actual painted floor cells, including optional surrounding-cell padding. */
export function spellFootprint(cells: readonly HoCMath.XY[], gs: GridSettings, padding = 0): WhirlpoolFootprint {
    const left = Math.min(...cells.map((cell) => cell.x)) - padding;
    const right = Math.max(...cells.map((cell) => cell.x)) + padding;
    const bottom = Math.min(...cells.map((cell) => cell.y)) - padding;
    const top = Math.max(...cells.map((cell) => cell.y)) + padding;
    const points = [
        { x: left, y: bottom },
        { x: right, y: bottom },
        { x: left, y: top },
        { x: right, y: top },
    ].flatMap((cell) => projectedCellPoints(cell, gs));
    const xs = points.filter((_, i) => i % 2 === 0);
    const ys = points.filter((_, i) => i % 2 === 1);
    const minX = Math.min(...xs),
        maxX = Math.max(...xs);
    const minY = Math.min(...ys),
        maxY = Math.max(...ys);
    return { center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, width: maxX - minX, height: maxY - minY };
}
