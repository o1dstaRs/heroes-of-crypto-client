import { afterAll, beforeAll, expect, test } from "bun:test";
import { Container, DOMAdapter, Geometry, Mesh, Shader } from "pixi.js";
import { CyclopsStoneFracture } from "./CyclopsStoneFracture";
import { createStoneFragments, stoneFragmentPose, CYCLOPS_FRACTURE_LIFE_MS } from "./CyclopsFracturePhysics";
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("fracture stays inside three floor cells, bounces, then settles deterministically", () => {
    for (const seed of [1, 7919, 92019]) {
        const fragments = createStoneFragments(seed);
        expect(createStoneFragments(seed)).toEqual(fragments);
        for (const fragment of fragments) {
            let bounceSeen = false;
            for (let ms = 0; ms < 1850; ms += 13) {
                const p = stoneFragmentPose(fragment, ms / 1000);
                expect([p.x, p.y, p.z, ...p.rotation].every(Number.isFinite)).toBe(true);
                expect(p.z).toBeGreaterThanOrEqual(fragment.size * 0.55);
                expect(Math.hypot(p.x, p.y) + fragment.size * 1.5).toBeLessThanOrEqual(1.500001);
                bounceSeen ||= p.bounces > 0;
            }
            expect(bounceSeen).toBe(true);
            expect(stoneFragmentPose(fragment, 1.8).z).toBeCloseTo(fragment.size * 0.55, 6);
        }
    }
});
test("engine effect reuses GPU buffers, expires, caps simultaneous bursts and cleans reset resources", () => {
    const world = new Container();
    const layer = new CyclopsStoneFracture((obj) => {
        world.addChild(obj);
    });
    layer.spawn({ x: 100, y: 200 }, 60, 7919);
    const cast = world.children[0];
    const mesh = cast.children[2] as Mesh<Geometry, Shader>;
    const geometry = mesh.geometry,
        positions = geometry.getBuffer("aPosition").data;
    layer.update(0.04);
    expect(geometry.getBuffer("aPosition").data).toBe(positions);
    expect(positions.some((v) => v !== 0)).toBe(true);
    layer.update(CYCLOPS_FRACTURE_LIFE_MS / 4000);
    expect(layer.activeCount).toBe(0);
    expect(cast.destroyed).toBe(true);
    for (let i = 0; i < 6; i++) layer.spawn({ x: i * 60, y: 200 }, 60);
    expect(layer.activeCount).toBe(4);
    expect(world.children).toHaveLength(4);
    layer.clear();
    expect(world.children).toHaveLength(0);
    expect(layer.activeCount).toBe(0);
    layer.clear();
});
test("same impact time has identical geometry with coarse and fine frame steps", () => {
    const a = new Container(),
        b = new Container();
    const first = new CyclopsStoneFracture((c) => {
            a.addChild(c);
        }),
        second = new CyclopsStoneFracture((c) => {
            b.addChild(c);
        });
    first.spawn({ x: 0, y: 0 }, 60, 91);
    second.spawn({ x: 0, y: 0 }, 60, 91);
    first.update(0.125);
    for (let i = 0; i < 20; i++) second.update(0.00625);
    const p = (root: Container) =>
        (root.children[0].children[2] as Mesh<Geometry, Shader>).geometry.getBuffer("aPosition").data;
    expect(Array.from(p(a))).toEqual(Array.from(p(b)));
    first.clear();
    second.clear();
});

test("external scene teardown releases effect buffers safely before the next tick", () => {
    const world = new Container();
    const layer = new CyclopsStoneFracture((c) => {
        world.addChild(c);
    });
    layer.spawn({ x: 0, y: 0 }, 60);
    world.destroy({ children: true });
    expect(() => layer.update(0.01)).not.toThrow();
    expect(layer.activeCount).toBe(0);
    expect(() => layer.clear()).not.toThrow();
});
