import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

type Vertex = { x: number; y: number; u: number; v: number };

/** Wrist on the marked foot line, with the complete hand pointing down and right. */
export function abominationHandPoint(
    center: HoCMath.XY,
    footprint: { width: number; height: number },
    range: number,
    cell: number,
    u: number,
    v: number,
): HoCMath.XY {
    const dx = (u - 284 / 512) * (range + footprint.width / 2) * cell;
    const dy = (v - 470 / 512) * (range + footprint.height / 2) * cell;
    const angle = (135 * Math.PI) / 180;
    return {
        x: center.x + 0.15 * cell + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: center.y - 0.25 * cell - dx * Math.sin(angle) - dy * Math.cos(angle),
    };
}

/** Clip rotated floor quads only at the playable board boundary, retaining their original UVs. */
export function abominationHandProjection(
    center: HoCMath.XY,
    footprint: { width: number; height: number },
    range: number,
    gs: GridSettings,
    narrowing = 0,
) {
    const cell = gs.getCellSize();
    const inset = Math.max(0, narrowing) * cell;
    const planes = [
        (p: Vertex) => p.x - gs.getMinX() - inset,
        (p: Vertex) => gs.getMaxX() - inset - p.x,
        (p: Vertex) => p.y - gs.getMinY() - inset,
        (p: Vertex) => gs.getMaxY() - inset - p.y,
    ];
    const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
    const steps = 8;
    for (let row = 0; row < steps; row++) {
        for (let col = 0; col < steps; col++) {
            let polygon: Vertex[] = [
                [col, row],
                [col + 1, row],
                [col + 1, row + 1],
                [col, row + 1],
            ].map(([x, y]) => {
                const u = x / steps,
                    v = y / steps;
                return { ...abominationHandPoint(center, footprint, range, cell, u, v), u, v };
            });
            for (const distance of planes) {
                const clipped: Vertex[] = [];
                for (let i = 0; i < polygon.length; i++) {
                    const a = polygon[i],
                        b = polygon[(i + 1) % polygon.length];
                    const da = distance(a),
                        db = distance(b);
                    if (da >= 0) clipped.push(a);
                    if (da >= 0 !== db >= 0) {
                        const t = da / (da - db);
                        clipped.push({
                            x: a.x + (b.x - a.x) * t,
                            y: a.y + (b.y - a.y) * t,
                            u: a.u + (b.u - a.u) * t,
                            v: a.v + (b.v - a.v) * t,
                        });
                    }
                }
                polygon = clipped;
            }
            if (polygon.length < 3) continue;
            const base = positions.length / 2;
            for (const vertex of polygon) {
                const p = projectBattlefieldPoint(vertex, gs);
                positions.push(p.x, p.y);
                uvs.push(vertex.u, vertex.v);
            }
            for (let i = 1; i < polygon.length - 1; i++) indices.push(base, base + i, base + i + 1);
        }
    }
    if (!indices.length) return undefined;
    return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}
