import { afterAll, beforeAll, expect, test } from "bun:test";
import { BufferImageSource, Container, DOMAdapter, Texture } from "pixi.js";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { RangedProjectiles } from "./RangedProjectiles";
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("lab choice is captured for each shot and switching restores the original sprite impact", async () => {
    const gs = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const world = new Container();
    const renderer = new RangedProjectiles({
        getGridSettings: () => gs,
        attachToWorldRoot: (obj) => {
            world.addChild(obj);
        },
    });
    const texture = () =>
        new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width: 512, height: 512 }) });
    const state = renderer as unknown as {
        cyclopsHeavyBoulderTexture: Texture;
        gargantuanImpactFrames: Texture[];
        cyclopsFracture?: { activeCount: number };
        cyclopsImpacts: unknown[];
    };
    state.cyclopsHeavyBoulderTexture = texture();
    state.gargantuanImpactFrames = Array.from({ length: 24 }, texture);
    // Ordinary combat now defaults to the approved engine effect.
    let hits = 0;
    const options = {
        from: { x: 0, y: 200 },
        to: { x: 900, y: 200 },
        big: true,
        cyclopsRock: true,
        cyclopsImpactPosition: { x: 900, y: 80 },
        onImpact: () => hits++,
    };
    const first = renderer.fire(options);
    await Promise.resolve();
    renderer.setCyclopsImpactMode("sprites");
    renderer.update(10);
    await first;
    expect(hits).toBe(1);
    expect(state.cyclopsFracture?.activeCount).toBe(1);
    expect(state.cyclopsImpacts).toHaveLength(0);
    renderer.clear();
    expect(state.cyclopsFracture?.activeCount).toBe(0);
    const second = renderer.fire(options);
    await Promise.resolve();
    renderer.update(10);
    await second;
    expect(hits).toBe(2);
    expect(state.cyclopsFracture?.activeCount).toBe(0);
    expect(state.cyclopsImpacts).toHaveLength(1);
    renderer.destroy();
    expect(world.children).toHaveLength(0);
});
