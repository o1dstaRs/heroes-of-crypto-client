import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
    BufferImageSource,
    ImageSource,
    Rectangle,
    type Renderer,
    RendererType,
    Texture,
    type TextureSource,
} from "pixi.js";

import { AtlasTexturePrewarmer, prewarmAtlasTexture } from "./prewarmAtlasTexture";

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

describe("temporary atlas bitmap preparation", () => {
    const originalImage = Object.getOwnPropertyDescriptor(globalThis, "HTMLImageElement");
    const originalBitmap = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
    const originalFetch = globalThis.fetch;
    class TestImage {
        public width = 8;
        public height = 8;
        public src = "https://example.test/creature_atlas.webp";
        public currentSrc = "https://example.test/current_atlas.webp";
    }
    beforeEach(() => {
        Object.defineProperty(globalThis, "HTMLImageElement", { configurable: true, value: TestImage });
        Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: () => undefined });
    });
    afterEach(() => {
        if (originalImage) Object.defineProperty(globalThis, "HTMLImageElement", originalImage);
        else Reflect.deleteProperty(globalThis, "HTMLImageElement");
        if (originalBitmap) Object.defineProperty(globalThis, "createImageBitmap", originalBitmap);
        else Reflect.deleteProperty(globalThis, "createImageBitmap");
        globalThis.fetch = originalFetch;
    });

    const frame = () => {
        const image = new TestImage() as unknown as HTMLImageElement;
        return new Texture({ source: new ImageSource({ resource: image }) });
    };
    const bitmap = () => ({ width: 8, height: 8, close: mock(() => undefined) }) as unknown as ImageBitmap;
    const renderer = (upload: (source: TextureSource) => void) =>
        ({ texture: { initSource: upload } }) as unknown as Renderer;
    const flush = async () => {
        for (let index = 0; index < 12; index++) await Promise.resolve();
    };

    test("already resident atlases skip bitmap decoding, but eviction and another renderer still prepare them", async () => {
        const texture = frame();
        const image = texture.source.resource;
        const prepared = bitmap();
        const prepare = mock(async () => prepared);
        const uploads: unknown[] = [];
        const target = { ...renderer((source) => uploads.push(source.resource)), uid: 17 };
        const prewarmer = new AtlasTexturePrewarmer(prepare);
        texture.source._gpuData[17] = { destroy: () => undefined } as never;

        expect(prewarmer.prewarm(target, texture)).toBe(true);
        await flush();
        expect(prepare).not.toHaveBeenCalled();
        expect(uploads).toEqual([image]);

        texture.source.unload();
        texture.source._gpuData[18] = { destroy: () => undefined } as never;
        expect(prewarmer.prewarm(target, texture)).toBe(false);
        await flush();
        expect(prepare).toHaveBeenCalledTimes(1);
        expect(prewarmer.prewarm(target, texture)).toBe(true);
        expect(uploads).toEqual([image, prepared]);
        expect(prepared.close).toHaveBeenCalledTimes(1);
        expect(texture.source.resource).toBe(image);
        prewarmer.destroy();
        texture.destroy(true);
    });

    test("a visible upload during preparation cancels and releases the now-redundant bitmap", async () => {
        const texture = frame();
        const prepared = bitmap();
        let finish!: (value: ImageBitmap) => void;
        let signal!: AbortSignal;
        const prewarmer = new AtlasTexturePrewarmer(async (_image, _source, currentSignal) => {
            signal = currentSignal;
            return new Promise<ImageBitmap>((resolve) => (finish = resolve));
        });
        const uploads: unknown[] = [];
        const target = { ...renderer((source) => uploads.push(source.resource)), uid: 17 };
        expect(prewarmer.prewarm(target, texture)).toBe(false);
        await flush();
        texture.source._gpuData[17] = { destroy: () => undefined } as never;
        expect(prewarmer.prewarm(target, texture)).toBe(true);
        expect(signal.aborted).toBe(true);
        expect(uploads).toEqual([texture.source.resource]);
        finish(prepared);
        await flush();
        expect(prepared.close).toHaveBeenCalledTimes(1);
        prewarmer.destroy();
        expect(prepared.close).toHaveBeenCalledTimes(1);
        texture.destroy(true);
    });

    test("uploads the prepared bitmap on the next caller step, restores the image and releases all temporary pixels", async () => {
        const texture = frame();
        const image = texture.source.resource;
        const prepared = bitmap();
        const uploads: unknown[] = [];
        const prewarmer = new AtlasTexturePrewarmer(async () => prepared);
        const target = renderer((source) => uploads.push(source.resource));
        expect(prewarmer.prewarm(target, texture)).toBe(false);
        await flush();
        expect(uploads).toHaveLength(0); // The preparation promise cannot upload during an attack.
        expect(prewarmer.prewarm(target, texture)).toBe(true);
        expect(uploads).toEqual([prepared]);
        expect(texture.source.resource).toBe(image);
        expect(prepared.close).toHaveBeenCalledTimes(1);
        texture.source.unload();
        prewarmAtlasTexture(target, texture);
        expect(uploads).toEqual([prepared, image]);
        prewarmer.destroy();
        expect(prepared.close).toHaveBeenCalledTimes(1);
        texture.destroy(true);
    });

    test("the production preparation path decodes cached compressed bytes with matching alpha semantics", async () => {
        const blob = new Blob(["encoded-atlas"]);
        const requests: Array<{ url: unknown; options: RequestInit | undefined }> = [];
        const decoded: Array<{ source: unknown; options: unknown }> = [];
        globalThis.fetch = (async (url, options) => {
            requests.push({ url, options });
            return { ok: true, blob: async () => blob };
        }) as typeof fetch;
        Object.defineProperty(globalThis, "createImageBitmap", {
            configurable: true,
            value: async (source: unknown, options: unknown) => {
                decoded.push({ source, options });
                return bitmap();
            },
        });
        for (const alphaMode of [
            "premultiply-alpha-on-upload",
            "premultiplied-alpha",
            "no-premultiply-alpha",
        ] as const) {
            const texture = frame();
            texture.source.alphaMode = alphaMode;
            const prewarmer = new AtlasTexturePrewarmer();
            const target = renderer(() => undefined);
            expect(prewarmer.prewarm(target, texture)).toBe(false);
            await flush();
            expect(prewarmer.prewarm(target, texture)).toBe(true);
            expect(decoded.at(-1)).toEqual({
                source: blob,
                options: { premultiplyAlpha: alphaMode === "premultiply-alpha-on-upload" ? "premultiply" : "none" },
            });
            expect(requests.at(-1)?.url).toBe("https://example.test/current_atlas.webp");
            expect(requests.at(-1)?.options?.cache).toBe("force-cache");
            expect(requests.at(-1)?.options?.signal).toBeInstanceOf(AbortSignal);
            prewarmer.destroy();
            texture.destroy(true);
        }
    });

    test("a changed candidate cannot start a second decode and discards the old bitmap when ready", async () => {
        const first = frame();
        const second = frame();
        const prepared = bitmap();
        let finish!: (value: ImageBitmap) => void;
        const prepare = mock(() => new Promise<ImageBitmap>((resolve) => (finish = resolve)));
        const prewarmer = new AtlasTexturePrewarmer(prepare);
        const target = renderer(() => undefined);
        expect(prewarmer.prewarm(target, first)).toBe(false);
        await flush();
        expect(prewarmer.prewarm(target, second)).toBe(false);
        expect(prepare).toHaveBeenCalledTimes(1);
        finish(prepared);
        await flush();
        expect(prewarmer.prewarm(target, second)).toBe(false);
        await flush();
        expect(prepare).toHaveBeenCalledTimes(2);
        expect(prepared.close).toHaveBeenCalledTimes(1);
        prewarmer.destroy();
        finish(bitmap());
        await flush();
        first.destroy(true);
        second.destroy(true);
    });

    test("scene teardown aborts pending work and closes a bitmap that completes after teardown", async () => {
        const texture = frame();
        const prepared = bitmap();
        let signal!: AbortSignal;
        let finish!: (value: ImageBitmap) => void;
        const prewarmer = new AtlasTexturePrewarmer(async (_image, _source, currentSignal) => {
            signal = currentSignal;
            return new Promise<ImageBitmap>((resolve) => (finish = resolve));
        });
        const upload = mock(() => undefined);
        const target = renderer(upload);
        prewarmer.prewarm(target, texture);
        await flush();
        prewarmer.destroy();
        expect(signal.aborted).toBe(true);
        finish(prepared);
        await flush();
        expect(prepared.close).toHaveBeenCalledTimes(1);
        expect(prewarmer.prewarm(target, texture)).toBe(false);
        expect(upload).not.toHaveBeenCalled();
        texture.destroy(true);
    });

    test("an empty prewarm scan cancels work without allowing overlapping replacement decodes", async () => {
        const first = frame();
        const second = frame();
        const prepared = bitmap();
        let finish!: (value: ImageBitmap) => void;
        const prepare = mock(() => new Promise<ImageBitmap>((resolve) => (finish = resolve)));
        const prewarmer = new AtlasTexturePrewarmer(prepare);
        const target = renderer(() => undefined);
        prewarmer.prewarm(target, first);
        await flush();
        prewarmer.cancel();
        expect(prewarmer.prewarm(target, second)).toBe(false);
        expect(prepare).toHaveBeenCalledTimes(1);
        finish(prepared);
        await flush();
        expect(prepared.close).toHaveBeenCalledTimes(1);
        prewarmer.prewarm(target, second);
        await flush();
        expect(prepare).toHaveBeenCalledTimes(2);
        prewarmer.destroy();
        finish(bitmap());
        await flush();
        first.destroy(true);
        second.destroy(true);
    });

    test("a replacement image published during preparation survives the pending upload", async () => {
        const texture = frame();
        const prepared = bitmap();
        const replacement = new TestImage() as unknown as HTMLImageElement;
        const uploads: unknown[] = [];
        const prewarmer = new AtlasTexturePrewarmer(async () => prepared);
        const target = renderer((source) => uploads.push(source.resource));
        prewarmer.prewarm(target, texture);
        texture.source.resource = replacement;
        await flush();
        expect(prewarmer.prewarm(target, texture)).toBe(true);
        expect(uploads).toEqual([replacement]);
        expect(texture.source.resource).toBe(replacement);
        expect(prepared.close).toHaveBeenCalledTimes(1);
        prewarmer.destroy();
        texture.destroy(true);
    });

    test("changed atlas dimensions discard the bitmap and preserve the loaded image and cel geometry", async () => {
        const texture = frame();
        const image = texture.source.resource;
        const prepared = { width: 16, height: 8, close: mock(() => undefined) } as unknown as ImageBitmap;
        const uploads: unknown[] = [];
        const prewarmer = new AtlasTexturePrewarmer(async () => prepared);
        const target = renderer((source) => uploads.push(source.resource));
        prewarmer.prewarm(target, texture);
        await flush();
        expect(prepared.close).toHaveBeenCalledTimes(1);
        expect(prewarmer.prewarm(target, texture)).toBe(true);
        expect(uploads).toEqual([image]);
        expect(texture.width).toBe(8);
        prewarmer.destroy();
        texture.destroy(true);
    });

    test("source destruction releases a prepared bitmap before the scene's next update", async () => {
        const texture = frame();
        const prepared = bitmap();
        const prewarmer = new AtlasTexturePrewarmer(async () => prepared);
        prewarmer.prewarm(
            renderer(() => undefined),
            texture,
        );
        await flush();
        texture.destroy(true);
        expect(prepared.close).toHaveBeenCalledTimes(1);
        prewarmer.destroy();
        expect(prepared.close).toHaveBeenCalledTimes(1);
    });

    test("decode failure keeps the original upload retry policy and never leaks a bitmap or replaces the source", async () => {
        const texture = frame();
        const image = texture.source.resource;
        const upload = mock(() => {
            throw new Error("Context lost");
        });
        const prewarmer = new AtlasTexturePrewarmer(async () => {
            throw new Error("Bitmap decode failed");
        });
        const target = renderer(upload);
        expect(prewarmer.prewarm(undefined, texture)).toBe(false);
        expect(prewarmer.prewarm(target, texture)).toBe(false);
        await flush();
        expect(prewarmer.prewarm(target, texture)).toBe(true);
        expect(upload).toHaveBeenCalledTimes(1);
        expect(texture.source.resource).toBe(image);
        prewarmer.destroy();
        texture.destroy(true);
    });

    test("upload failure still restores the original resource and closes the prepared bitmap", async () => {
        const texture = frame();
        const image = texture.source.resource;
        const prepared = bitmap();
        const prewarmer = new AtlasTexturePrewarmer(async () => prepared);
        const target = renderer(() => {
            throw new Error("Context lost");
        });
        prewarmer.prewarm(target, texture);
        await flush();
        expect(prewarmer.prewarm(target, texture)).toBe(true);
        expect(texture.source.resource).toBe(image);
        expect(prepared.close).toHaveBeenCalledTimes(1);
        prewarmer.destroy();
        texture.destroy(true);
    });

    test("browsers without bitmap support retain the synchronous image path", () => {
        Reflect.deleteProperty(globalThis, "createImageBitmap");
        const texture = frame();
        const prepare = mock(async () => bitmap());
        const upload = mock(() => undefined);
        const prewarmer = new AtlasTexturePrewarmer(prepare);
        expect(prewarmer.prewarm(renderer(upload), texture)).toBe(true);
        expect(upload).toHaveBeenCalledTimes(1);
        expect(prepare).not.toHaveBeenCalled();
        prewarmer.destroy();
        texture.destroy(true);
    });

    test("WebGPU retains its existing external-image upload path", () => {
        const texture = frame();
        const prepare = mock(async () => bitmap());
        const upload = mock(() => undefined);
        const prewarmer = new AtlasTexturePrewarmer(prepare);
        const target = { type: RendererType.WEBGPU, texture: { initSource: upload } } as unknown as Renderer;
        expect(prewarmer.prewarm(target, texture)).toBe(true);
        expect(upload).toHaveBeenCalledTimes(1);
        expect(prepare).not.toHaveBeenCalled();
        prewarmer.destroy();
        texture.destroy(true);
    });
});
