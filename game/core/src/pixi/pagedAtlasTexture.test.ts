import { expect, mock, test } from "bun:test";
import { BufferImageSource, Texture } from "pixi.js";

import { PagedAtlasTextureLoader } from "./pagedAtlasTexture";

const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
};
const bitmap = (width = 3072, height = 3072) => ({ width, height, close: mock(() => undefined) });
const fallbackTexture = () =>
    new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width: 3072, height: 3072 }) });
const fixture = (decode?: (blob: Blob) => Promise<ImageBitmap>) => {
    const fallback = fallbackTexture();
    const platform = {
        fetchBlob: mock(async (_url: string) => new Blob(["compressed page"])),
        decode,
        loadFallback: mock(async (_url: string) => fallback),
        unloadFallback: mock(async (_url: string) => fallback.destroy(true)),
    };
    return { platform, loader: new PagedAtlasTextureLoader(platform) };
};

test("a page reaches the renderer with decoded bitmap pixels and keeps them for context recovery", async () => {
    const pixels = bitmap();
    const f = fixture(async () => pixels as unknown as ImageBitmap);
    const page = await f.loader.load("page-url", 3072, 3072);
    expect(page.texture.source.resource).toBe(pixels);
    expect([page.texture.width, page.texture.height]).toEqual([3072, 3072]);
    expect(page.texture.source.alphaMode).toBe("premultiply-alpha-on-upload");
    expect(f.platform.loadFallback).not.toHaveBeenCalled();
    page.texture.source.unload();
    expect(pixels.close).not.toHaveBeenCalled();
    expect(page.texture.source.resource).toBe(pixels);
    await page.unload();
    await page.unload();
    expect(page.texture.destroyed).toBe(true);
    expect(pixels.close).toHaveBeenCalledTimes(1);
});

test("concurrent prefetches serialize pixel decodes, and a failed decode cannot block later pages", async () => {
    const completions: Array<{ resolve(image: ImageBitmap): void; reject(error: Error): void }> = [];
    const decode = mock(
        () =>
            new Promise<ImageBitmap>((resolve, reject) => {
                completions.push({ resolve, reject });
            }),
    );
    const f = fixture(decode);
    const pages = [0, 1, 2].map((index) => f.loader.load(`page-${index}`, 3072, 3072));
    await flush();
    expect(f.platform.fetchBlob).toHaveBeenCalledTimes(3);
    expect(decode).toHaveBeenCalledTimes(1);
    const first = bitmap();
    completions[0].resolve(first as unknown as ImageBitmap);
    await flush();
    expect(decode).toHaveBeenCalledTimes(2);
    completions[1].reject(new Error("browser decoder failed"));
    await flush();
    expect(decode).toHaveBeenCalledTimes(3);
    const last = bitmap();
    completions[2].resolve(last as unknown as ImageBitmap);
    const loaded = await Promise.all(pages);
    expect(f.platform.loadFallback).toHaveBeenCalledTimes(1);
    expect(f.platform.loadFallback).toHaveBeenCalledWith("page-1");
    for (const page of loaded) await page.unload();
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(last.close).toHaveBeenCalledTimes(1);
    expect(f.platform.unloadFallback).toHaveBeenCalledTimes(1);
});

test("unsupported decoders use the existing image loader without an extra fetch", async () => {
    const f = fixture();
    const page = await f.loader.load("legacy-page", 3072, 3072);
    expect(f.platform.fetchBlob).not.toHaveBeenCalled();
    expect(f.platform.loadFallback).toHaveBeenCalledWith("legacy-page");
    await page.unload();
    await page.unload();
    expect(f.platform.unloadFallback).toHaveBeenCalledTimes(1);
});

test("network preparation failures still allow a cached image to play", async () => {
    const decode = mock(async () => bitmap() as unknown as ImageBitmap);
    const f = fixture(decode);
    f.platform.fetchBlob.mockRejectedValueOnce(new Error("offline"));
    const page = await f.loader.load("cached-page", 3072, 3072);
    expect(decode).not.toHaveBeenCalled();
    expect(f.platform.loadFallback).toHaveBeenCalledTimes(1);
    await page.unload();
});

