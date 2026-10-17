import { afterAll, beforeAll, expect, test } from "bun:test";
import { BufferImageSource, DOMAdapter, Filter, Sprite, Texture } from "pixi.js";
import { syncCannonMaterial } from "./TsarCannonMaterial";
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
const tex = (size: number) =>
    new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width: size, height: size }) });

test("one bronze correction follows barrel and wheel filters through all cannon states without changing geometry", () => {
    const sprite = new Sprite(tex(768));
    sprite.scale.set(0.2, -0.2);
    sprite.anchor.set(0.5, 0.93);
    const wheel = new Filter({});
    sprite.filters = [wheel];
    syncCannonMaterial(sprite);
    const palette = sprite.filters![1];
    for (const size of [768, 768, 1024, 1024, 1024, 1024, 768]) {
        const frame = tex(size);
        sprite.texture = frame;
        // A stopped-wheel pass can be appended while entering an action.
        sprite.filters = [palette, wheel];
        syncCannonMaterial(sprite);
        expect(sprite.filters).toEqual([wheel, palette]);
        expect(Array.from(palette.resources.material.uniforms.uPose)).toEqual([size, size === 1024 ? 128 : 0, 0]);
        expect(sprite.texture).toBe(frame);
        expect(sprite.scale.x).toBe(0.2);
        expect(sprite.scale.y).toBe(-0.2);
        expect(sprite.anchor.y).toBe(0.93);
    }
    sprite.destroy();
    wheel.destroy();
});

test("settled death keeps its barrel protection until another atlas is installed", () => {
    const sprite = new Sprite(tex(1024));
    syncCannonMaterial(sprite, 1);
    const palette = sprite.filters![0];
    expect(palette.resources.material.uniforms.uPose[2]).toBe(1);
    syncCannonMaterial(sprite);
    expect(palette.resources.material.uniforms.uPose[2]).toBe(1);
    sprite.texture = tex(768);
    syncCannonMaterial(sprite);
    expect(Array.from(palette.resources.material.uniforms.uPose)).toEqual([768, 0, 0]);
    sprite.destroy();
});
