import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DOMAdapter } from "pixi.js";

import { SmokeCloudLayer } from "./SmokeCloudLayer";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

describe("smoke cloud projection work", () => {
    test("reuses stable cell projections between animation frames", () => {
        const layer = new SmokeCloudLayer();
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
