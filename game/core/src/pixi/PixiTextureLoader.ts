import { Assets, Texture } from "pixi.js";
import { images as rawImages } from "../generated/image_imports";

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

/** Exact texture map keyed by your generated `images` object */
export type PreloadedPixiTextures = { [K in keyof ImagesMap]: Texture };

let loadedTextures: Partial<PreloadedPixiTextures> = {};
const registeredBundlesKey = "__hocPixiTextureLoaderRegisteredBundles";
const coreBundleName = "hoc_core";
const animationsBundleName = "hoc_animations";

function getRegisteredBundles(): Set<string> {
    const globalState = globalThis as Record<string, unknown>;
    const registeredBundles = globalState[registeredBundlesKey];
    if (registeredBundles instanceof Set) {
        return registeredBundles as Set<string>;
    }

    const nextRegisteredBundles = new Set<string>();
    globalState[registeredBundlesKey] = nextRegisteredBundles;
    return nextRegisteredBundles;
}

function addBundleOnce(bundleName: string, bundle: Record<string, { src: string }>): void {
    const registeredBundles = getRegisteredBundles();
    if (registeredBundles.has(bundleName)) {
        return;
    }

    Assets.addBundle(bundleName, bundle);
    registeredBundles.add(bundleName);
}

function getSplitBundles() {
    const core: Record<string, { src: string }> = {};
    const animations: Record<string, { src: string }> = {};

    for (const [k, v] of Object.entries(rawImages)) {
        const src = normalizeUrl(v, k);
        // Tier 2: Animations (_atlas)
        if (k.endsWith("_atlas")) {
            animations[k] = { src };
        } else {
            // Tier 1: Core
            core[k] = { src };
        }
    }
    return { core, animations };
}

export async function preloadCoreAssets(onProgress?: (p: number) => void): Promise<Partial<PreloadedPixiTextures>> {
    const { core } = getSplitBundles();
    if (Object.keys(core).length === 0) return loadedTextures;

    addBundleOnce(coreBundleName, core);
    const loaded = await Assets.loadBundle(coreBundleName, onProgress);
    loadedTextures = { ...loadedTextures, ...loaded };
    return loadedTextures;
}

export async function preloadAnimationAssets(
    onProgress?: (p: number) => void,
): Promise<Partial<PreloadedPixiTextures>> {
    const { animations } = getSplitBundles();
    if (Object.keys(animations).length === 0) return loadedTextures;

    addBundleOnce(animationsBundleName, animations);
    const loaded = await Assets.loadBundle(animationsBundleName, onProgress);
    loadedTextures = { ...loadedTextures, ...loaded };
    return loadedTextures;
}

/** Legacy: Loads everything (Tier 1 + Tier 2) - Kept for compatibility if needed, but we should switch */
export async function preloadPixiTextures(onProgress?: (p: number) => void): Promise<PreloadedPixiTextures> {
    await preloadCoreAssets((p) => onProgress?.(p * 0.5));
    await preloadAnimationAssets((p) => onProgress?.(0.5 + p * 0.5));
    return loadedTextures as PreloadedPixiTextures;
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
