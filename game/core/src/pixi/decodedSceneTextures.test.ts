import { expect, mock, test } from "bun:test";
import { Loader, Texture } from "pixi.js";
import { createDecodedSceneTextureParser, webpWidthFromHeader } from "./decodedSceneTextures";

const tick = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
};
const pixels = () => ({ width: 3072, height: 1536, close: mock(() => undefined) });
const fixture = (
    decode: (blob: Blob, options: ImageBitmapOptions) => Promise<ImageBitmap> = async () =>
        pixels() as unknown as ImageBitmap,
) => {
    const platform = {
        fetchBlob: mock(async () => new Blob(["atlas"])),
        decode: mock(decode),
        supported: () => true,
        fallback: mock(async () => Texture.WHITE),
    };
    const parser = createDecodedSceneTextureParser(["/assets/atlas.webp"], platform);
    const loader = new Loader();
    const load = (url = "/assets/atlas.webp") => parser.load!(url, { src: url }, loader) as Promise<Texture>;
    return { platform, parser, load };
};

test("only selected scene images use decoded pixels; unsupported browsers keep the image loader", () => {
    const { parser, platform } = fixture();
    expect(parser.test!("https://game.example/assets/atlas.webp?v=1")).toBe(true);
    expect(parser.test!("https://game.example/assets/sidebar.webp")).toBe(false);
    platform.supported = () => false;
    expect(parser.test!("/assets/atlas.webp")).toBe(false);
});

test("texture is published with native decoded pixels, retained for GPU recovery and closed on unload", async () => {
    const bitmap = pixels();
    const { load, parser, platform } = fixture(async () => bitmap as unknown as ImageBitmap);
    const texture = await load();
    expect(texture.source.resource).toBe(bitmap);
    expect([texture.width, texture.height]).toEqual([3072, 1536]);
    expect(platform.decode.mock.calls[0][1]).toEqual({ premultiplyAlpha: "premultiply" });
    texture.source.unload();
    expect(bitmap.close).not.toHaveBeenCalled();
    parser.unload!(texture);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(platform.fallback).not.toHaveBeenCalled();
});

test("decodes stay serial and a failed atlas cannot strand later loads", async () => {
    const completions: Array<{ resolve(value: ImageBitmap): void; reject(error: Error): void }> = [];
    const { load, parser, platform } = fixture(
        () => new Promise<ImageBitmap>((resolve, reject) => completions.push({ resolve, reject })),
    );
    const loading = [load(), load(), load()];
    await tick();
    expect(platform.fetchBlob).toHaveBeenCalledTimes(3);
    expect(platform.decode).toHaveBeenCalledTimes(1);
    completions[0].resolve(pixels() as unknown as ImageBitmap);
    await tick();
    expect(platform.decode).toHaveBeenCalledTimes(2);
    completions[1].reject(new Error("Browser decode failed"));
    await tick();
    expect(platform.decode).toHaveBeenCalledTimes(3);
    completions[2].resolve(pixels() as unknown as ImageBitmap);
    const textures = await Promise.all(loading);
    expect(platform.fallback).toHaveBeenCalledTimes(1);
    expect(textures[1]).toBe(Texture.WHITE);
    parser.unload!(textures[0]);
    parser.unload!(textures[2]);
});

test("selected atlases upload at half size inside the serial decode slot and free the full-size pixels", async () => {
    const full = pixels();
    const half = { width: 1536, height: 768, close: mock(() => undefined) };
    const platform = {
        fetchBlob: mock(async () => new Blob(["atlas"])),
        decode: mock(async () => full as unknown as ImageBitmap),
        resize: mock(async (_bitmap: ImageBitmap, _width: number, _height: number) => half as unknown as ImageBitmap),
        supported: () => true,
        fallback: mock(async () => Texture.WHITE),
    };
    const parser = createDecodedSceneTextureParser(["/assets/atlas.webp", "/assets/other.webp"], platform, (url) =>
        url.includes("atlas.webp"),
    );
    const loader = new Loader();
    const texture = (await parser.load!("/assets/atlas.webp", { src: "/assets/atlas.webp" }, loader)) as Texture;
    expect([platform.resize.mock.calls[0][1], platform.resize.mock.calls[0][2]]).toEqual([1536, 768]);
    expect(full.close).toHaveBeenCalledTimes(1);
    expect(texture.source.resource).toBe(half);
    expect([texture.width, texture.height]).toEqual([1536, 768]);
    const other = (await parser.load!("/assets/other.webp", { src: "/assets/other.webp" }, loader)) as Texture;
    expect(platform.resize).toHaveBeenCalledTimes(1);
    expect(other.width).toBe(3072);
});

