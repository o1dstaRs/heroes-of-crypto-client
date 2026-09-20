import { afterAll, beforeAll, expect, test } from "bun:test";
import { ColorMatrixFilter, DOMAdapter, Sprite, Texture } from "pixi.js";
import {
    syncWhiteTigerLabWalk,
    WHITE_TIGER_CANONICAL_HEIGHT,
    WHITE_TIGER_WALK_BOTTOMS,
    WHITE_TIGER_WALK_HEIGHTS,
    WHITE_TIGER_WALK_RGB_TRANSFER,
} from "./WhiteTigerLabWalkVisuals";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("White Tiger preserves visible height and ground contact across frames, scale resets and idle", () => {
    const sprite = new Sprite(Texture.WHITE);
    const other = new ColorMatrixFilter();
    sprite.filters = [other];
    sprite.scale.set(-2, -3);
    sprite.anchor.y = 730 / 768;
    let sharedGrade: unknown;
    for (let tick = 0; tick < 24; tick++) {
        const frame = tick % 8;
        if (tick % 2 === 0) sprite.scale.set(-2, -3);
        syncWhiteTigerLabWalk(sprite, frame, tick % 2 === 0);
        expect(Math.abs(sprite.scale.y) * WHITE_TIGER_WALK_HEIGHTS[frame]).toBeCloseTo(
            3 * WHITE_TIGER_CANONICAL_HEIGHT,
        );
        expect((WHITE_TIGER_WALK_BOTTOMS[frame] - sprite.anchor.y * 768) * sprite.scale.y).toBeCloseTo(-33);
        const x = sprite.scale.x;
        const y = sprite.scale.y;
        syncWhiteTigerLabWalk(sprite, frame);
        expect(sprite.scale.x).toBe(x);
        expect(sprite.scale.y).toBe(y);
        sharedGrade ??= sprite.filters?.[0];
        expect(sprite.filters?.[0]).toBe(sharedGrade);
        expect(sprite.filters?.[1]).toBe(other);
    }
    syncWhiteTigerLabWalk(sprite, -1);
    expect(sprite.scale.x).toBeCloseTo(-2);
    expect(sprite.scale.y).toBeCloseTo(-3);
    expect(sprite.anchor.y).toBe(730 / 768);
    expect(sprite.filters).toEqual([other]);
});

test("White Tiger's shared grade brings measured shadow and highlight samples toward the static palette", () => {
    const source = [
        [32, 22, 15],
        [115, 97, 82],
        [208, 190, 174],
    ];
    const target = [
        [22, 13, 5],
        [92, 77, 61],
        [187, 168, 150],
    ];
    for (let channel = 0; channel < 3; channel++) {
        const before = source.reduce((sum, sample, i) => sum + (sample[channel] - target[i][channel]) ** 2, 0);
        const after = source.reduce((sum, sample, i) => {
            const corrected =
                sample[channel] * WHITE_TIGER_WALK_RGB_TRANSFER[channel] +
                WHITE_TIGER_WALK_RGB_TRANSFER[channel + 3] * 255;
            return sum + (corrected - target[i][channel]) ** 2;
        }, 0);
        expect(after).toBeLessThan(before * 0.1);
    }
});
