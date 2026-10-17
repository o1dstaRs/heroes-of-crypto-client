import { expect, test } from "bun:test";
import { findOpaqueGripPoint } from "./CastlingGripPoint";

function silhouette(rectangles: number[][]) {
    const data = new Uint8ClampedArray(128 * 128 * 4);
    for (const [left, top, right, bottom] of rectangles)
        for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) data[(y * 128 + x) * 4 + 3] = 255;
    return data;
}
test("low body is gripped inside its back despite large transparent padding", () => {
    const data = silhouette([
        [14, 78, 110, 100],
        [26, 98, 34, 120],
        [92, 98, 100, 120],
    ]);
    const p = findOpaqueGripPoint(data, 128, 128)!;
    expect(p.x).toBeGreaterThan(50);
    expect(p.x).toBeLessThan(75);
    expect(p.y).toBeGreaterThan(78);
    expect(p.y).toBeLessThan(84);
    expect(data[(Math.floor(p.y) * 128 + Math.floor(p.x)) * 4 + 3]).toBe(255);
});
test("upright body is gripped below the head", () => {
    const p = findOpaqueGripPoint(
        silhouette([
            [52, 10, 76, 34],
            [40, 34, 88, 90],
            [48, 90, 80, 120],
        ]),
        128,
        128,
    )!;
    expect(p.y).toBeGreaterThan(29);
    expect(p.y).toBeLessThan(37);
});
test("empty image has no false contact", () => {
    expect(findOpaqueGripPoint(silhouette([]), 128, 128)).toBeUndefined();
});
