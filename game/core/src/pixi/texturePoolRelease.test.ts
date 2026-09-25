import { afterEach, describe, expect, test } from "bun:test";
import { TexturePool } from "pixi.js";

import { releaseIdlePooledTextures } from "./texturePoolRelease";

describe("releasing Pixi's idle pooled textures", () => {
    afterEach(() => {
        TexturePool.clear();
    });

    test("destroys what sits idle but lets a texture still in use come back to its bucket", () => {
        const inUse = TexturePool.getOptimalTexture(300, 200, 1, false);
        const idle = TexturePool.getOptimalTexture(300, 200, 1, false);
        TexturePool.returnTexture(idle);

        releaseIdlePooledTextures();

        expect(idle.destroyed).toBe(true);
        expect(() => TexturePool.returnTexture(inUse)).not.toThrow();
        expect(TexturePool.getOptimalTexture(300, 200, 1, false)).toBe(inUse);
    });

    test("Pixi's own clear() is what drops the buckets and makes that hand-back throw", () => {
        const inUse = TexturePool.getOptimalTexture(300, 200, 1, false);

        TexturePool.clear();

        expect(() => TexturePool.returnTexture(inUse)).toThrow();
    });
});
