// The canonical 768px figure sits at (232, 384) on a 1152px master, reduced to 768px.
// Register the padded wing canvas around the original figure, preserving its board size.
export const MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE = 1.5;
export const MAGIC_DRAGON_LAB_FLIGHT_ANCHOR_X = (232 + 384) / 1152;
// Play the pinned-paw idle 22% faster without changing its authored geometry.
export const MAGIC_DRAGON_LAB_IDLE_SPEED = 1.22;
// Additional 15% take-off/landing speed; the distance-driven flight loop is unchanged.
export const MAGIC_DRAGON_LAB_TRANSITION_SPEED = 1.35 * 1.15 * 1.15;

export function magicDragonLabFlightAnchorY(idleAnchorY: number): number {
    return (384 + 768 * idleAnchorY) / 1152;
}
