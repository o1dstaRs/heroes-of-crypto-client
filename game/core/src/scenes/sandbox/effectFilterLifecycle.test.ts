import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { DOMAdapter, Mesh, type MeshGeometry, type Shader } from "pixi.js";

import { SmokeCloudLayer } from "./SmokeCloudLayer";
import { WindLayer } from "./WindLayer";

test.each([["wind", () => new WindLayer()]])(
    "%s filter stays unallocated while the effect is idle",
    (_name, createLayer) => {
        const layer = createLayer();
        const internals = layer as unknown as { filter?: unknown };

        expect(internals.filter).toBeUndefined();
        layer.getContainer().destroy({ children: true });
    },
);

test.each([["wind", () => new WindLayer()]])(
    "%s filter is released when the scene destroys its container",
    (_name, createLayer) => {
        const layer = createLayer();
        const internals = layer as unknown as { filter?: { destroy(): void } };
        internals.filter?.destroy();
        let destroyCalls = 0;
        internals.filter = { destroy: () => destroyCalls++ };

        layer.getContainer().destroy({ children: true });

        expect(destroyCalls).toBe(1);
        expect(internals.filter).toBeUndefined();
    },
);

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("smoke cloud meshes stay unallocated while the effect is idle", () => {
    const layer = new SmokeCloudLayer();
    expect(layer.getContainer().children).toHaveLength(0);
    layer.getContainer().destroy({ children: true });
});

test("smoke cloud shader and geometry are released when the scene destroys its container", () => {
    const layer = new SmokeCloudLayer();
    const root = layer.getContainer();
    layer.update(0.25, [{ x: 2, y: 3, l: 3 }], 64, ({ x, y }) => ({ x: x * 64, y: y * 64 }));
    const cloud = root.children[0] as Mesh<MeshGeometry, Shader>;
    const shaderDestroy = spyOn(cloud.shader!, "destroy");
    const geometryDestroy = spyOn(cloud.geometry, "destroy");
    root.destroy({ children: true });
    expect(cloud.destroyed).toBe(true);
    expect(shaderDestroy).toHaveBeenCalledTimes(1);
    expect(geometryDestroy).toHaveBeenCalledTimes(1);
    layer.destroy();
    expect(shaderDestroy).toHaveBeenCalledTimes(1);
    expect(geometryDestroy).toHaveBeenCalledTimes(1);
});
