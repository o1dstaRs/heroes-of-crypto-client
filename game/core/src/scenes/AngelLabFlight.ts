// The approved neutral cel is a similarity transform of the 768px battlefield source.
// Its manually registered chin/belt separation is (6, 103) on a 384px reference.
export const ANGEL_LAB_SOURCE_SCALE = 170 / Math.hypot(6, 103) / 2;
export const ANGEL_LAB_OFFSET_X = 610 - 440 * ANGEL_LAB_SOURCE_SCALE;
export const ANGEL_LAB_OFFSET_Y = 930 - 734 * ANGEL_LAB_SOURCE_SCALE;
export const ANGEL_LAB_FLIGHT_CANVAS_SCALE = 1024 / (768 * ANGEL_LAB_SOURCE_SCALE);
export const ANGEL_LAB_FLIGHT_ANCHOR_X = (ANGEL_LAB_OFFSET_X + 384 * ANGEL_LAB_SOURCE_SCALE) / 1024;

export function angelLabFlightAnchorY(idleAnchorY: number): number {
    return (ANGEL_LAB_OFFSET_Y + 768 * ANGEL_LAB_SOURCE_SCALE * idleAnchorY) / 1024;
}
