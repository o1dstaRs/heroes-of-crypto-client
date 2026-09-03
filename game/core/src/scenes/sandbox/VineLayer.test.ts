import { describe, expect, test } from "bun:test";

import { VineLayer } from "./VineLayer";

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
