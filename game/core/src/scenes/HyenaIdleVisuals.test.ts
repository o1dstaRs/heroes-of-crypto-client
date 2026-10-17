import { afterAll, beforeAll, expect, test } from "bun:test";
import { AlphaFilter, DOMAdapter, Sprite, Texture } from "pixi.js";
import {
    HYENA_IDLE_BEND_PERIOD_MS,
    HYENA_IDLE_BODY_PLAYBACK_RATE,
    HYENA_IDLE_TAIL_PERIOD_MS,
    HYENA_IDLE_TAIL_PLAYBACK_RATE,
    hyenaIdleBend,
    hyenaIdleOffset,
    hyenaIdleTailOffset,
    syncHyenaIdleVisuals,
} from "./HyenaIdleVisuals";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Hyena idle bends the body through planted paws and returns to neutral", () => {
    expect(HYENA_IDLE_BODY_PLAYBACK_RATE).toBe(1.3);
    expect(HYENA_IDLE_BEND_PERIOD_MS).toBeCloseTo(3000 / 1.3, 8);
    expect(hyenaIdleBend(0)).toBe(0);
    expect(hyenaIdleBend(HYENA_IDLE_BEND_PERIOD_MS / 2)).toBe(1);
    expect(hyenaIdleBend(HYENA_IDLE_BEND_PERIOD_MS)).toBeCloseTo(0, 12);
    const settled = hyenaIdleOffset(440, 410, HYENA_IDLE_BEND_PERIOD_MS / 2);
    expect(settled[1]).toBeCloseTo(12, 8);
    for (const [x, y] of [
        [85, 710],
        [260, 715],
        [420, 730],
        [580, 715],
    ]) {
        const [dx, dy] = hyenaIdleOffset(x, y, HYENA_IDLE_BEND_PERIOD_MS / 2);
        expect(Math.abs(dx)).toBeLessThan(0.05);
        expect(Math.abs(dy)).toBeLessThan(0.05);
    }
});

test("Hyena tail waves from its root without moving the torso", () => {
    expect(HYENA_IDLE_TAIL_PLAYBACK_RATE).toBe(1.5);
    expect(HYENA_IDLE_TAIL_PERIOD_MS).toBeCloseTo(1900 / 1.5, 8);
    const time = HYENA_IDLE_TAIL_PERIOD_MS / 4;
    expect(Math.abs(hyenaIdleOffset(55, 505, time)[1])).toBeGreaterThan(5);
    expect(Math.abs(hyenaIdleOffset(152, 505, time)[0])).toBeLessThan(0.05);
    expect(Math.abs(hyenaIdleOffset(375, 505, time)[0])).toBeLessThan(0.05);
    expect(hyenaIdleTailOffset(55, 505, time + HYENA_IDLE_TAIL_PERIOD_MS)[0]).toBeCloseTo(
        hyenaIdleTailOffset(55, 505, time)[0],
        8,
    );
});

test("Hyena idle filter switches off for walk and action without disturbing other filters", () => {
    const sprite = new Sprite(Texture.WHITE);
    const other = new AlphaFilter();
    sprite.filters = [other];
    syncHyenaIdleVisuals(sprite, true, 0);
    expect(sprite.filters).toHaveLength(2);
    const idle = sprite.filters?.[1];
    syncHyenaIdleVisuals(sprite, true, 250);
    expect(sprite.filters).toEqual([other, idle]);
    syncHyenaIdleVisuals(sprite, false, 250);
    expect(sprite.filters).toEqual([other]);
    syncHyenaIdleVisuals(sprite, true, 0);
    expect(sprite.filters).toEqual([other, idle]);
    sprite.destroy();
});
