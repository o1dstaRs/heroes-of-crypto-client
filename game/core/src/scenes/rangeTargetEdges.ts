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
 * Pick the one edge that gives the player the best actual shot.
 *
 * Damage retention is authoritative: 1/1 beats 1/2, which beats 1/4 and 1/8. When several edges
 * keep the same damage band, the edge-center nearest to the firing point wins. Enumeration order is
 * retained on an exact tie so the result cannot flicker between otherwise identical candidates.
 */
export function optimalRangeTargetEdge<T extends OptimalRangeTargetEdgeCandidate>(
    edges: readonly T[],
    attackerPosition: HoCMath.XY,
): T | undefined {
    let optimal: T | undefined;
    let optimalDistance = Number.POSITIVE_INFINITY;

    for (const edge of edges) {
        if (!edge.shootable) continue;
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

/** Preserve both the marker's screen size and its aspect ratio through the non-uniform battlefield camera. */
export function rangeTargetEdgeMarkerLocalScaleRatios(
    side: GridMath.RangeAttackCellSide,
    cameraScale: HoCMath.XY,
): HoCMath.XY {
    const scaleX = Math.abs(cameraScale.x) || 1;
    const scaleY = Math.abs(cameraScale.y) || scaleX;
    const isVertical = side === GridMath.RangeAttackCellSide.DOWN || side === GridMath.RangeAttackCellSide.UP;
    // A 90-degree marker's artwork length lies on local X but is transformed by camera Y. Increase that
    // local X by X/Y so its on-screen length equals a horizontal marker. Local Y then only cancels stretch.
    return isVertical ? { x: scaleX / scaleY, y: 1 } : { x: 1, y: scaleX / scaleY };
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

/**
 * Keep exactly one usable target edge active while the ranged target is hovered.
 *
 * The pointer wins as soon as it enters another edge's hit strip. The current choice then stays stable
 * between arrows; before the first choice, the first shootable edge is the default, so the player never
 * sees a set of available arrows with no green choice.
 */
export function activeRangeTargetEdge<
    T extends RangeTargetEdgeSegment & RangeTargetExteriorEdge & { shootable: boolean },
>(edges: readonly T[], point: HoCMath.XY, maxDistance: number, current?: T): T | undefined {
    const shootableEdges = edges.filter((edge) => edge.shootable);
    const currentEdge = current
        ? shootableEdges.find(
              (edge) => edge.cell.x === current.cell.x && edge.cell.y === current.cell.y && edge.side === current.side,
          )
        : undefined;
    const hoveredEdge = closestRangeTargetEdge(shootableEdges, point, maxDistance);
    if (!hoveredEdge) return currentEdge ?? shootableEdges[0];
    if (!currentEdge || hoveredEdge === currentEdge) return hoveredEdge;

    // A two-pixel dead band removes sub-pixel selection chatter at the seam between adjacent hit strips.
    // It is deliberately tiny: moving onto another marker still wins immediately because that marker is
    // much closer than the current one, while an almost-equal projected top edge keeps its current choice.
    const switchMargin = Math.min(2, Math.max(0, maxDistance) * 0.15);
    const hoveredDistance = distanceToRangeTargetEdge(point, hoveredEdge);
    const currentDistance = distanceToRangeTargetEdge(point, currentEdge);
    return hoveredDistance + switchMargin < currentDistance ? hoveredEdge : currentEdge;
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

/** Keep a centered fraction of an edge without changing its direction. */
export function centeredRangeTargetEdgeSegment(
    from: HoCMath.XY,
    to: HoCMath.XY,
    visibleFraction = 0.7,
): RangeTargetEdgeSegment {
    const fraction = Math.max(0, Math.min(1, visibleFraction));
    const inset = (1 - fraction) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return {
        from: { x: from.x + dx * inset, y: from.y + dy * inset },
        to: { x: to.x - dx * inset, y: to.y - dy * inset },
    };
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
): boolean {
    const center = GridMath.getPositionForCell(
        cell,
        gridSettings.getMinX(),
        gridSettings.getStep(),
        gridSettings.getHalfStep(),
    );
    const probeDistance = Math.max(0, gridSettings.getHalfStep() - 1);
    const probe = { ...center };

    switch (side) {
        case GridMath.RangeAttackCellSide.LEFT:
            probe.x -= probeDistance;
            break;
        case GridMath.RangeAttackCellSide.RIGHT:
            probe.x += probeDistance;
            break;
        case GridMath.RangeAttackCellSide.DOWN:
            probe.y -= probeDistance;
            break;
        case GridMath.RangeAttackCellSide.UP:
        default:
            probe.y += probeDistance;
            break;
    }

    const resolved = GridMath.getClosestSideCenterDetailed(
        gridMatrix,
        gridSettings,
        probe,
        attackerPosition,
        targetPosition,
        attackerIsSmall,
        targetIsSmall,
        attackerTeam,
        throughShot,
    );
    return resolved?.cell.x === cell.x && resolved.cell.y === cell.y && resolved.side === side;
}
