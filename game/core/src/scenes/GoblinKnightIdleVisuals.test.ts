import { afterAll, beforeAll, expect, test } from "bun:test";
import { AlphaFilter, DOMAdapter, Sprite, Texture } from "pixi.js";
import {
    GOBLIN_ETCH_CONTACTS,
    GOBLIN_ETCH_BLADE_POSES,
    GoblinKnightIdleFilter,
    goblinIdleEtch,
    goblinIdleOffset,
    syncGoblinKnightIdle,
} from "./GoblinKnightIdleVisuals";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Goblin idle keeps feet planted while the cape moves independently of the shoulder", () => {
    for (const time of [0, 500, 1050, 2100, 4200, 8000]) {
        expect(Math.hypot(...goblinIdleOffset(360, 720, time))).toBe(0);
        expect(Math.hypot(...goblinIdleOffset(490, 732, time))).toBe(0);
        const shoulder = goblinIdleOffset(390, 190, time);
        const torso = goblinIdleOffset(460, 190, time);
        expect(Math.hypot(shoulder[0] - torso[0], shoulder[1] - torso[1])).toBeLessThan(0.02);
    }
    expect(Math.abs(goblinIdleOffset(200, 400, 0)[0])).toBeGreaterThan(8);
    expect(goblinIdleOffset(460, 400, 0)).toEqual([0, 0]);
    const a = goblinIdleOffset(200, 400, 1000);
    const b = goblinIdleOffset(200, 400, 1001);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.1);
});

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

test("Goblin wind never deforms the shoulder, forearm, gauntlet or sword", () => {
    for (const t of [0, 500, 1050, 2100, 3700]) {
        for (const [x, y] of [
            [320, 280],
            [315, 360],
            [330, 420],
            [355, 470],
            [420, 530],
        ]) {
            expect(goblinIdleOffset(x, y, t)).toEqual(goblinIdleOffset(600, y, t));
        }
    }
    expect(Math.abs(goblinIdleOffset(200, 400, 0)[0])).toBeGreaterThan(8);
});
