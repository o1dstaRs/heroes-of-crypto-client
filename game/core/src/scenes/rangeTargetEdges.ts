import { GridMath, GridSettings, HoCMath, TeamType } from "@heroesofcrypto/common";

export interface RangeTargetExteriorEdge {
    cell: HoCMath.XY;
    side: GridMath.RangeAttackCellSide;
}

export interface RangeTargetEdgeSegment {
    from: HoCMath.XY;
    to: HoCMath.XY;
    markerCenter?: HoCMath.XY;
}

export interface OptimalRangeTargetEdgeCandidate extends RangeTargetExteriorEdge {
    shootable: boolean;
    rangeDivisor: number;
    aimPosition: HoCMath.XY;
}

/**
 * One aim policy for one attacker, shared by the cursor and by the shot it fires.
 *
 * They resolve the aim edge through separate calls, and when they disagree the click is simply dropped:
 * the hover promises an attack, the fire path finds no edge it will accept and abandons the shot with
 * nothing drawn, logged or sent. So both ask here instead of each deciding for itself.
 */
export const rangeAimOptions = (attackerHasDoubleShot: boolean): { allowIntercepted: boolean } => ({
    allowIntercepted: attackerHasDoubleShot,
});

/**
 * Pick the one edge that gives the player the best actual shot.
 *
 * Damage retention is authoritative: 1/1 beats 1/2, which beats 1/4 and 1/8. When several edges
 * keep the same damage band, the edge-center nearest to the firing point wins. Enumeration order is
 * retained on an exact tie so the result cannot flicker between otherwise identical candidates.
 */
export function optimalRangeTargetEdge<T extends OptimalRangeTargetEdgeCandidate>(
    edges: readonly T[],
    attackerPosition: HoCMath.XY,
    options: { allowIntercepted?: boolean } = {},
): T | undefined {
    const clean = pickOptimalRangeTargetEdge(edges, attackerPosition, false);
    // A Double Shot may aim past a screen on purpose: shot one hits whatever stands in the way and shot
    // two carries on to the unit this edge belongs to. A clean edge still wins whenever one exists.
    return clean ?? (options.allowIntercepted ? pickOptimalRangeTargetEdge(edges, attackerPosition, true) : undefined);
}

function pickOptimalRangeTargetEdge<T extends OptimalRangeTargetEdgeCandidate>(
    edges: readonly T[],
    attackerPosition: HoCMath.XY,
    includeIntercepted: boolean,
): T | undefined {
    let optimal: T | undefined;
    let optimalDistance = Number.POSITIVE_INFINITY;

    for (const edge of edges) {
        if (!edge.shootable && !includeIntercepted) continue;
        const distance = Math.hypot(edge.aimPosition.x - attackerPosition.x, edge.aimPosition.y - attackerPosition.y);
        if (
            optimal &&
            (edge.rangeDivisor > optimal.rangeDivisor ||
                (edge.rangeDivisor === optimal.rangeDivisor && distance >= optimalDistance))
        ) {
            continue;
        }
        optimal = edge;
        optimalDistance = distance;
    }

    return optimal;
}

/** Logical cell immediately outside the selected target side; its centre owns the cardinal marker. */
export function rangeTargetEdgeMarkerCell(cell: HoCMath.XY, side: GridMath.RangeAttackCellSide): HoCMath.XY {
    switch (side) {
        case GridMath.RangeAttackCellSide.LEFT:
            return { x: cell.x - 1, y: cell.y };
        case GridMath.RangeAttackCellSide.RIGHT:
            return { x: cell.x + 1, y: cell.y };
        case GridMath.RangeAttackCellSide.DOWN:
            return { x: cell.x, y: cell.y - 1 };
        case GridMath.RangeAttackCellSide.UP:
        default:
            return { x: cell.x, y: cell.y + 1 };
    }
}

/**
 * Cardinal, screen-straight orientation for the right-pointing marker artwork.
 *
 * Deliberately use the logical side instead of a projected edge vector: projected tiles are oblique,
 * but this interaction icon must only rotate in clean 90-degree steps like the approved reference.
 */
export function rangeTargetEdgeMarkerAngle(side: GridMath.RangeAttackCellSide): number {
    switch (side) {
        case GridMath.RangeAttackCellSide.LEFT:
            return 0;
        case GridMath.RangeAttackCellSide.RIGHT:
            return Math.PI;
        case GridMath.RangeAttackCellSide.DOWN:
            return Math.PI / 2;
        case GridMath.RangeAttackCellSide.UP:
        default:
            return -Math.PI / 2;
    }
}

export function distanceToRangeTargetEdgeSegment(point: HoCMath.XY, from: HoCMath.XY, to: HoCMath.XY): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= Number.EPSILON) return Math.hypot(point.x - from.x, point.y - from.y);
    const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (from.x + dx * t), point.y - (from.y + dy * t));
}

const distanceToRangeTargetEdge = (point: HoCMath.XY, edge: RangeTargetEdgeSegment): number => {
    const segmentDistance = distanceToRangeTargetEdgeSegment(point, edge.from, edge.to);
    const markerDistance = edge.markerCenter
        ? Math.hypot(point.x - edge.markerCenter.x, point.y - edge.markerCenter.y)
        : Number.POSITIVE_INFINITY;
    return Math.min(segmentDistance, markerDistance);
};

