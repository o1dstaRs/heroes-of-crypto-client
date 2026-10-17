import { afterAll, beforeAll, expect, test } from "bun:test";
import { AlphaFilter, DOMAdapter, Sprite, Texture } from "pixi.js";
import { ANGEL_IDLE_PERIOD_MS, AngelIdleFilter, angelIdleMotion, syncAngelLabIdle } from "./AngelLabIdleVisuals";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Angel idle starts at the exact landing pose and the settled cycle joins continuously", () => {
    expect(angelIdleMotion(0)).toEqual([0, 0, 0, 0]);
    expect(angelIdleMotion(Number.NaN)).toEqual([0, 0, 0, 0]);
    for (const time of [650, 1200, 2400, 3900, 4800]) {
        const a = angelIdleMotion(time),
            b = angelIdleMotion(time + ANGEL_IDLE_PERIOD_MS);
        expect(Math.sin(a[0])).toBeCloseTo(Math.sin(b[0]), 10);
        expect(a[2]).toBeCloseTo(b[2], 10);
        expect(a[3]).toBeCloseTo(b[3], 10);
        expect(Math.abs(a[2])).toBeLessThanOrEqual(0.009);
        expect(a[3]).toBeLessThanOrEqual(1.8);
    }
});

test("Angel idle changes neither sprite scale nor registration and preserves unrelated filters", () => {
    const sprite = new Sprite(Texture.WHITE);
    sprite.scale.set(-0.4, 0.4);
    sprite.anchor.set(0.5, 0.94);
    const other = new AlphaFilter();
    sprite.filters = [other];
    syncAngelLabIdle(sprite, true, 1200);
    const idle = sprite.filters?.find((f) => f instanceof AngelIdleFilter);
    expect(idle).toBeDefined();
    if (!idle) throw new Error("Angel idle filter was not installed");
    for (const time of [2400, 3600, 4800]) syncAngelLabIdle(sprite, true, time);
    expect(sprite.filters).toEqual([other, idle]);
    expect(sprite.scale.x).toBe(-0.4);
    expect(sprite.scale.y).toBe(0.4);
    expect(sprite.anchor.x).toBe(0.5);
    expect(sprite.anchor.y).toBe(0.94);
    syncAngelLabIdle(sprite, false, 4900);
    expect(sprite.filters).toEqual([other]);
    syncAngelLabIdle(sprite, true, 0);
    expect(sprite.filters).toEqual([other, idle]);
    expect((idle as AngelIdleFilter).resources.angelIdle.uniforms.uMotion[1]).toBe(0);
    sprite.destroy();
});
