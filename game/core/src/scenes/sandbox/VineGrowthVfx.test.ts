import { afterAll, beforeAll, expect, test } from "bun:test";
import { DOMAdapter, Mesh, Texture } from "pixi.js";
import { VineGrowthVfx } from "./VineGrowthVfx";
import { VineLayer } from "./VineLayer";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
const path = [
    { x: 0, y: 0 },
    { x: 64, y: 0 },
    { x: 64, y: 64 },
];
const tick = (vfx: VineGrowthVfx, dt: number, reveal: number, alive = true, dry = false) => {
    vfx.begin(dt);
    vfx.path(1, path, reveal, 32, alive, dry);
    vfx.end();
};
const data = (vfx: VineGrowthVfx) =>
    (
        vfx as unknown as {
            particles: { mesh: Mesh; kind: number; x: number; y: number; born: number; life: number; fadeAt: number }[];
        }
    ).particles;

test("growth contacts span both sides of a corner, remain detached, and do not repeat at rest", () => {
    const vfx = new VineGrowthVfx();
    tick(vfx, 0, 0);
    tick(vfx, 0.2, 1);
    const particles = data(vfx),
        count = particles.length;
    expect(particles.some((p) => p.kind === 0 && p.x < 30)).toBe(true);
    expect(particles.some((p) => p.kind === 0 && p.y > 30)).toBe(true);
    const anchors = particles.map((p) => [p.x, p.y]);
    tick(vfx, 0.02, 1);
    expect(data(vfx).length).toBe(count);
    expect(data(vfx).map((p) => [p.x, p.y])).toEqual(anchors);
    vfx.destroy();
});

test("missing and expired owners fade all layers within 130ms without resurrection", () => {
    const vfx = new VineGrowthVfx();
    tick(vfx, 0.1, 1);
    vfx.begin(0.01);
    vfx.end();
    const deadline = data(vfx)[0].fadeAt;
    vfx.begin(0.065);
    vfx.end();
    expect(data(vfx)[0].mesh.alpha).toBeCloseTo(0.5, 3);
    vfx.begin(0.065);
    vfx.end();
    expect(vfx.active).toBe(false);
    expect(data(vfx)[0].fadeAt).toBe(deadline);
    tick(vfx, 0.1, 0);
    tick(vfx, 0.1, 1);
    expect(vfx.active).toBe(true);
    tick(vfx, 0.01, 0.5, false);
    tick(vfx, 0.14, 0, false);
    expect(vfx.active).toBe(false);
    vfx.destroy();
});

test("pool stays bounded under repeated crossing casts and destroys its resources", () => {
    const vfx = new VineGrowthVfx();
    for (let i = 0; i < 80; i++) {
        vfx.begin(0.01);
        vfx.path(i, path, 1, 32, true, false);
        vfx.end();
    }
    expect(data(vfx).length).toBeLessThanOrEqual(192);
    const meshes = data(vfx).map((p) => p.mesh),
        geometry = meshes[0].geometry;
    const buffer = geometry.getBuffer("aPosition");
    let releases = 0;
    geometry.on("destroy", () => releases++);
    vfx.destroy();
    expect(releases).toBe(1);
    expect(meshes.every((mesh) => mesh.destroyed)).toBe(true);
    expect(buffer.destroyed).toBe(true);
});

test("dry resting vines emit no spores and long frames leave no immortal particles", () => {
    const vfx = new VineGrowthVfx();
    tick(vfx, 0.2, 1, true, true);
    for (let i = 0; i < 8; i++) tick(vfx, 0.5, 1, true, true);
    expect(vfx.active).toBe(false);
    tick(vfx, 5, 0);
    tick(vfx, 5, 1, true, true);
    tick(vfx, 5, 1, true, true);
    expect(vfx.active).toBe(false);
    vfx.destroy();
});

test("delayed terrain has no particles, expires fully, and preserves cached artwork", () => {
    const layer = new VineLayer(() => Texture.WHITE);
    const projection = ({ x, y }: { x: number; y: number }) => ({ x: x * 32, y: y * 32 });
    const cells = [
        { x: 4, y: 4, l: 2 },
        { x: 5, y: 4, l: 2 },
    ];
    layer.delayGrowth(cells, 10000);
    layer.update(0.2, cells, 32, projection);
    const vfx = (layer as unknown as { growthVfx: VineGrowthVfx }).growthVfx;
    expect(vfx.active).toBe(false);
    layer.delayGrowth(cells, 0);
    layer.update(0.2, cells, 32, projection);
    expect(vfx.active).toBe(true);
    layer.update(0.3, [], 32, projection);
    layer.update(0.2, [], 32, projection);
    expect(vfx.active).toBe(false);
    layer.destroy();
    expect(Texture.WHITE.destroyed).toBe(false);
    expect(Texture.WHITE.source.destroyed).toBe(false);
});

test("settled vines keep smoldering without re-emitting birth debris; light stays grounded", () => {
    const vfx = new VineGrowthVfx();
    tick(vfx, 0, 0);
    for (let i = 0; i < 360; i++) tick(vfx, 1 / 60, 1);
    const active = data(vfx).filter((p) => p.mesh.visible);
    expect(active.some((p) => p.kind === 3)).toBe(true);
    expect(active.some((p) => p.kind === 4)).toBe(true);
    expect(active.some((p) => p.kind < 2)).toBe(false);
    for (const p of active.filter((p) => p.kind === 4)) {
        expect(p.mesh.x).toBe(p.x);
        expect(p.mesh.y).toBe(p.y);
        expect(p.mesh.blendMode).toBe("add");
    }
    for (const p of active.filter((p) => p.kind === 3)) {
        expect(p.mesh.y).toBeGreaterThanOrEqual(p.y);
        expect(p.mesh.blendMode).toBe("normal");
    }
    for (let i = 0; i < 300; i++) tick(vfx, 1 / 60, 1, true, true);
    expect(vfx.active).toBe(false);
    vfx.destroy();
});

test("quiet smoke emissions remain stable across 30 and 60 Hz and clean up on removal", () => {
    const run = (hz: number) => {
        const vfx = new VineGrowthVfx();
        tick(vfx, 0, 1); // reveal has no elapsed time; compare only the settled phase
        for (let i = 0; i < hz * 6; i++) tick(vfx, 1 / hz, 1);
        const particles = data(vfx).filter((p) => p.mesh.visible && p.kind >= 3);
        const contacts = particles.map((p) => [p.kind, p.x.toFixed(2), p.y.toFixed(2)]).sort();
        vfx.begin(0.01);
        vfx.end();
        vfx.begin(0.14);
        vfx.end();
        expect(vfx.active).toBe(false);
        vfx.destroy();
        return contacts;
    };
    expect(run(30)).toEqual(run(60));
});
