// The source 768px figure is placed at (300, 350), scaled to 75%, in a 1024px cel.
// Compensate the padded wing canvas without resizing the creature during transitions.
export const BLACK_DRAGON_LAB_FLIGHT_CANVAS_SCALE = 1024 / (768 * 0.75);
export const BLACK_DRAGON_LAB_FLIGHT_ANCHOR_X = (300 + 384 * 0.75) / 1024;
export const BLACK_DRAGON_LAB_TRANSITION_SPEED = 1.35 * 1.15 * 1.22;

export function blackDragonLabFlightAnchorY(idleAnchorY: number): number {
    return (350 + 768 * 0.75 * idleAnchorY) / 1024;
}
