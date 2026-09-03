import { describe, expect, test } from "bun:test";

import { BufferImageSource, Texture } from "pixi.js";

import type { ILingeringTrack } from "../SandboxDrawer";
import { SmokeLayer } from "./SmokeLayer";

interface SmokeLayerInternals {
    activeTracks: Set<ILingeringTrack>;
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
        layer.destroy();
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
