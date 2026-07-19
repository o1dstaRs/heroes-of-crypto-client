import { describe, expect, test } from "bun:test";

import { getMountainHitBarLayout } from "./DungeonVisuals";

describe("mountain HP bar layout", () => {
    test.each([48, 96, 165])("stays inside the mountain base at a %ipx cell size", (cellSize) => {
        const layout = getMountainHitBarLayout(cellSize);
        const framedBottom = layout.centerOffset + layout.height / 2 + layout.framePadding;

        expect(layout.width).toBeLessThanOrEqual(cellSize * 1.12);
        expect(framedBottom).toBeLessThanOrEqual(cellSize * 0.9);
        expect(layout.gap).toBeGreaterThan(0);
        expect(layout.height).toBeGreaterThan(0);
    });
});
