import { expect, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { auraProjectionWithoutOwner } from "./AuraOwnerFootprint";
import { arachnaWebBounds } from "./ArachnaQueenWebAura";
const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const footprint = { width: 2, height: 2 };

test("the occupied 2x2 cells contain no aura triangles, including clipping, movement and boosted range", () => {
    const cell = gs.getCellSize();
    for (const offset of [1, 1.4, 8]) {
        const owner = { x: gs.getMinX() + offset * cell, y: gs.getMinY() + offset * cell };
        for (const range of [2, 3]) {
            const p = auraProjectionWithoutOwner(owner, footprint, range, gs)!;
            const span = 2 * range + 2;
            const low = 0.5 - 1 / span,
                high = 0.5 + 1 / span;
            let area = 0;
            for (let i = 0; i < p.indices.length; i += 3) {
                const [a, b, c] = [...p.indices.slice(i, i + 3)].map((index) => [
                    p.uvs[index * 2],
                    p.uvs[index * 2 + 1],
                ]);
                const triangleArea = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
                area += triangleArea;
                if (triangleArea < 1e-10) continue;
                const us = [a[0], b[0], c[0]],
                    vs = [a[1], b[1], c[1]];
                expect(
                    Math.max(...us) <= low + 1e-6 ||
                        Math.min(...us) >= high - 1e-6 ||
                        Math.max(...vs) <= low + 1e-6 ||
                        Math.min(...vs) >= high - 1e-6,
                ).toBe(true);
            }
            const bounds = arachnaWebBounds(owner, footprint, range, gs)!;
            const fullArea = ((bounds.right - bounds.left) * (bounds.top - bounds.bottom)) / cell ** 2;
            expect(area * span ** 2).toBeCloseTo(fullArea - 4, 4);
        }
    }
});
