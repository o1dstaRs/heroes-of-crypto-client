import { type HoCMath } from "@heroesofcrypto/common";

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