test("mismatched decoded pixels close before fallback, and malformed cached pages are unloaded", async () => {
    const wrong = bitmap(512, 512);
    const f = fixture(async () => wrong as unknown as ImageBitmap);
    await expect(f.loader.load("stale-page", 1024, 1024)).rejects.toThrow("Animation page dimensions differ");
    expect(wrong.close).toHaveBeenCalledTimes(1);
    expect(f.platform.unloadFallback).toHaveBeenCalledWith("stale-page");
});

const stripFixture = (
    crop?: (bitmap: ImageBitmap, x: number, y: number, w: number, h: number) => Promise<ImageBitmap>,
) => {
    const page = bitmap();
    const f = fixture(async () => page as unknown as ImageBitmap);
    (f.platform as { crop?: typeof crop }).crop = crop;
    return { ...f, page };
};

test("a page is cut into one strip per frame row, each with its own pixels, and the page bitmap is released", async () => {
    const cuts: Array<{ y: number; strip: ReturnType<typeof bitmap> }> = [];
    const f = stripFixture(async (_page, x, y, w, h) => {
        expect([x, w, h]).toEqual([0, 3072, 384]);
        const strip = bitmap(3072, 384);
        cuts.push({ y, strip });
        return strip as unknown as ImageBitmap;
    });
    const page = await f.loader.loadStrips("page-url", 3072, 3072, 384);
    expect(cuts.map((cut) => cut.y)).toEqual([0, 384, 768, 1152, 1536, 1920, 2304, 2688]);
    expect(page.strips).toHaveLength(8);
    page.strips.forEach((strip, row) => {
        expect(strip.source.resource).toBe(cuts[row].strip);
        expect(strip.frame.y).toBe(0);
        expect([strip.width, strip.height]).toEqual([3072, 384]);
        expect(strip.source.alphaMode).toBe("premultiply-alpha-on-upload");
    });
    // The whole page's pixels go as soon as the strips exist; each strip keeps its own for context recovery.
    expect(f.page.close).toHaveBeenCalledTimes(1);
    expect(cuts.every((cut) => cut.strip.close.mock.calls.length === 0)).toBe(true);
    await page.unload();
    await page.unload();
    expect(cuts.every((cut) => cut.strip.close.mock.calls.length === 1)).toBe(true);
    expect(page.strips.every((strip) => strip.destroyed)).toBe(true);
    expect(f.platform.loadFallback).not.toHaveBeenCalled();
});

test("a failed cut closes the pieces and falls back to regions of the whole page", async () => {
    const pieces: Array<ReturnType<typeof bitmap>> = [];
    let calls = 0;
    const f = stripFixture(async () => {
        calls++;
        if (calls === 3) throw new Error("crop failed");
        const piece = bitmap(3072, 384);
        pieces.push(piece);
        return piece as unknown as ImageBitmap;
    });
    const page = await f.loader.loadStrips("page-url", 3072, 3072, 384);
    expect(pieces.every((piece) => piece.close.mock.calls.length === 1)).toBe(true);
    expect(page.strips).toHaveLength(8);
    const source = page.strips[0].source;
    page.strips.forEach((strip, row) => {
        expect(strip.source).toBe(source);
        expect(strip.frame.y).toBe(row * 384);
        expect(strip.frame.height).toBe(384);
    });
    await page.unload();
    await page.unload();
    expect(source.destroyed).toBe(true);
});

test("without a cropper the strips are regions of the existing whole-page texture", async () => {
    const f = stripFixture(undefined);
    const page = await f.loader.loadStrips("page-url", 3072, 3072, 384);
    expect(new Set(page.strips.map((strip) => strip.source)).size).toBe(1);
    expect(page.strips[0].source.resource).toBe(f.page);
    expect(page.strips.map((strip) => strip.frame.y)).toEqual([0, 384, 768, 1152, 1536, 1920, 2304, 2688]);
    await page.unload();
    expect(f.page.close).toHaveBeenCalledTimes(1);
});
