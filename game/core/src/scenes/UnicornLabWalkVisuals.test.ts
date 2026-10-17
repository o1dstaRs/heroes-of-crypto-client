import { afterAll, beforeAll, expect, test } from "bun:test";
import { ColorMatrixFilter, DOMAdapter, Sprite, Texture } from "pixi.js";
import {
    syncUnicornLabWalk,
    UNICORN_CANONICAL_HEIGHT,
    UNICORN_WALK_BOTTOMS,
    UNICORN_WALK_HEIGHTS,
    UNICORN_WALK_RGB_TRANSFERS,
} from "./UnicornLabWalkVisuals";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Unicorn preserves visible height and ground contact across frames, scale resets and idle", () => {
    const sprite = new Sprite(Texture.WHITE);
    const other = new ColorMatrixFilter();
    sprite.filters = [other];
    sprite.scale.set(-2, -3);
    sprite.anchor.y = 730 / 768;
    for (let tick = 0; tick < 24; tick++) {
        const frame = tick % 8;
        if (tick % 2 === 0) sprite.scale.set(-2, -3);
        syncUnicornLabWalk(sprite, frame, tick % 2 === 0);
        expect(Math.abs(sprite.scale.y) * UNICORN_WALK_HEIGHTS[frame]).toBeCloseTo(3 * UNICORN_CANONICAL_HEIGHT);
        expect((UNICORN_WALK_BOTTOMS[frame] - sprite.anchor.y * 768) * sprite.scale.y).toBeCloseTo(-6);
        expect(sprite.scale.x / sprite.scale.y).toBeCloseTo(2 / 3);
        const x = sprite.scale.x;
        const y = sprite.scale.y;
        syncUnicornLabWalk(sprite, frame);
        expect(sprite.scale.x).toBe(x);
        expect(sprite.scale.y).toBe(y);
        expect(sprite.filters?.[1]).toBe(other);
    }
    syncUnicornLabWalk(sprite, -1);
    expect(sprite.scale.x).toBeCloseTo(-2);
    expect(sprite.scale.y).toBeCloseTo(-3);
    expect(sprite.anchor.y).toBe(730 / 768);
    expect(sprite.filters).toEqual([other]);
});

test("every unicorn pose moves closer to the canonical palette", () => {
    const target = [
        [70.0, 56.0, 32.0],
        [97.0, 83.0, 58.0],
        [139.0, 127.0, 105.0],
        [186.0, 175.0, 155.0],
        [229.0, 219.0, 201.0],
        [247.0, 239.0, 223.0],
    ];
    const source = [
        [
            [100.0, 73.0, 44.0],
            [127.0, 102.0, 74.0],
            [166.0, 146.0, 123.0],
            [207.0, 192.0, 173.0],
            [239.0, 229.0, 215.0],
            [251.0, 244.0, 235.0],
        ],
        [
            [97.0, 70.0, 41.0],
            [125.0, 99.0, 70.0],
            [167.0, 147.0, 124.0],
            [209.0, 193.0, 174.0],
            [240.0, 230.0, 216.0],
            [251.0, 245.0, 236.0],
        ],
        [
            [92.0, 68.0, 38.0],
            [120.0, 96.0, 67.0],
            [164.0, 143.0, 119.0],
            [209.0, 194.0, 175.0],
            [243.0, 232.0, 218.0],
            [251.0, 246.0, 236.0],
        ],
        [
            [100.0, 73.0, 48.0],
            [128.0, 104.0, 78.0],
            [169.0, 149.0, 128.0],
            [213.0, 199.0, 182.0],
            [242.0, 232.0, 218.0],
            [250.0, 244.0, 234.0],
        ],
        [
            [104.0, 75.0, 45.0],
            [131.0, 104.0, 75.0],
            [170.0, 147.0, 123.0],
            [210.0, 193.0, 174.0],
            [242.0, 229.0, 215.0],
            [251.0, 243.0, 233.0],
        ],
        [
            [105.0, 75.0, 47.0],
            [133.0, 104.0, 76.0],
            [168.0, 144.0, 120.0],
            [207.0, 189.0, 170.0],
            [240.0, 228.0, 212.0],
            [251.0, 244.0, 233.0],
        ],
        [
            [104.0, 74.0, 43.0],
            [131.0, 104.0, 75.0],
            [171.0, 146.0, 120.0],
            [210.0, 191.0, 172.0],
            [242.0, 230.0, 216.0],
            [252.0, 246.0, 237.0],
        ],
        [
            [103.0, 76.0, 48.0],
            [128.0, 104.0, 77.0],
            [168.0, 146.0, 124.0],
            [208.0, 192.0, 175.0],
            [242.0, 232.0, 218.0],
            [252.0, 247.0, 238.0],
        ],
    ];
    source.forEach((samples, frame) => {
        const transfer = UNICORN_WALK_RGB_TRANSFERS[frame];
        let before = 0,
            after = 0;
        samples.forEach((sample, q) =>
            sample.forEach((value, c) => {
                before += (value - target[q][c]) ** 2;
                after += (value * transfer[c] + 255 * transfer[c + 3] - target[q][c]) ** 2;
            }),
        );
        expect(after).toBeLessThan(before * 0.15);
    });
});
