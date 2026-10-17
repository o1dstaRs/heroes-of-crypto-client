// The neutral bookends contain the actual 768px idle-atlas figure at this exact raster placement.
// Expanded transparent space lets the wings articulate without changing the creature's scale.
export const PEGASUS_FLIGHT_SOURCE_SIZE = 538;
export const PEGASUS_FLIGHT_SOURCE_X = 310;
export const PEGASUS_FLIGHT_SOURCE_Y = 390;
export const PEGASUS_FLIGHT_SCALE = 1024 / PEGASUS_FLIGHT_SOURCE_SIZE;
export const PEGASUS_FLIGHT_ANCHOR_X = (PEGASUS_FLIGHT_SOURCE_X + PEGASUS_FLIGHT_SOURCE_SIZE / 2) / 1024;

export function pegasusFlightAnchorY(sourceAnchorY: number): number {
    return (PEGASUS_FLIGHT_SOURCE_Y + PEGASUS_FLIGHT_SOURCE_SIZE * sourceAnchorY) / 1024;
}

// Griffin's approved default takeoff/landing cadence; its personal sliders remain independent.
export const PEGASUS_FLIGHT_TRANSITION_SPEED = 1.3 * 1.15 * 1.2 * 1.2;
