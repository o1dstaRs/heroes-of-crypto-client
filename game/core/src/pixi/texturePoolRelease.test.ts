import { afterEach, describe, expect, test } from "bun:test";
import { FilterSystem, TexturePool, type Texture } from "pixi.js";

import { releaseIdlePooledTextures } from "./texturePoolRelease";

interface IFilterSlots {
    _pushFilterData(): { inputTexture: Texture | null; backTexture: Texture | null };
    _popFilterData(): unknown;
    _findFilterResolution(rootResolution: number): number;
}

/** Last frame drew a filter inside a filter: pop hands each slot's texture back but leaves it on the slot. */
const frameWithNestedFilter = (): { filter: IFilterSlots; lastFrameNestedTexture: Texture } => {
    const filter = new FilterSystem({} as never) as unknown as IFilterSlots;
    filter._pushFilterData();
    const nested = filter._pushFilterData();
    const lastFrameNestedTexture = TexturePool.getOptimalTexture(256, 256, 2, false);
    nested.inputTexture = lastFrameNestedTexture;
    filter._popFilterData();
    TexturePool.returnTexture(lastFrameNestedTexture);
    filter._popFilterData();
    return { filter, lastFrameNestedTexture };
};

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

    test("a nested filter's next frame finds no destroyed leftover once the renderer's filter stack forgets it", () => {
        const { filter, lastFrameNestedTexture } = frameWithNestedFilter();

        releaseIdlePooledTextures({ filter });

        expect(lastFrameNestedTexture.destroyed).toBe(true);
        filter._pushFilterData();
        filter._pushFilterData();
        expect(filter._findFilterResolution(1)).toBe(1);
    });

    test("left on the slot, that destroyed leftover makes the next nested push throw — the blank board", () => {
        const { filter } = frameWithNestedFilter();

        releaseIdlePooledTextures();

        filter._pushFilterData();
        filter._pushFilterData();
        expect(() => filter._findFilterResolution(1)).toThrow();
    });

    test("Pixi's own clear() is what drops the buckets and makes that hand-back throw", () => {
        const inUse = TexturePool.getOptimalTexture(300, 200, 1, false);

        TexturePool.clear();

        expect(() => TexturePool.returnTexture(inUse)).toThrow();
    });
});
