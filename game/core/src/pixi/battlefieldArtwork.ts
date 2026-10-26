/** Authored illustration geometry, shared by camera and painting. Engine cells remain a regular square grid. */
export const BATTLEFIELD_ARTWORK = Object.freeze({
    width: 1576,
    height: 1378,
    field: Object.freeze({
        topLeft: Object.freeze({ x: 205, y: 329 }),
        topRight: Object.freeze({ x: 1293, y: 329 }),
        bottomRight: Object.freeze({ x: 1561, y: 1342 }),
        bottomLeft: Object.freeze({ x: 12, y: 1342 }),
    }),
});

/** Narrow bleed removes the bitmap's rounded dark edge from the combat frame. */
export const BATTLEFIELD_HORIZONTAL_OVERSCAN = 1.03;
export const BATTLEFIELD_HORIZONTAL_BIAS = 0.011;
