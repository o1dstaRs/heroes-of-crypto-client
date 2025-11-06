// game/core/src/pixi/PixiTextureLoader.ts
import { Assets, Texture } from "pixi.js";
import { images } from "../generated/image_imports";

/** Exact texture map keyed by your generated `images` object */
export type PreloadedPixiTextures = {
    [K in keyof typeof images]: Texture;
};

/** Optional parity type with width/height */
export interface PixiTextureInfo {
    texture: Texture;
    width: number;
    height: number;
}

/**
 * Zero-arg preload for the whole generated bundle.
 * Usage: `const textures = await preloadPixiTextures();`
 */
export async function preloadPixiTextures(onProgress?: (progress01: number) => void): Promise<PreloadedPixiTextures> {
    // Register (or overwrite) a named bundle for all assets
    Assets.addBundle("hoc", images);

    // Load the bundle; Pixi returns a map of Texture
    const loaded = await Assets.loadBundle("hoc", onProgress);

    // Cast to the exact key map so indexing is fully typed
    return loaded as PreloadedPixiTextures;
}

/**
 * If you want width/height alongside each texture.
 */
export async function preloadPixiTexturesWithInfo(
    onProgress?: (progress01: number) => void,
): Promise<{ [K in keyof typeof images]: PixiTextureInfo }> {
    const raw = await preloadPixiTextures(onProgress);
    const out = {} as { [K in keyof typeof images]: PixiTextureInfo };

    (Object.keys(raw) as Array<keyof typeof images>).forEach((k) => {
        const tex = raw[k];
        out[k] = { texture: tex, width: tex.width, height: tex.height };
    });

    return out;
}
