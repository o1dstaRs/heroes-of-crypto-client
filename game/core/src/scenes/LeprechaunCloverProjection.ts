import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { whiteTigerPawProjection } from "./WhiteTigerPawAura";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

/** Seam clovers and a closed interior glow surface; never changes factual range bounds. */
export function leprechaunCloverProjection(
    center: HoCMath.XY,
    footprint: { width: number; height: number },
    range: number,
    gs: GridSettings,
    narrowing = 0,
) {
    const ribbon = whiteTigerPawProjection(center, footprint, range, gs, narrowing);
    if (!ribbon) return undefined;
    const { left, right, bottom, top } = ribbon.bounds;
    const cell = gs.getCellSize();
    const corners = [
        { x: left, y: bottom },
        { x: right, y: bottom },
        { x: right, y: top },
        { x: left, y: top },
    ];
    const anchors: HoCMath.XY[] = [];
    let vertex = 0;
    for (let edge = 0; edge < 4; edge++) {
        const p = corners[edge],
            q = corners[(edge + 1) % 4];
        const horizontal = edge % 2 === 0;
        // Keep the material attached to the owner, not the stationary board grid.
        // Use the unclipped origin so board-edge cropping never rephases the clovers.
        const origin = horizontal
            ? center.x - (range + footprint.width / 2) * cell
            : center.y - (range + footprint.height / 2) * cell;
        const start = horizontal ? p.x : p.y;
        const end = horizontal ? q.x : q.y;
        const count = Math.ceil((Math.abs(end - start) / cell) * 16);
        // At rest these local half-cell offsets sit at the centres of cell seams.
        for (let i = 0; i <= count; i++) {
            const coordinate = (start + ((end - start) * i) / count - origin) / cell;
            for (let side = 0; side < 2; side++) ribbon.uvs[vertex++ * 2] = coordinate;
        }
        const low = (Math.min(start, end) - origin) / cell;
        const high = (Math.max(start, end) - origin) / cell;
        for (let k = Math.ceil(low - 0.5); k + 0.5 < high; k++) {
            const coordinate = origin + (k + 0.5) * cell;
            anchors.push(horizontal ? { x: coordinate, y: p.y } : { x: p.x, y: coordinate });
        }
    }
    const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
    // Closed concentric contours connect the entire perimeter to the owner.
    // UV.x wraps once around the contour; UV.y increases inward, including on clipped boards.
    const segmentsPerEdge = 16;
    const segments = segmentsPerEdge * 4;
    const rings = 24;
    for (let ring = 0; ring <= rings; ring++) {
        const travel = ring / rings;
        for (let segment = 0; segment <= segments; segment++) {
            const edge = Math.min(3, Math.floor(segment / segmentsPerEdge));
            const along = (segment - edge * segmentsPerEdge) / segmentsPerEdge;
            const p = corners[edge],
                q = corners[(edge + 1) % 4];
            const source = { x: p.x + (q.x - p.x) * along, y: p.y + (q.y - p.y) * along };
            const point = projectBattlefieldPoint(
                {
                    x: source.x + (center.x - source.x) * travel,
                    y: source.y + (center.y - source.y) * travel,
                },
                gs,
            );
            positions.push(point.x, point.y);
            uvs.push(segment / segments, travel);
            if (ring < rings && segment < segments) {
                const a = ring * (segments + 1) + segment;
                const b = a + segments + 1;
                indices.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
    }
    return {
        ribbon,
        anchors,
        glow: {
            positions: new Float32Array(positions),
            uvs: new Float32Array(uvs),
            indices: new Uint32Array(indices),
        },
    };
}
