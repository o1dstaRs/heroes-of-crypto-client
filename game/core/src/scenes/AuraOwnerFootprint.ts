import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { arachnaWebBounds } from "./ArachnaQueenWebAura";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

/** Keep a precise, unpainted hole over the owner's occupied cells, before floor projection. */
export function auraProjectionWithoutOwner(
    center: HoCMath.XY,
    footprint: { width: number; height: number },
    range: number,
    gs: GridSettings,
    narrowing = 0,
) {
    const bounds = arachnaWebBounds(center, footprint, range, gs, narrowing);
    if (!bounds) return undefined;
    const cell = gs.getCellSize();
    const halfWidth = (footprint.width * cell) / 2;
    const halfHeight = (footprint.height * cell) / 2;
    const width = (2 * range + footprint.width) * cell;
    const height = (2 * range + footprint.height) * cell;
    const axis = (min: number, max: number, low: number, high: number) =>
        [...Array.from({ length: 17 }, (_, i) => min + ((max - min) * i) / 16), low, high]
            .map((value) => Math.max(min, Math.min(max, value)))
            .sort((a, b) => a - b);
    const xs = axis(bounds.left, bounds.right, center.x - halfWidth, center.x + halfWidth);
    const ys = axis(bounds.bottom, bounds.top, center.y - halfHeight, center.y + halfHeight).reverse();
    const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
    for (let row = 0; row < ys.length; row++) {
        for (let col = 0; col < xs.length; col++) {
            const point = projectBattlefieldPoint({ x: xs[col], y: ys[row] }, gs);
            positions.push(point.x, point.y);
            uvs.push((xs[col] - center.x) / width + 0.5, (center.y - ys[row]) / height + 0.5);
            if (row === ys.length - 1 || col === xs.length - 1) continue;
            const a = row * xs.length + col,
                b = a + xs.length;
            const inside =
                Math.abs((xs[col] + xs[col + 1]) / 2 - center.x) < halfWidth &&
                Math.abs((ys[row] + ys[row + 1]) / 2 - center.y) < halfHeight;
            // Degenerate triangles keep buffer sizes stable when moving or clipping at the board edge.
            indices.push(...(inside ? [a, a, a, a, a, a] : [a, b, a + 1, a + 1, b, b + 1]));
        }
    }
    return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}
