import { beforeAll, expect, test } from "bun:test";
import { BufferImageSource, Filter, Sprite, Texture } from "pixi.js";
import { syncWyvernLabIdle } from "./WyvernLabIdleVisuals";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            querySelector: () => null,
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
        };
});

test("Wyvern idle keeps the original texture, facing and dimensions and cleans up only its own filter", () => {
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    const sprite = new Sprite(texture);
    sprite.scale.set(-0.3, 0.4);
    const other = new Filter({});
    sprite.filters = [other];
    syncWyvernLabIdle(sprite, true, 0);
    const idle = sprite.filters![1];
    const phases = new Set<number>();
    for (let time = 0; time <= 7000; time += 50) {
        syncWyvernLabIdle(sprite, true, time);
        expect(sprite.texture).toBe(texture);
        expect(sprite.scale.x).toBe(-0.3);
        expect(sprite.scale.y).toBe(0.4);
        expect(sprite.filters).toEqual([other, idle]);
        phases.add(idle.resources.tail.uniforms.uPhase);
    }
    expect(phases.size).toBe(141);
    syncWyvernLabIdle(sprite, false, 7001);
    expect(sprite.filters).toEqual([other]);
    syncWyvernLabIdle(sprite, true, 7100);
    expect(sprite.filters).toEqual([other, idle]);
    sprite.destroy();
    expect(idle.glProgram).toBeNull();
    other.destroy();
});
