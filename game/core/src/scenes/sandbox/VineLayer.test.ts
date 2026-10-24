import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { Texture, Mesh, RopeGeometry, DOMAdapter } from "pixi.js";

import { VineLayer } from "./VineLayer";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

type VineLayerInternals = {
    time: number;
    chains: unknown[];
    sampleScratch: unknown[];
    grownScratch: unknown[];
    wovenScratch: unknown[][];
};

const toWorld = ({ x, y }: { x: number; y: number }) => ({ x: x * 32, y: y * 32 });

describe("VineLayer", () => {
    test("does no animation work while no vine exists", () => {
        const layer = new VineLayer();
        const internals = layer as unknown as VineLayerInternals;

        layer.update(1 / 60, [], 32, toWorld);

        expect(internals.time).toBe(0);
        layer.destroy();
    });

    test("rebuilds cached chain topology only when authoritative cells change", () => {
        const layer = new VineLayer();
        const internals = layer as unknown as VineLayerInternals;
        const initialCells = [
            { x: 4, y: 4, l: 2 },
            { x: 5, y: 4, l: 2 },
        ];

        layer.update(1 / 60, initialCells, 32, toWorld);
        const initialChains = internals.chains;
        expect(initialChains).toHaveLength(1);

        layer.update(1 / 60, initialCells, 32, toWorld);
        expect(internals.chains).toBe(initialChains);

        layer.update(1 / 60, [...initialCells, { x: 6, y: 4, l: 2 }], 32, toWorld);
        expect(internals.chains).not.toBe(initialChains);
        expect(internals.chains).toHaveLength(1);

        layer.destroy();
    });

    test("reuses sampling scratch buffers across animation frames", () => {
        const layer = new VineLayer();
        const internals = layer as unknown as VineLayerInternals;
        const cells = [
            { x: 4, y: 4, l: 2 },
            { x: 5, y: 4, l: 2 },
        ];

        layer.update(1 / 60, cells, 32, toWorld);
        layer.update(1 / 60, cells, 32, toWorld);
        const samples = internals.sampleScratch;
        const firstSample = samples[0];
        const grown = internals.grownScratch;
        const woven = internals.wovenScratch;
        const firstWovenPoint = woven[0]?.[0];

        layer.update(1 / 60, cells, 32, toWorld);
        expect(internals.sampleScratch).toBe(samples);
        expect(internals.sampleScratch[0]).toBe(firstSample);
        expect(internals.grownScratch).toBe(grown);
        expect(internals.wovenScratch).toBe(woven);
        expect(internals.wovenScratch[0]?.[0]).toBe(firstWovenPoint);

        layer.destroy();
    });

    test("reuses stable cell projections between animation frames", () => {
        const layer = new VineLayer();
        let projectionCalls = 0;
        const project = ({ x, y }: { x: number; y: number }) => {
            projectionCalls += 1;
            return { x: x * 32, y: y * 32 };
        };
        const cells = [{ x: 4, y: 4, l: 2 }];

        layer.update(1 / 60, cells, 32, project);
        layer.update(1 / 60, cells, 32, project);
        expect(projectionCalls).toBe(1);

        layer.update(1 / 60, cells, 40, project);
        expect(projectionCalls).toBe(2);
        layer.destroy();
    });
});

test("cast preview waits for impact and never mutates authoritative terrain", () => {
    const layer = new VineLayer();
    const cells: { x: number; y: number; l: number }[] = [];
    layer.previewCast(
        [
            { x: 2, y: 3 },
            { x: 3, y: 3 },
        ],
        470,
    );
    layer.update(0.02, cells, 32, toWorld);
    const vines = (layer as unknown as { vines: Map<number, { presence: number }> }).vines;
    expect(vines.size).toBe(2);
    expect([...vines.values()].every((vine) => vine.presence === 0)).toBe(true);
    expect(cells).toEqual([]);
    layer.destroy();
});

test("authoritative cells replace a preview without duplicating the path", () => {
    const layer = new VineLayer();
    layer.previewCast([{ x: 2, y: 3 }], 0);
    layer.update(0.02, [], 32, toWorld);
    layer.update(0.1, [{ x: 2, y: 3, l: 2 }], 32, toWorld);
    const internals = layer as unknown as { vines: Map<number, unknown>; previews: Map<number, unknown> };
    expect(internals.vines.size).toBe(1);
    expect(internals.previews.size).toBe(0);
    layer.destroy();
});

