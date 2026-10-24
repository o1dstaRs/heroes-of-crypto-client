import { expect, test, mock, beforeAll, afterAll } from "bun:test";
import { DOMAdapter, Mesh, type MeshGeometry, type Shader } from "pixi.js";
import { SmokeCloudLayer } from "./SmokeCloudLayer";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("terrain smoke persists, reuses projection, survives recast and releases owned resources", () => {
    const layer = new SmokeCloudLayer();
    const root = layer.getContainer();
    const project = mock(({ x, y }: { x: number; y: number }) => ({ x: x * 64, y: y * 64 }));
    const cells = [{ x: 2, y: 3, l: 3 }];
    layer.update(1 / 240, [], 64, project);
    expect(root.children).toHaveLength(0);
    layer.update(0.25, cells, 64, project);
    const cloud = root.children[0] as Mesh<MeshGeometry, Shader>;
    expect(root.filters?.length ?? 0).toBe(0);
    expect(cloud.shader!.resources.smoke.uniforms.uPresence).toBe(1);
    for (let i = 0; i < 60; i++) layer.update(1 / 240, cells, 64, project);
    expect(project).toHaveBeenCalledTimes(1);
    layer.update(1 / 240, cells, 80, project);
    expect(project).toHaveBeenCalledTimes(2);
    layer.update(0.05, [], 80, project);
    expect(root.children).toHaveLength(1);
    layer.update(0.05, cells, 80, project);
    expect(root.children[0]).toBe(cloud);
    layer.update(0.25, [{ ...cells[0], l: 1 }], 80, project);
    expect(cloud.shader!.resources.smoke.uniforms.uPresence).toBeCloseTo(0.62);
    layer.update(0.25, [], 80, project);
    expect(root.children).toHaveLength(0);
    expect(cloud.destroyed).toBe(true);
    layer.update(0.25, cells, 80, project);
    const shader = (root.children[0] as Mesh<MeshGeometry, Shader>).shader!;
    const destroy = mock(shader.destroy.bind(shader));
    shader.destroy = destroy;
    root.destroy({ children: true });
    expect(destroy).toHaveBeenCalledTimes(1);
    layer.destroy();
    layer.update(0.25, cells, 80, project);
    expect(destroy).toHaveBeenCalledTimes(1);
});

test("neighbouring smoke cells retain their original volumes and fade independently", () => {
    const layer = new SmokeCloudLayer(),
        root = layer.getContainer();
    const project = ({ x, y }: { x: number; y: number }) => ({ x: x * 64, y: y * 64 });
    const cells = [
        { x: 1, y: 1, l: 3 },
        { x: 2, y: 1, l: 3 },
        { x: 3, y: 1, l: 3 },
    ];
    layer.update(0.25, cells, 64, project);
    expect(root.children).toHaveLength(3);
    const [left, middle, right] = [...root.children];
    layer.update(0.05, [cells[0], cells[2]], 64, project);
    expect(root.children).toHaveLength(3);
    layer.update(0.25, [cells[0], cells[2]], 64, project);
    expect(root.children).toEqual([left, right]);
    expect(middle.destroyed).toBe(true);
    layer.destroy();
});
