// Visible alpha bounds of the approved source-exact 768px walk cels.
// The static battlefield figure spans y=233..702. Match the visible height,
// preserve proportions, and keep the same gap between the feet and board anchor.
const WALK_HEIGHTS = [447, 447, 465, 462, 462, 456, 462, 468] as const;
const WALK_BOTTOMS = [681, 684, 693, 687, 696, 690, 690, 702] as const;

export function arachnaQueenLabWalkScale(frameIndex: number): number {
    return 469 / (WALK_HEIGHTS[frameIndex] ?? WALK_HEIGHTS[0]);
}

export function arachnaQueenLabWalkAnchorY(frameIndex: number, idleAnchorY: number): number {
    const idleBottomPadding = idleAnchorY * 768 - 702;
    return (
        ((WALK_BOTTOMS[frameIndex] ?? WALK_BOTTOMS[0]) + idleBottomPadding / arachnaQueenLabWalkScale(frameIndex)) / 768
    );
}
