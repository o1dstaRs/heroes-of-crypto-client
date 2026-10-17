import { expect, test } from "bun:test";
import { BufferImageSource, Rectangle, type Renderer, Texture } from "pixi.js";

import { prewarmAtlasTexture } from "./prewarmAtlasTexture";

test("prewarms a cel's complete shared atlas without rendering or changing the texture", () => {
    const source = new BufferImageSource({ resource: new Uint8Array(8 * 8 * 4), width: 8, height: 8 });
    const frame = new Texture({ source, frame: new Rectangle(2, 2, 4, 4) });
    const uploads: object[] = [];
    const renderer = {
        texture: { initSource: (uploaded: object) => uploads.push(uploaded) },
        render: () => {
            throw new Error("Prewarming must not start an offscreen draw");
        },
    } as unknown as Renderer;
    try {
        expect(prewarmAtlasTexture(renderer, frame)).toBe(true);
        expect(uploads).toEqual([source]);
        expect(frame.source).toBe(source);
        expect(frame.frame).toEqual(new Rectangle(2, 2, 4, 4));
        expect(frame.destroyed).toBe(false);
        expect(source.destroyed).toBe(false);
    } finally {
        frame.destroy(true);
    }
});

test("a failed upload counts as attempted, while an absent renderer remains retryable", () => {
    const source = new BufferImageSource({ resource: new Uint8Array(4), width: 1, height: 1 });
    const frame = new Texture({ source });
    let attempts = 0;
    const renderer = {
        texture: {
            initSource: () => {
                attempts++;
                throw new Error("Context lost");
            },
        },
    } as unknown as Renderer;
    try {
        expect(prewarmAtlasTexture(undefined, frame)).toBe(false);
        expect(attempts).toBe(0);
        expect(prewarmAtlasTexture(renderer, frame)).toBe(true);
        expect(attempts).toBe(1);
        expect(source.destroyed).toBe(false);
    } finally {
        frame.destroy(true);
    }
});
