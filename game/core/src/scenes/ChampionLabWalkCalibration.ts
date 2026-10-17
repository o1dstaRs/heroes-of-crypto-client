// Opaque silhouette bounds (alpha >= 128) in the 768px detailed walk cels.
// Match champion_battlefield_side_right_distance_readable_v2's 683x617px idle
// silhouette, including its bottom padding, without changing the gait cadence.
const WALK_VISIBLE_HEIGHTS = [609, 609, 603, 597, 603, 603, 606, 600] as const;
const WALK_VISIBLE_WIDTHS = [654, 669, 681, 669, 654, 654, 663, 654] as const;
const WALK_BOTTOMS = [696, 696, 696, 696, 696, 690, 696, 696] as const;

export function championLabWalkHeightScale(frameIndex: number): number {
    return 617 / (WALK_VISIBLE_HEIGHTS[frameIndex] ?? WALK_VISIBLE_HEIGHTS[0]);
}

export function championLabWalkWidthScale(frameIndex: number): number {
    return 683 / (WALK_VISIBLE_WIDTHS[frameIndex] ?? WALK_VISIBLE_WIDTHS[0]);
}

export function championLabWalkAnchorY(frameIndex: number, idleAnchorY: number): number {
    const idleBottomPadding = idleAnchorY * 768 - 698;
    return (
        ((WALK_BOTTOMS[frameIndex] ?? WALK_BOTTOMS[0]) + idleBottomPadding / championLabWalkHeightScale(frameIndex)) /
        768
    );
}
