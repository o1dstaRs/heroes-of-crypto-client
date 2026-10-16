import type { HoCMath } from "@heroesofcrypto/common";

/** One burning cell a mover enters, with the moment its walk animation gets there. */
export interface IFireWallCrossingStep {
    cell: HoCMath.XY;
    /** Seconds after the move animation starts that the sprite reaches this cell. */
    delaySec: number;
    /** Unit vector of the path segment the cell sits on — which way the body is travelling through it. */
    direction: HoCMath.XY;
}

/**
 * When, along a move animation, the sprite reaches each burning cell it crosses.
 *
 * The engine reports a Fire Wall burn the moment the move resolves — BEFORE the walk is drawn — with the
 * cells that burned and the total they cost. Playing the flames then would put them on the wrong spot at
 * the wrong time. This projects each burning cell onto the polyline the animation follows (`worldPath`,
 * logical board coordinates, travelled at `speed` px/s) and turns the distance up to that point into the
 * delay the flare-up should wait. Cells come back in travel order, so the first one is when the body
 * first touches fire and the last one is when it leaves it.
 *
 * Degenerate inputs (a one-point path, no speed) schedule everything at once rather than not at all.
 */
export const fireWallCrossingSchedule = (
    worldPath: readonly HoCMath.XY[],
    cells: readonly HoCMath.XY[],
    cellCenter: (cell: HoCMath.XY) => HoCMath.XY | undefined,
    speed: number,
): IFireWallCrossingStep[] => {
    const steps: IFireWallCrossingStep[] = [];
    const canTime = worldPath.length >= 2 && speed > 0;
    const cumulative: number[] = [0];
    for (let i = 1; i < worldPath.length; i++) {
        cumulative.push(
            cumulative[i - 1] + Math.hypot(worldPath[i].x - worldPath[i - 1].x, worldPath[i].y - worldPath[i - 1].y),
        );
    }
    for (const cell of cells) {
        const center = cellCenter(cell);
        if (!center) {
            continue;
        }
        if (!canTime) {
            steps.push({ cell: { x: cell.x, y: cell.y }, delaySec: 0, direction: { x: 1, y: 0 } });
            continue;
        }
        let bestDistance = Number.POSITIVE_INFINITY;
        let along = 0;
        let direction = { x: 1, y: 0 };
        for (let i = 0; i < worldPath.length - 1; i++) {
            const p0 = worldPath[i];
            const p1 = worldPath[i + 1];
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const lengthSquared = dx * dx + dy * dy;
            const t =
                lengthSquared > 0
                    ? Math.max(0, Math.min(1, ((center.x - p0.x) * dx + (center.y - p0.y) * dy) / lengthSquared))
                    : 0;
            const px = p0.x + dx * t;
            const py = p0.y + dy * t;
            const distance = Math.hypot(center.x - px, center.y - py);
            if (distance < bestDistance) {
                bestDistance = distance;
                const length = Math.sqrt(lengthSquared);
                along = cumulative[i] + length * t;
                direction = length > 0 ? { x: dx / length, y: dy / length } : direction;
            }
        }
        steps.push({ cell: { x: cell.x, y: cell.y }, delaySec: along / speed, direction });
    }
    steps.sort((left, right) => left.delaySec - right.delaySec);
    return steps;
};
