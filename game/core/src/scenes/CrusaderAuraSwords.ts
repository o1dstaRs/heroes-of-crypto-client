import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { earcut } from "pixi.js";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

// Shared painted scale only; never feed this into the factual range boundary.
const VISUAL_ENLARGEMENT = 1.05;
export const CRUSADER_AURA_ARTWORK_SCALE = 1.1 * 1.05 * VISUAL_ENLARGEMENT;
export const CRUSADER_SWORD_VARIANT_OFFSET_PX = 340;

// The isolated passive-icon sword occupies one rectangle. Shader padding expands
// only the transparent sampling area, keeping the original sword registration.
// Opposite directions sample the same cutout; adjacent directions alternate variants.
const OUTLINE = [
    [510, 615],
    [510, 74],
    [744, 74],
    [744, 615],
];
type Vertex = { x: number; y: number; u: number; v: number };

/** Fixed close hilt distance; rotation never animates radial distance. */
export function crusaderSwordClearance(footprint: { width: number; height: number }, cell: number): number {
    return Math.min(footprint.width, footprint.height) * 0.2 * cell;
}

export function crusaderSwordPolygons(
    center: HoCMath.XY,
    footprint: { width: number; height: number },
    range: number,
    rotation: number,
    cell: number,
    padding = 0,
): Vertex[][] {
    const clearance = crusaderSwordClearance(footprint, cell);
    const sx = ((range + footprint.width / 2 - 0.055) * cell * CRUSADER_AURA_ARTWORK_SCALE) / 627;
    const sy = ((range + footprint.height / 2 - 0.055) * cell * CRUSADER_AURA_ARTWORK_SCALE) / 627;
    return Array.from({ length: 4 }, (_, i) => {
        const q = (i * Math.PI) / 2;
        const cos = Math.cos(rotation - q);
        const sin = Math.sin(rotation - q);
        return OUTLINE.map(([sourceX, sourceY]) => {
            const px = sourceX + (sourceX < 627 ? -padding : padding);
            const py = sourceY + (sourceY < 345 ? -padding : padding);
            const dx = px - 627;
            const dy = py - 615;
            const x = dx * sx;
            const y = -dy * sy + clearance;
            return {
                x: center.x + cos * x - sin * y,
                y: center.y + sin * x + cos * y,
                // Two source cutouts share the right atlas panel. This UV-only
                // offset never changes the sword's world position or dimensions.
                u: 0.5 + (px + (i % 2) * CRUSADER_SWORD_VARIANT_OFFSET_PX) / 2508,
                v: py / 1254,
            };
        });
    });
}

function clip(poly: Vertex[], axis: "x" | "y", edge: number, sign: number): Vertex[] {
    const out: Vertex[] = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const insideA = (a[axis] - edge) * sign >= 0;
        const insideB = (b[axis] - edge) * sign >= 0;
        if (insideA) out.push(a);
        if (insideA !== insideB) {
            const t = (edge - a[axis]) / (b[axis] - a[axis]);
            out.push({
                x: a.x + (b.x - a.x) * t,
                y: a.y + (b.y - a.y) * t,
                u: a.u + (b.u - a.u) * t,
                v: a.v + (b.v - a.v) * t,
            });
        }
    }
    return out;
}

export function crusaderSwordGeometry(
    center: HoCMath.XY,
    footprint: { width: number; height: number },
    range: number,
    rotation: number,
    gs: GridSettings,
    narrowing: number,
    padding = 0,
) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const inset = Math.max(0, narrowing) * gs.getCellSize();
    for (let poly of crusaderSwordPolygons(center, footprint, range, rotation, gs.getCellSize(), padding)) {
        poly = clip(poly, "x", gs.getMinX() + inset, 1);
        poly = clip(poly, "x", gs.getMaxX() - inset, -1);
        poly = clip(poly, "y", gs.getMinY() + inset, 1);
        poly = clip(poly, "y", gs.getMaxY() - inset, -1);
        if (poly.length < 3) continue;
        const offset = positions.length / 2;
        const flat = poly.flatMap((p) => [p.x, p.y]);
        indices.push(...earcut(flat).map((index: number) => index + offset));
        for (const p of poly) {
            const projected = projectBattlefieldPoint(p, gs);
            positions.push(projected.x, projected.y);
            uvs.push(p.u, p.v);
        }
    }
    return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}