test("a failed resample keeps the full-size pixels open and usable", async () => {
    const full = pixels();
    const platform = {
        fetchBlob: mock(async () => new Blob(["atlas"])),
        decode: mock(async () => full as unknown as ImageBitmap),
        resize: mock(async () => {
            throw new Error("resize unsupported");
        }),
        supported: () => true,
        fallback: mock(async () => Texture.WHITE),
    };
    const parser = createDecodedSceneTextureParser(["/assets/atlas.webp"], platform, () => true);
    const texture = (await parser.load!("/assets/atlas.webp", { src: "/assets/atlas.webp" }, new Loader())) as Texture;
    expect(texture.source.resource).toBe(full);
    expect(full.close).not.toHaveBeenCalled();
    expect(platform.fallback).not.toHaveBeenCalled();
});

test("selected atlases are decoded and halved off the main thread when the platform can", async () => {
    const half = { width: 1536, height: 768, close: mock(() => undefined) };
    const platform = {
        fetchBlob: mock(async () => new Blob(["atlas"])),
        decode: mock(async () => pixels() as unknown as ImageBitmap),
        resize: mock(async () => half as unknown as ImageBitmap),
        decodeScaled: mock(
            async (_blob: Blob, _options: ImageBitmapOptions, _factor: number) => half as unknown as ImageBitmap,
        ),
        supported: () => true,
        fallback: mock(async () => Texture.WHITE),
    };
    const parser = createDecodedSceneTextureParser(["/assets/atlas.webp", "/assets/other.webp"], platform, (url) =>
        url.includes("atlas.webp"),
    );
    const loader = new Loader();
    const texture = (await parser.load!("/assets/atlas.webp", { src: "/assets/atlas.webp" }, loader)) as Texture;
    expect(platform.decodeScaled).toHaveBeenCalledTimes(1);
    expect(platform.decodeScaled.mock.calls[0][1]).toEqual({ premultiplyAlpha: "premultiply" });
    expect(platform.decodeScaled.mock.calls[0][2]).toBe(0.5);
    expect(platform.decode).not.toHaveBeenCalled();
    expect(platform.resize).not.toHaveBeenCalled();
    expect(texture.source.resource).toBe(half);
    // Atlases that keep their authored size never go through the worker.
    await parser.load!("/assets/other.webp", { src: "/assets/other.webp" }, loader);
    expect(platform.decodeScaled).toHaveBeenCalledTimes(1);
    expect(platform.decode).toHaveBeenCalledTimes(1);
});

test("a failed off-thread halving falls back to resampling in place", async () => {
    const full = pixels();
    const half = { width: 1536, height: 768, close: mock(() => undefined) };
    const platform = {
        fetchBlob: mock(async () => new Blob(["atlas"])),
        decode: mock(async () => full as unknown as ImageBitmap),
        resize: mock(async () => half as unknown as ImageBitmap),
        decodeScaled: mock(async () => {
            throw new Error("worker unavailable");
        }),
        supported: () => true,
        fallback: mock(async () => Texture.WHITE),
    };
    const parser = createDecodedSceneTextureParser(["/assets/atlas.webp"], platform, () => true);
    const texture = (await parser.load!("/assets/atlas.webp", { src: "/assets/atlas.webp" }, new Loader())) as Texture;
    expect(platform.decode).toHaveBeenCalledTimes(1);
    expect(platform.resize).toHaveBeenCalledTimes(1);
    expect(full.close).toHaveBeenCalledTimes(1);
    expect(texture.source.resource).toBe(half);
    expect(platform.fallback).not.toHaveBeenCalled();
});

test("an atlas shipped halved for transport is restored to its authored size before upload", async () => {
    const shipped = { width: 1536, height: 768, close: mock(() => undefined) };
    const restored = { width: 3072, height: 1536, close: mock(() => undefined) };
    const platform = {
        fetchBlob: mock(async () => new Blob(["atlas"])),
        decode: mock(async () => shipped as unknown as ImageBitmap),
        resize: mock(
            async (_bitmap: ImageBitmap, _width: number, _height: number) => restored as unknown as ImageBitmap,
        ),
        decodeScaled: mock(async () => {
            throw new Error("worker unavailable");
        }),
        supported: () => true,
        fallback: mock(async () => Texture.WHITE),
    };
    const parser = createDecodedSceneTextureParser(
        ["/assets/cannon.webp"],
        platform,
        () => false,
        (url) => url.includes("cannon"),
    );
    const texture = (await parser.load!(
        "/assets/cannon.webp",
        { src: "/assets/cannon.webp" },
        new Loader(),
    )) as Texture;
    // The worker was asked first, then the in-place fallback doubled the shipped pixels.
    expect(platform.decodeScaled).toHaveBeenCalledTimes(1);
    expect(platform.resize.mock.calls[0].slice(1)).toEqual([3072, 1536]);
    expect(shipped.close).toHaveBeenCalledTimes(1);
    expect(texture.source.resource).toBe(restored);
    expect([texture.width, texture.height]).toEqual([3072, 1536]);
});

