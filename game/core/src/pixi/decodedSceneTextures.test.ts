import { expect, mock, test } from "bun:test";
import { Loader, Texture } from "pixi.js";
import { createDecodedSceneTextureParser } from "./decodedSceneTextures";

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
