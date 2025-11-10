// game/core/src/pixi/PixiTextureLoader.ts
import { Assets, Texture } from "pixi.js";
import { images as rawImages } from "../generated/image_imports";

/** Optional parity type with width/height */
export interface PixiTextureInfo {
    texture: Texture;
    width: number;
    height: number;
}

type ImagesMap = typeof rawImages;

function hasStringProp<T extends string>(obj: Record<string, unknown>, prop: T): obj is Record<T, string> {
    return typeof obj[prop] === "string";
}

// Strong runtime guard: make *anything* stringy or throw with context.
function normalizeUrl(v: unknown, key: string): string {
    if (typeof v === "string") return v;

    if (v && typeof v === "object") {
        const obj = v as Record<string, unknown>;

        // Parcel/Bundlers sometimes return a URL-like with href
        if (hasStringProp(obj, "href")) return obj.href;

        // Some loaders shape as { src }, some as { default }
        if (hasStringProp(obj, "src")) return obj.src;
        if (hasStringProp(obj, "default")) return obj.default;

        // Last resort: objects that stringify to a URL
        const toStr = obj.toString;
        if (typeof toStr === "function") {
            const s = toStr.call(obj);
            if (typeof s === "string" && /^(?:\/|https?:|blob:|data:)/.test(s)) return s;
        }
    }
    throw new TypeError(`Image "${key}" is not a URL-like string (got ${typeof v}).`);
}

function toPixiBundle(map: ImagesMap) {
    const out: Record<string, { src: string }> = {};
    for (const [k, v] of Object.entries(map)) {
        out[k] = { src: normalizeUrl(v, k) };
    }
    return out;
}

/** Exact texture map keyed by your generated `images` object */
export type PreloadedPixiTextures = { [K in keyof ImagesMap]: Texture };

export async function preloadPixiTextures(onProgress?: (p: number) => void): Promise<PreloadedPixiTextures> {
    const bundle = toPixiBundle(rawImages);
    Assets.addBundle("hoc", bundle);
    const loaded = await Assets.loadBundle("hoc", onProgress);
    return loaded as PreloadedPixiTextures;
}

/**
 * If you want width/height alongside each texture.
 */
export async function preloadPixiTexturesWithInfo(
    onProgress?: (progress01: number) => void,
): Promise<Record<keyof typeof rawImages, PixiTextureInfo>> {
    const raw = await preloadPixiTextures(onProgress);

    // build dynamically
    const out = {} as Record<keyof typeof rawImages, PixiTextureInfo>;

    (Object.keys(raw) as Array<keyof typeof rawImages>).forEach((k) => {
        const tex = raw[k];
        out[k] = { texture: tex, width: tex.width, height: tex.height };
    });

    return out; // now satisfies the exact type
}