/** The first 30 bytes of an extended (VP8X) WebP of the given size. */
const vp8xHeader = (width: number, height: number): Uint8Array => {
    const header = new Uint8Array(30);
    header.set(new TextEncoder().encode("RIFF"), 0);
    header.set(new TextEncoder().encode("WEBPVP8X"), 8);
    header.set([(width - 1) & 0xff, ((width - 1) >> 8) & 0xff, (width - 1) >> 16], 24);
    header.set([(height - 1) & 0xff, ((height - 1) >> 8) & 0xff, (height - 1) >> 16], 27);
    return header;
};

test("WebP headers give the file's width in all three formats", () => {
    expect(webpWidthFromHeader(vp8xHeader(3072, 1536))).toBe(3072);
    const lossless = new Uint8Array(30);
    lossless.set(new TextEncoder().encode("RIFF"), 0);
    lossless.set(new TextEncoder().encode("WEBPVP8L"), 8);
    lossless.set([0x2f, (1536 - 1) & 0xff, ((1536 - 1) >> 8) & 0x3f], 20);
    expect(webpWidthFromHeader(lossless)).toBe(1536);
    const lossy = new Uint8Array(30);
    lossy.set(new TextEncoder().encode("RIFF"), 0);
    lossy.set(new TextEncoder().encode("WEBPVP8 "), 8);
    lossy.set([0x9d, 0x01, 0x2a, 2048 & 0xff, 2048 >> 8], 23);
    expect(webpWidthFromHeader(lossy)).toBe(2048);
    expect(webpWidthFromHeader(new TextEncoder().encode("atlas"))).toBeUndefined();
});

test("an authored full-size file under a restored URL is uploaded as it is, never doubled", async () => {
    // A development checkout serves Troll's 3072 px master where the release serves its 1536 px half.
    const authored = { width: 3072, height: 1536, close: mock(() => undefined) };
    const platform = {
        fetchBlob: mock(async () => new Blob([vp8xHeader(3072, 1536).slice().buffer as ArrayBuffer])),
        decode: mock(async () => authored as unknown as ImageBitmap),
        resize: mock(async () => {
            throw new Error("must not resample");
        }),
        decodeScaled: mock(async () => {
            throw new Error("must not resample");
        }),
        supported: () => true,
        fallback: mock(async () => Texture.WHITE),
    };
    const restoreWidths: (number | undefined)[] = [];
    const parser = createDecodedSceneTextureParser(
        ["/assets/troll.webp"],
        platform,
        () => false,
        (_url, shippedWidth) => {
            restoreWidths.push(shippedWidth);
            return shippedWidth === undefined || shippedWidth === 1536;
        },
    );
    const texture = (await parser.load!("/assets/troll.webp", { src: "/assets/troll.webp" }, new Loader())) as Texture;
    expect(restoreWidths).toEqual([undefined, 3072]);
    expect(platform.decodeScaled).not.toHaveBeenCalled();
    expect(platform.resize).not.toHaveBeenCalled();
    expect(texture.source.resource).toBe(authored);
    expect([texture.width, texture.height]).toEqual([3072, 1536]);
});

test("a restore that cannot resample at all goes to the last-resort loader instead of this parser's upload", async () => {
    // Unreachable in browsers with a 2D canvas (see browserPlatform.resize); kept explicit for the rest.
    const shipped = { width: 1536, height: 768, close: mock(() => undefined) };
    const platform = {
        fetchBlob: mock(async () => new Blob(["atlas"])),
        decode: mock(async () => shipped as unknown as ImageBitmap),
        resize: mock(async () => {
            throw new Error("no resampling");
        }),
        supported: () => true,
        fallback: mock(async () => Texture.WHITE),
    };
    const parser = createDecodedSceneTextureParser(
        ["/assets/cannon.webp"],
        platform,
        () => false,
        () => true,
    );
    const texture = await parser.load!("/assets/cannon.webp", { src: "/assets/cannon.webp" }, new Loader());
    expect(shipped.close).toHaveBeenCalledTimes(1);
    expect(platform.fallback).toHaveBeenCalledTimes(1);
    expect(texture).toBe(Texture.WHITE);
});
