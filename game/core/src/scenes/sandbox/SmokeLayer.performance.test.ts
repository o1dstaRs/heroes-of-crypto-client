import { describe, expect, test } from "bun:test";

import { Assets, BufferImageSource, Texture } from "pixi.js";

import { images } from "../../generated/image_imports";
import type { ILingeringTrack } from "../SandboxDrawer";
import { SmokeLayer } from "./SmokeLayer";

interface SmokeLayerInternals {
    activeTracks: Set<ILingeringTrack>;
    atlasLoadStarted: boolean;
    dustFrames: Texture[];
    time: number;
}

const track = (flying: boolean): ILingeringTrack => ({
    x: 0,
    y: 0,
    radius: 10,
    life: 1,
    maxLife: 1,
    phase: 0,
    team: 1,
    flying,
    dirX: 1,
    dirY: 0,
    cellSize: 20,
});

describe("smoke trail allocation", () => {
    test("does no animation work while no movement track exists", () => {
        const layer = new SmokeLayer();
        const internals = layer as unknown as SmokeLayerInternals;

        layer.update(1 / 60, []);

        expect(internals.time).toBe(0);
        expect(internals.atlasLoadStarted).toBe(false);
        layer.update(1 / 60, [track(true)]);
        expect(internals.atlasLoadStarted).toBe(false);
        layer.destroy();
    });

    test("loads only for ground movement and evicts a late atlas after teardown", async () => {
        const mutableAssets = Assets as unknown as {
            load: typeof Assets.load;
            unload: typeof Assets.unload;
        };
        const originalLoad = mutableAssets.load;
        const originalUnload = mutableAssets.unload;
        const atlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 1536, height: 1024 }),
        });
        let finishLoad!: (texture: Texture) => void;
        let loadCalls = 0;
        const unloaded: string[] = [];
        mutableAssets.load = (() => {
            loadCalls += 1;
            return new Promise<Texture>((resolve) => (finishLoad = resolve));
        }) as typeof Assets.load;
        mutableAssets.unload = (async (url: string) => {
            unloaded.push(url);
        }) as typeof Assets.unload;

        try {
            const layer = new SmokeLayer();
            layer.update(1 / 60, [track(true)]);
            expect(loadCalls).toBe(0);

            layer.update(1 / 60, [track(false)]);
            expect(loadCalls).toBe(1);
            layer.destroy();
            finishLoad(atlas);
            await Promise.resolve();
            await Promise.resolve();

            expect(unloaded).toEqual([images.vfx_dust_smoky_ash_atlas]);
        } finally {
            mutableAssets.load = originalLoad;
            mutableAssets.unload = originalUnload;
            atlas.destroy(true);
        }
    });

    test("reuses the active-track set across rendered frames", () => {
        const layer = new SmokeLayer();
        const internals = layer as unknown as SmokeLayerInternals;
        const activeTracks = internals.activeTracks;
        internals.dustFrames = [
            new Texture({
                source: new BufferImageSource({ resource: new Uint8Array(4), width: 1, height: 1 }),
            }),
        ];
        const groundTrack = track(false);

        layer.update(1 / 60, [groundTrack, track(true)]);
        expect(internals.activeTracks).toBe(activeTracks);
        expect(activeTracks).toEqual(new Set([groundTrack]));

        layer.update(1 / 60, []);
        expect(internals.activeTracks).toBe(activeTracks);
        expect(activeTracks.size).toBe(0);
        layer.destroy();
    });
});
