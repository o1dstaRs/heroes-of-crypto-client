import { describe, expect, test } from "bun:test";

import { FireWallLayer } from "./FireWallLayer";

interface FireWallLayerInternals {
    time: number;
}

describe("fire wall idle work", () => {
    test("does not advance or project cells before a wall exists", () => {
        const layer = new FireWallLayer();
        const internals = layer as unknown as FireWallLayerInternals;
        let projectionCalls = 0;

        layer.update(1 / 60, [], 64, () => {
            projectionCalls += 1;
            return { x: 0, y: 0 };
        });

        expect(internals.time).toBe(0);
        expect(projectionCalls).toBe(0);
        layer.destroy();
    });

    test("reuses stable cell projections between animation frames", () => {
        const layer = new FireWallLayer();
        let projectionCalls = 0;
        const toWorld = ({ x, y }: { x: number; y: number }) => {
            projectionCalls += 1;
            return { x: x * 64, y: y * 64, cellSize: 60 };
        };
        const cells = [{ x: 3, y: 4, l: 2 }];

        layer.update(1 / 60, cells, 64, toWorld);
        layer.update(1 / 60, cells, 64, toWorld);
        expect(projectionCalls).toBe(1);

        layer.update(1 / 60, cells, 72, toWorld);
        expect(projectionCalls).toBe(2);
        layer.destroy();
    });
});
