import { afterAll, beforeAll, expect, test } from "bun:test";
import { ColorMatrixFilter, DOMAdapter, Sprite, Texture } from "pixi.js";
import { TROLL_LAB_IDLE_COLOR_TRANSFER, syncTrollLabWalkPalette } from "./TrollLabWalkVisuals";

const originalAdapter = DOMAdapter.get();
beforeAll(() => {
    DOMAdapter.set({
        ...originalAdapter,
        createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
    });
});
afterAll(() => DOMAdapter.set(originalAdapter));

test("Troll walk palette follows the frame and is removed on idle without removing other filters", () => {
    const sprite = new Sprite(Texture.WHITE);
    const gameplayFilter = new ColorMatrixFilter();
    sprite.filters = [gameplayFilter];
    syncTrollLabWalkPalette(sprite, 0);
    const first = sprite.filters?.[0];
    expect(first).toBeInstanceOf(ColorMatrixFilter);
    expect(sprite.filters).toHaveLength(2);
    syncTrollLabWalkPalette(sprite, 0);
    expect(sprite.filters?.[0]).toBe(first);
    syncTrollLabWalkPalette(sprite, 6);
    expect(sprite.filters).toHaveLength(2);
    expect(sprite.filters?.[0]).not.toBe(first);
    expect(sprite.filters?.[1]).toBe(gameplayFilter);
    expect((sprite.filters?.[0] as ColorMatrixFilter).matrix.slice(15)).toEqual([0, 0, 0, 1, 0]);
    syncTrollLabWalkPalette(sprite, -1);
    expect(sprite.filters).toEqual([gameplayFilter]);
});

test("Troll idle keeps one palette and replaces walk grading without stacking filters", () => {
    const sprite = new Sprite(Texture.WHITE);
    const gameplayFilter = new ColorMatrixFilter();
    sprite.filters = [gameplayFilter];
    syncTrollLabWalkPalette(sprite, -1, true);
    const idle = sprite.filters?.[0] as ColorMatrixFilter;
    expect(idle.matrix[4]).toBeCloseTo(TROLL_LAB_IDLE_COLOR_TRANSFER[3]);
    expect(idle.matrix.slice(15)).toEqual([0, 0, 0, 1, 0]);
    syncTrollLabWalkPalette(sprite, -1, true);
    expect(sprite.filters).toEqual([idle, gameplayFilter]);
    syncTrollLabWalkPalette(sprite, 0);
    expect(sprite.filters).toHaveLength(2);
    expect(sprite.filters?.[0]).not.toBe(idle);
    syncTrollLabWalkPalette(sprite, -1, true);
    expect(sprite.filters).toEqual([idle, gameplayFilter]);
    syncTrollLabWalkPalette(sprite, -1);
    expect(sprite.filters).toEqual([gameplayFilter]);
});
