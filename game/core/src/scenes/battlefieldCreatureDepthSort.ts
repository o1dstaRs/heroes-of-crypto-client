export interface CreatureDepthRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface CreatureDepthSortCandidate {
    id: string;
    baseDepth: number;
    stableOrder: number;
    bounds: CreatureDepthRect;
    headZone: CreatureDepthRect;
}

const HEAD_ZONE_WIDTH_RATIO = 0.48;
const HEAD_ZONE_HEIGHT_RATIO = 0.66;
const DEPTH_EPSILON = 0.01;

const rectArea = (rect: CreatureDepthRect): number =>
    Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);

const intersectionArea = (left: CreatureDepthRect, right: CreatureDepthRect): number =>
    Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
    Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));

const meaningfullyIntersects = (headZone: CreatureDepthRect, bodyBounds: CreatureDepthRect): boolean => {
    const overlap = intersectionArea(headZone, bodyBounds);
    const referenceArea = Math.min(rectArea(headZone), rectArea(bodyBounds));
    return overlap > Math.max(4, referenceArea * 0.01);
};

/**
 * Approximate the face/head end of a side-facing battlefield cutout. The upper portion covers humanoid
 * heads while the generous vertical reach still catches long, low dragon and quadruped necks.
 */
export const creatureHeadPriorityZone = (bounds: CreatureDepthRect, facingDirection: -1 | 1): CreatureDepthRect => {
    const width = Math.max(0, bounds.right - bounds.left);
    const height = Math.max(0, bounds.bottom - bounds.top);
    const headWidth = width * HEAD_ZONE_WIDTH_RATIO;

    return {
        left: facingDirection < 0 ? bounds.left : bounds.right - headWidth,
        right: facingDirection < 0 ? bounds.left + headWidth : bounds.right,
        top: bounds.top,
        bottom: bounds.top + height * HEAD_ZONE_HEIGHT_RATIO,
    };
};

const byNaturalDepth = (left: CreatureDepthSortCandidate, right: CreatureDepthSortCandidate): number =>
    left.baseDepth - right.baseDepth || left.stableOrder - right.stableOrder || left.id.localeCompare(right.id);

/**
 * Return adjusted depths only when a head-vs-body intersection overrides the natural ground-line order.
 * Edges are topologically resolved so chains of three or more overlapping creatures remain deterministic.
 */
export const resolveCreatureHeadPriorityDepths = (
    candidates: readonly CreatureDepthSortCandidate[],
): ReadonlyMap<string, number> => {
    if (candidates.length < 2) return new Map();

    const outgoing = new Map<string, Set<string>>();
    const incomingCount = new Map<string, number>();
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    for (const candidate of candidates) {
        outgoing.set(candidate.id, new Set());
        incomingCount.set(candidate.id, 0);
    }

    let hasHeadPriority = false;
    const addBackToFrontEdge = (behindId: string, frontId: string): void => {
        const edges = outgoing.get(behindId);
        if (!edges || edges.has(frontId)) return;
        edges.add(frontId);
        incomingCount.set(frontId, (incomingCount.get(frontId) ?? 0) + 1);
        hasHeadPriority = true;
    };

    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
        const left = candidates[leftIndex];
        for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
            const right = candidates[rightIndex];
            const leftHeadTouchesRight = meaningfullyIntersects(left.headZone, right.bounds);
            const rightHeadTouchesLeft = meaningfullyIntersects(right.headZone, left.bounds);

            // When both head zones meet, neither face is uniquely threatened; preserve ground-line depth.
            if (leftHeadTouchesRight === rightHeadTouchesLeft) continue;
            if (leftHeadTouchesRight) {
                addBackToFrontEdge(right.id, left.id);
            } else {
                addBackToFrontEdge(left.id, right.id);
            }
        }
    }

    if (!hasHeadPriority) return new Map();

    const remaining = new Set(candidates.map((candidate) => candidate.id));
    const ordered: CreatureDepthSortCandidate[] = [];
    while (remaining.size) {
        const available = [...remaining]
            .filter((id) => (incomingCount.get(id) ?? 0) === 0)
            .map((id) => byId.get(id))
            .filter((candidate): candidate is CreatureDepthSortCandidate => !!candidate)
            .sort(byNaturalDepth);
        // A rare three-way cycle means every head is involved. Break it by the original depth rather
        // than allowing an unstable frame-to-frame order.
        const next = available[0] ?? [...remaining].map((id) => byId.get(id)!).sort(byNaturalDepth)[0];
        remaining.delete(next.id);
        ordered.push(next);
        for (const frontId of outgoing.get(next.id) ?? []) {
            incomingCount.set(frontId, Math.max(0, (incomingCount.get(frontId) ?? 0) - 1));
        }
    }

    const resolved = new Map<string, number>();
    let previousDepth = Number.NEGATIVE_INFINITY;
    for (const candidate of ordered) {
        const depth = Math.max(candidate.baseDepth, previousDepth + DEPTH_EPSILON);
        resolved.set(candidate.id, depth);
        previousDepth = depth;
    }
    return resolved;
};
