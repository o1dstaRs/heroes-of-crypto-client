import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { type MeshGeometry } from "pixi.js";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

const SUBDIVISIONS = 24;

export interface RotatingAuraProjection {
    positions: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
    layout: string;
    /** Keep the original double precision until the final UV write, as in the authored projection. */
    offsets: Float64Array;
}

/** Rotation changes texture coordinates, never the clipped floor or its triangulation. */
export function rotatingAuraProjection(
    center: HoCMath.XY,
    rx: number,
    ry: number,
    rotation: number,
    gs: GridSettings,
    narrowing: number,
    extent: number,
    textureRadius: number,
    previous?: RotatingAuraProjection,
): RotatingAuraProjection | undefined {
    if (!(rx > 0 && ry > 0)) return;
    const inset = Math.max(0, narrowing) * gs.getCellSize();
    const left = Math.max(center.x - rx * extent, gs.getMinX() + inset);
    const right = Math.min(center.x + rx * extent, gs.getMaxX() - inset);
    const bottom = Math.max(center.y - ry * extent, gs.getMinY() + inset);
    const top = Math.min(center.y + ry * extent, gs.getMaxY() - inset);
    if (right <= left || top <= bottom) return;
    const layout = `${center.x}:${center.y}:${rx}:${ry}:${left}:${right}:${bottom}:${top}:${gs.getMinX()}:${gs.getMaxX()}:${gs.getMinY()}:${gs.getMaxY()}`;
    let projection = previous;
    if (!projection || projection.layout !== layout) {
        const size = (SUBDIVISIONS + 1) ** 2 * 2;
        projection = {
            layout,
            positions: new Float32Array(size),
            uvs: new Float32Array(size),
            offsets: new Float64Array(size),
            indices: new Uint32Array(SUBDIVISIONS ** 2 * 6),
        };
        const point = { x: 0, y: 0 };
        const projected = { x: 0, y: 0 };
        let vertex = 0;
        let index = 0;
        for (let row = 0; row <= SUBDIVISIONS; row++) {
            for (let col = 0; col <= SUBDIVISIONS; col++) {
                point.x = left + ((right - left) * col) / SUBDIVISIONS;
                point.y = top - ((top - bottom) * row) / SUBDIVISIONS;
                projectBattlefieldPoint(point, gs, projected);
                projection.positions[vertex] = projected.x;
                projection.positions[vertex + 1] = projected.y;
                projection.offsets[vertex] = (point.x - center.x) / rx;
                projection.offsets[vertex + 1] = (point.y - center.y) / ry;
                vertex += 2;
                if (row < SUBDIVISIONS && col < SUBDIVISIONS) {
                    const a = row * (SUBDIVISIONS + 1) + col;
                    const b = a + SUBDIVISIONS + 1;
                    projection.indices.set([a, b, a + 1, a + 1, b, b + 1], index);
                    index += 6;
                }
            }
        }
    }
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (let i = 0; i < projection.uvs.length; i += 2) {
        const dx = projection.offsets[i];
        const dy = projection.offsets[i + 1];
        projection.uvs[i] = 0.5 + (cos * dx + sin * dy) * textureRadius;
        projection.uvs[i + 1] = 0.5 - (-sin * dx + cos * dy) * textureRadius;
    }
    return projection;
}

/** The UV array is updated in place; position/index buffers only change with the footprint. */
export function syncRotatingAuraGeometry(geometry: MeshGeometry, projection: RotatingAuraProjection): void {
    if (geometry.positions !== projection.positions) geometry.positions = projection.positions;
    if (geometry.indices !== projection.indices) geometry.indices = projection.indices;
    if (geometry.uvs !== projection.uvs) geometry.uvs = projection.uvs;
    else geometry.getBuffer("aUV").update();
}