/** Return the closest visible edge only while the pointer is actually hovering its hit strip. */
export function closestRangeTargetEdge<T extends RangeTargetEdgeSegment>(
    edges: readonly T[],
    point: HoCMath.XY,
    maxDistance: number,
): T | undefined {
    let closest: T | undefined;
    let closestDistance = maxDistance;
    for (const edge of edges) {
        const distance = distanceToRangeTargetEdge(point, edge);
        // Keep the first candidate on an exact tie. Swapping to whichever equal candidate happened to
        // be enumerated last made corner/top markers alternate while the pointer was effectively still.
        if (distance > closestDistance || (closest && distance === closestDistance)) continue;
        closest = edge;
        closestDistance = distance;
    }
    return closest;
}

const RANGE_TARGET_EDGE_NEIGHBOURS = [
    { side: GridMath.RangeAttackCellSide.LEFT, dx: -1, dy: 0 },
    { side: GridMath.RangeAttackCellSide.RIGHT, dx: 1, dy: 0 },
    { side: GridMath.RangeAttackCellSide.DOWN, dx: 0, dy: -1 },
    { side: GridMath.RangeAttackCellSide.UP, dx: 0, dy: 1 },
] as const;

/**
 * Every one-cell segment of a footprint's exterior contour.
 *
 * Keeping the cell and side on each result is intentional: a large creature can have several
 * independently shootable segments along what looks like one long side. Internal footprint seams
 * are omitted because they are not exposed target edges.
 */
export function rangeTargetExteriorEdges(targetCells: readonly HoCMath.XY[]): RangeTargetExteriorEdge[] {
    const occupied = new Set(targetCells.map((cell) => `${cell.x}:${cell.y}`));
    const result: RangeTargetExteriorEdge[] = [];

    for (const cell of targetCells) {
        for (const { side, dx, dy } of RANGE_TARGET_EDGE_NEIGHBOURS) {
            if (occupied.has(`${cell.x + dx}:${cell.y + dy}`)) continue;
            result.push({ cell, side });
        }
    }

    return result;
}

/** Point a center sight notch outside the occupied cell for the requested edge. */
export function rangeTargetEdgeOutwardNotchTip(
    edgeCenter: HoCMath.XY,
    side: GridMath.RangeAttackCellSide,
    depth: number,
): HoCMath.XY {
    switch (side) {
        case GridMath.RangeAttackCellSide.LEFT:
            return { x: edgeCenter.x - depth, y: edgeCenter.y };
        case GridMath.RangeAttackCellSide.RIGHT:
            return { x: edgeCenter.x + depth, y: edgeCenter.y };
        case GridMath.RangeAttackCellSide.DOWN:
            return { x: edgeCenter.x, y: edgeCenter.y - depth };
        case GridMath.RangeAttackCellSide.UP:
        default:
            return { x: edgeCenter.x, y: edgeCenter.y + depth };
    }
}

/** First point where a centre-origin trajectory exits the shooter's occupied rectangular footprint. */
export function rangeTrajectoryFootprintExit(
    from: HoCMath.XY,
    to: HoCMath.XY,
    halfWidth: number,
    halfHeight: number,
): HoCMath.XY {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) <= Number.EPSILON && Math.abs(dy) <= Number.EPSILON) return { ...from };

    const xExit = Math.abs(dx) > Number.EPSILON ? Math.max(0, halfWidth) / Math.abs(dx) : Infinity;
    const yExit = Math.abs(dy) > Number.EPSILON ? Math.max(0, halfHeight) / Math.abs(dy) : Infinity;
    const t = Math.min(xExit, yExit);
    if (!Number.isFinite(t)) return { ...from };
    return { x: from.x + dx * t, y: from.y + dy * t };
}

/** Engine aim point: visually on the requested edge, but nudged at most one pixel into the target cell. */
export function rangeTargetEdgeEvaluationAim(
    gridSettings: GridSettings,
    cell: HoCMath.XY,
    side: GridMath.RangeAttackCellSide,
    attackerPosition: HoCMath.XY,
): HoCMath.XY {
    return GridMath.getRangeAttackSideCenter(gridSettings, cell, side, attackerPosition);
}

/**
 * Whether this exact target edge can be selected by the same bounded aiming rule used by a live shot.
 *
 * Probing just inside the candidate side avoids the boundary ambiguity of getCellForPosition, while
 * getClosestSideCenterDetailed still owns all footprint, team and immediately-covered-edge rules.
 */
export function rangeTargetEdgeIsSelectable(
    gridMatrix: number[][],
    gridSettings: GridSettings,
    cell: HoCMath.XY,
    side: GridMath.RangeAttackCellSide,
    attackerPosition: HoCMath.XY,
    targetPosition: HoCMath.XY,
    attackerIsSmall: boolean,
    targetIsSmall: boolean,
    attackerTeam: TeamType,
    throughShot: boolean,
    ignoresStructures = false,
): boolean {
    return GridMath.isRangeAttackSideSelectable(
        gridMatrix,
        gridSettings,
        cell,
        side,
        attackerPosition,
        targetPosition,
        attackerIsSmall,
        targetIsSmall,
        attackerTeam,
        throughShot,
        ignoresStructures,
    );
}
