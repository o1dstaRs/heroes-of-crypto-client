import { afterAll, beforeAll, expect, test } from "bun:test";
import { BufferImageSource, Container, DOMAdapter, Sprite, Texture } from "pixi.js";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { RangedProjectiles } from "./RangedProjectiles";
import { CYCLOPS_IMPACT_DURATION_MS, cyclopsImpactFrame } from "../CyclopsStoneImpact";
import { GARGANTUAN_IMPACT_PAINTED_EXTENT } from "../GargantuanStoneImpact";
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Cyclops fractures at floor contact, keeps the first cel, and cleans up without a second hit", async () => {
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
    renderer.setCyclopsImpactMode("sprites");
    const frames = Array.from({ length: 24 }, texture);
    const state = renderer as unknown as {
        cyclopsHeavyBoulderTexture: Texture;
        gargantuanImpactFrames: Texture[];
        cyclopsImpacts: { sprite: Sprite; elapsedMs: number }[];
        rockImpacts: unknown[];
        projectiles: { to: { x: number; y: number } }[];
    };
    state.cyclopsHeavyBoulderTexture = texture();
    state.gargantuanImpactFrames = frames;
    for (const cancel of [false, true]) {
        let hits = 0;
        const abort = new AbortController();
        const flight = renderer.fire({
            from: { x: 0, y: 200 },
            to: { x: 900, y: 200 },
            big: true,
            cyclopsRock: true,
            cyclopsImpactPosition: { x: 900, y: 80 },
            signal: abort.signal,
            onImpact: () => hits++,
        });
        await Promise.resolve();
        expect(state.projectiles[0].to.y).toBeCloseTo(80 + gs.getCellSize() * 0.3);
        if (cancel) abort.abort();
        else renderer.update(10);
        await flight;
        expect(hits).toBe(cancel ? 0 : 1);
        expect(state.rockImpacts).toHaveLength(0);
        expect(state.cyclopsImpacts).toHaveLength(cancel ? 0 : 1);
        if (!cancel) {
            const sprite = state.cyclopsImpacts[0].sprite;
            expect(sprite.texture).toBe(frames[0]);
            expect([sprite.x, sprite.y]).toEqual([900, 80]);
            expect(sprite.scale.y).toBeLessThan(0);
            expect(Math.abs(sprite.scale.x) * GARGANTUAN_IMPACT_PAINTED_EXTENT).toBeCloseTo(gs.getCellSize() * 3);
            expect(Math.abs(sprite.scale.y) * GARGANTUAN_IMPACT_PAINTED_EXTENT).toBeCloseTo(gs.getCellSize() * 3);
            for (let i = 1; i < 24; i++) {
                const midpoint = ((i + 0.5) * CYCLOPS_IMPACT_DURATION_MS) / 24;
                renderer.update((midpoint - state.cyclopsImpacts[0].elapsedMs) / 4000);
                expect(sprite.texture).toBe(frames[i]);
            }
            renderer.update(CYCLOPS_IMPACT_DURATION_MS / 4000);
            expect(sprite.destroyed).toBe(true);
            expect(state.cyclopsImpacts).toHaveLength(0);
            expect(hits).toBe(1);
        }
    }
    expect(cyclopsImpactFrame(CYCLOPS_IMPACT_DURATION_MS)).toBe(-1);
    renderer.destroy();
    expect(frames.every((f) => f.destroyed)).toBe(true);
});

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
