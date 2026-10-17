import { beforeAll, expect, test } from "bun:test";
import { BufferImageSource, Sprite, Texture } from "pixi.js";
import { blackDragonSmokeTiming, syncBlackDragonBreathSmoke } from "./BlackDragonBreathSmoke";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            createElement: () => ({ getContext: () => null }),
        };
});

test("smoke retains its onset and lasts 30 percent longer across the idle loop boundary", () => {
    for (let cycle = 0; cycle < 8; cycle++) {
        const start = cycle * 2560;
        expect(blackDragonSmokeTiming(start + 1279).active).toBe(false);
        expect(blackDragonSmokeTiming(start + 1280)).toEqual({ active: true, frame: 1, rise: 8 });
        let previous = -1;
        for (let ms = 1280; ms < 2944; ms += 17) {
            const timing = blackDragonSmokeTiming(start + ms);
            expect(timing.active).toBe(true);
            expect(timing.frame).toBeGreaterThanOrEqual(previous);
            expect(timing.frame).toBeGreaterThanOrEqual(1);
            expect(timing.frame).toBeLessThanOrEqual(12);
            previous = timing.frame;
        }
        expect(blackDragonSmokeTiming(start + 2560).active).toBe(true);
        expect(blackDragonSmokeTiming(start + 2560).frame).toBeGreaterThan(blackDragonSmokeTiming(start + 2559).frame);
        expect(blackDragonSmokeTiming(start + 2943).active).toBe(true);
        expect(blackDragonSmokeTiming(start + 2943).frame).toBeCloseTo(12, 1);
        expect(blackDragonSmokeTiming(start + 2944).active).toBe(false);
    }
    for (const invalid of [NaN, Infinity, -50]) expect(blackDragonSmokeTiming(invalid).active).toBe(false);
});

test("smoke detaches during reactions without changing body geometry or retaining duplicate filters", () => {
    const sprite = new Sprite(Texture.WHITE);
    sprite.scale.set(-0.4, 0.4);
    sprite.anchor.set(0.5, 858 / 1024);
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(580 * 436 * 4), width: 580, height: 436 }),
    });
    syncBlackDragonBreathSmoke(sprite, true, 1600, texture);
    const filter = sprite.filters?.[0];
    expect(filter).toBeDefined();
    syncBlackDragonBreathSmoke(sprite, true, 1800, texture);
    expect(sprite.filters).toEqual([filter!]);
    expect(sprite.scale.x).toBe(-0.4);
    expect(sprite.scale.y).toBe(0.4);
    expect(sprite.anchor.y).toBe(858 / 1024);
    expect(sprite.texture).toBe(Texture.WHITE);
    syncBlackDragonBreathSmoke(sprite, false, 1800, texture);
    expect(sprite.filters).toBeNull();
    syncBlackDragonBreathSmoke(sprite, true, 1800, texture);
    expect(sprite.filters).toEqual([filter!]);
    sprite.destroy();
    texture.destroy(true);
});
