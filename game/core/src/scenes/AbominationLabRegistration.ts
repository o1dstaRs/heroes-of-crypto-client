// Alpha > 32 bounds measured from the approved native 768px sprites.
// Fit the walking poses to the same visible height and foot line as the painted neutral figure.
const WALK_HEIGHTS = [693, 669, 666, 678, 669, 675, 681, 690] as const;
const WALK_BOTTOMS = [728, 722, 716, 713, 716, 728, 731, 728] as const;
const IDLE_HEIGHT = 708;
const IDLE_BOTTOM = 737;

export function abominationLabWalkScale(frameIndex: number): number {
    return IDLE_HEIGHT / (WALK_HEIGHTS[frameIndex] ?? WALK_HEIGHTS[0]);
}

export function abominationLabWalkAnchorY(frameIndex: number, idleAnchorY: number): number {
    const idleFootPadding = idleAnchorY * 768 - IDLE_BOTTOM;
    return (
        ((WALK_BOTTOMS[frameIndex] ?? WALK_BOTTOMS[0]) + idleFootPadding / abominationLabWalkScale(frameIndex)) / 768
    );
}
