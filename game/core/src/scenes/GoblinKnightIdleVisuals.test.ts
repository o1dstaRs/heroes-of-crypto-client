import { afterAll, beforeAll, expect, test } from "bun:test";
import { AlphaFilter, DOMAdapter, Sprite, Texture } from "pixi.js";
import {
    GOBLIN_ETCH_CONTACTS,
    GOBLIN_ETCH_BLADE_POSES,
    GoblinKnightIdleFilter,
    goblinIdleEtch,
    syncGoblinKnightIdle,
} from "./GoblinKnightIdleVisuals";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Goblin idle reuses its filter across walk transitions and preserves other effects", () => {
    const sprite = new Sprite(Texture.WHITE);
    const other = new AlphaFilter();
    sprite.filters = [other];
    syncGoblinKnightIdle(sprite, true, 0);
    const idle = sprite.filters?.[1];
    expect(idle).toBeDefined();
    syncGoblinKnightIdle(sprite, true, 500);
    expect(sprite.filters).toEqual([other, idle]);
    syncGoblinKnightIdle(sprite, false, 500);
    expect(sprite.filters).toEqual([other]);
    syncGoblinKnightIdle(sprite, true, 750);
    expect(sprite.filters).toEqual([other, idle]);
    sprite.destroy();
});

test("Goblin redrawn stroke emits only contacts already reached by the visible blade", () => {
    expect(goblinIdleEtch(6000)).toEqual({ frame: 0, active: false, segments: 0, frost: 0 });
    expect(goblinIdleEtch(7300).frost).toBe(0);
    for (let frame = 4; frame <= 7; frame++) {
        const state = goblinIdleEtch(7000 + frame * 100);
        expect(state.frame).toBe(frame);
        expect(state.segments).toBe(frame - 4);
        expect(state.frost).toBe(1);
    }
    for (let i = 0; i < 4; i++) {
        expect<unknown>(GOBLIN_ETCH_CONTACTS[i]).toEqual(GOBLIN_ETCH_BLADE_POSES[i + 4].slice(2));
    }
    expect(goblinIdleEtch(8500).active).toBe(false);
    expect(goblinIdleEtch(8500).frost).toBeGreaterThan(0);
    expect(goblinIdleEtch(9400).frost).toBe(0);
    expect(goblinIdleEtch(12000)).toEqual(goblinIdleEtch(0));
    const filter = new GoblinKnightIdleFilter(new Sprite(Texture.WHITE));
    filter.update(7700);
    expect(filter.resources.goblin.uniforms.uFrost).toBe(0);
    expect(filter.resources.goblin.uniforms.uReady).toBe(0);
});