test("authored vines use one continuous texture across the whole diagonal lane", () => {
    const layer = new VineLayer(() => Texture.WHITE);
    const cells = [
        { x: 2, y: 2, l: 2 },
        { x: 3, y: 3, l: 2 },
        { x: 4, y: 4, l: 2 },
    ];
    layer.update(0.01, cells, 32, toWorld);
    layer.update(1, cells, 32, toWorld);
    const ribbons = (layer as unknown as { ribbons: Map<number, { mesh: Mesh<RopeGeometry> }> }).ribbons;
    expect(ribbons.size).toBe(1);
    const mesh = [...ribbons.values()][0].mesh;
    const uv = mesh.geometry.getBuffer("aUV").data;
    expect(uv[0]).toBe(0);
    // Square test texture must retain equal world-space scales on U and V.
    const points = mesh.geometry.points;
    for (let i = 1; i < points.length; i++) {
        const distance = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        expect((uv[i * 4] - uv[(i - 1) * 4]) * (32 * 0.62)).toBeCloseTo(distance, 4);
    }
    for (let i = 4; i < uv.length; i += 4) expect(uv[i]).toBeGreaterThan(uv[i - 4]);
    const before = mesh.geometry;
    layer.update(0.01, cells, 32, toWorld);
    expect([...ribbons.values()][0].mesh.geometry).toBe(before);
    layer.update(1, [], 32, toWorld);
    expect(ribbons.size).toBe(0);
    layer.destroy();
});

test("diagonal cast starts inside the caster cell and retains its anchor after terrain takes over", () => {
    const layer = new VineLayer(() => Texture.WHITE);
    const cells = [
        { x: 3, y: 3, l: 2 },
        { x: 4, y: 4, l: 2 },
    ];
    layer.previewCast(cells, 0, { x: 2, y: 2 });
    layer.update(0.01, [], 32, toWorld);
    layer.update(1, cells, 32, toWorld);
    const ribbons = (
        layer as unknown as {
            ribbons: Map<number, { mesh: Mesh<RopeGeometry>; points: { x: number; y: number }[]; width: number }>;
        }
    ).ribbons;
    const ribbon = [...ribbons.values()][0];
    expect(ribbon.points[0].x).toBeGreaterThan(48);
    expect(ribbon.points[0].x).toBeLessThan(64);
    expect(ribbon.points[0].y).toBeGreaterThan(48);
    expect(ribbon.points[0].y).toBeLessThan(64);
    expect(ribbon.width).toBeLessThan(32 * 0.65);
    const vertices = ribbon.mesh.geometry.getBuffer("aPosition").data;
    for (let i = 0; i < 4; i++) {
        expect(vertices[i]).toBeGreaterThan(48);
        expect(vertices[i]).toBeLessThan(80);
    }
    layer.update(1, [], 32, toWorld);
    expect(ribbons.size).toBe(0);
    layer.destroy();
});

test("reveal travels along the path without changing vine thickness, and retracts on expiration", () => {
    const layer = new VineLayer(() => Texture.WHITE);
    const cells = [
        { x: 2, y: 2, l: 2 },
        { x: 3, y: 3, l: 2 },
        { x: 4, y: 4, l: 2 },
    ];
    layer.update(0.01, cells, 32, toWorld);
    layer.update(0.1, cells, 32, toWorld);
    const ribbon = [
        ...(
            layer as unknown as { ribbons: Map<number, { mesh: Mesh<RopeGeometry>; reveal: number; width: number }> }
        ).ribbons.values(),
    ][0];
    const early = ribbon.reveal;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(1);
    const vertices = ribbon.mesh.geometry.getBuffer("aPosition").data;
    expect(Math.hypot(vertices[0] - vertices[2], vertices[1] - vertices[3])).toBeCloseTo(ribbon.width, 4);
    layer.update(1, cells, 32, toWorld);
    expect(ribbon.reveal).toBe(1);
    layer.update(0.04, [], 32, toWorld);
    const retracting = ribbon.reveal;
    expect(retracting).toBeLessThan(1);
    layer.update(0.04, [], 32, toWorld);
    expect(ribbon.reveal).toBeLessThan(retracting);
    expect(Math.hypot(vertices[0] - vertices[2], vertices[1] - vertices[3])).toBeCloseTo(ribbon.width, 4);
    layer.destroy();
});
