// The canonical 768px figure is rasterized to 538px at (286, 340) in a 1024px flight cel.
// Register the source centre and feet, not the changing wing bounding box.
export const THUNDERBIRD_LAB_SOURCE_SIZE = 538;
export const THUNDERBIRD_LAB_SOURCE_X = 286;
export const THUNDERBIRD_LAB_SOURCE_Y = 340;
export const THUNDERBIRD_LAB_FLIGHT_CANVAS_SCALE = 1024 / THUNDERBIRD_LAB_SOURCE_SIZE;
// Match Wyvern's authored phase playback correction for the legacy 1/240 simulation step.
export const THUNDERBIRD_LAB_TRANSITION_SPEED = 1.35 * 1.15;
export const THUNDERBIRD_LAB_FLIGHT_ANCHOR_X = (THUNDERBIRD_LAB_SOURCE_X + THUNDERBIRD_LAB_SOURCE_SIZE / 2) / 1024;

export function thunderbirdLabFlightAnchorY(idleAnchorY: number): number {
    return (THUNDERBIRD_LAB_SOURCE_Y + THUNDERBIRD_LAB_SOURCE_SIZE * idleAnchorY) / 1024;
}
