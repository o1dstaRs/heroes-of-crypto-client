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
});
