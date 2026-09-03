import { Assets, Texture, loadTextures } from "pixi.js";
import { images as rawImages } from "../imageAssets";
import { CREATURE_SPRITE_ANIMATION_SETTINGS, shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import {
    isDeferredEnvironmentAssetKey,
    isDeferredLegacyCreatureAssetKey,
    isDeferredPlacementAssetKey,
    isDeferredReactUiAssetKey,
    isDeferredUnitCardAssetKey,
    isIdleAtlasKey,
    isLazyBattlefieldCreatureAssetKey,
    isLazyProjectileAssetKey,
    isLazyRosterAssetKey,
    isRedundantFullResolutionUnitAtlasKey,
    isTransientLoadingScreenAssetKey,
} from "./imageAssetTiers";
import { isUnitAnimationAtlasKey } from "./unitAtlasKeys";

export {
    isDeferredEnvironmentAssetKey,
    isDeferredLegacyCreatureAssetKey,
    isDeferredPlacementAssetKey,
    isDeferredReactUiAssetKey,
    isDeferredUnitCardAssetKey,
    isIdleAtlasKey,
    isLazyBattlefieldCreatureAssetKey,
    isLazyProjectileAssetKey,
    isLazyRosterAssetKey,
    isRedundantFullResolutionUnitAtlasKey,
    isTransientLoadingScreenAssetKey,
} from "./imageAssetTiers";

// Decode textures via <img> instead of createImageBitmap. Chrome intermittently throws
// "InvalidStateError: The source image could not be decoded" from createImageBitmap when many large
// WebP atlases decode concurrently — and our core bundle preloads every `_atlas_quarter` at once, so a
// single flaky decode aborts the whole bundle and blocks init. The <img> path (img.decode()) is a hair
// slower but reliable and still off the main thread, with no createImageBitmap/worker concurrency flake.
if (loadTextures.config) {
    loadTextures.config.preferWorkers = false;
    loadTextures.config.preferCreateImageBitmap = false;
}

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
const idleAtlasesBundleName = "hoc_idle_atlases";
const animationsBundleName = "hoc_animations";

interface SplitBundleOptions {
    animationsEnabled?: boolean;
}

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

export function getSplitBundles(options: SplitBundleOptions = {}) {
    const animationsEnabled = options.animationsEnabled ?? CREATURE_SPRITE_ANIMATION_SETTINGS.enabled;
    const core: Record<string, { src: string }> = {};
    const idleAtlases: Record<string, { src: string }> = {};
    const animations: Record<string, { src: string }> = {};
    const deferredUnitAtlases: Record<string, { src: string }> = {};
    const deferredReactUiAssets: Record<string, { src: string }> = {};
    const deferredEnvironmentAssets: Record<string, { src: string }> = {};
    const deferredPlacementAssets: Record<string, { src: string }> = {};
    const deferredLegacyCreatureAssets: Record<string, { src: string }> = {};
    const deferredUnitCardAssets: Record<string, { src: string }> = {};
    const transientLoadingScreenAssets: Record<string, { src: string }> = {};
    const lazyBattlefieldCreatureAssets: Record<string, { src: string }> = {};
    const lazyProjectileAssets: Record<string, { src: string }> = {};
    const lazyRosterAssets: Record<string, { src: string }> = {};
    const excludedFullResolutionUnitAtlases: Record<string, { src: string }> = {};

    for (const [k, v] of Object.entries(rawImages)) {
        const src = normalizeUrl(v, k);
        // Only per-unit atlases are supplementary. Terrain and VFX atlases belong to core because the
        // board uses them at first paint. Unit source-resolution sheets are authoring duplicates: the
        // renderer exclusively asks for their quarter/half variants, so never decode those originals.
        if (isRedundantFullResolutionUnitAtlasKey(k)) {
            excludedFullResolutionUnitAtlases[k] = { src };
        } else if (isUnitAnimationAtlasKey(k)) {
            if (!shouldPreloadUnitAnimationAtlas(k, animationsEnabled)) {
                deferredUnitAtlases[k] = { src };
            } else if (isIdleAtlasKey(k)) {
                idleAtlases[k] = { src };
            } else {
                animations[k] = { src };
            }
        } else if (isDeferredReactUiAssetKey(k)) {
            deferredReactUiAssets[k] = { src };
        } else if (isDeferredEnvironmentAssetKey(k)) {
            deferredEnvironmentAssets[k] = { src };
        } else if (isDeferredPlacementAssetKey(k)) {
            deferredPlacementAssets[k] = { src };
        } else if (isDeferredLegacyCreatureAssetKey(k)) {
            deferredLegacyCreatureAssets[k] = { src };
        } else if (isDeferredUnitCardAssetKey(k)) {
            deferredUnitCardAssets[k] = { src };
        } else if (isTransientLoadingScreenAssetKey(k)) {
            transientLoadingScreenAssets[k] = { src };
        } else if (isLazyBattlefieldCreatureAssetKey(k)) {
            lazyBattlefieldCreatureAssets[k] = { src };
        } else if (isLazyProjectileAssetKey(k)) {
            lazyProjectileAssets[k] = { src };
        } else if (isLazyRosterAssetKey(k)) {
            lazyRosterAssets[k] = { src };
        } else {
            // Tier 1: Core
            core[k] = { src };
        }
    }
    return {
        core,
        idleAtlases,
        animations,
        deferredUnitAtlases,
        deferredReactUiAssets,
        deferredEnvironmentAssets,
        deferredPlacementAssets,
        deferredLegacyCreatureAssets,
        deferredUnitCardAssets,
        transientLoadingScreenAssets,
        lazyBattlefieldCreatureAssets,
        lazyProjectileAssets,
        lazyRosterAssets,
        excludedFullResolutionUnitAtlases,
    };
}

/** Drop pre-fight roster textures after their overlay is destroyed; a rematch loads them again on demand. */
export async function unloadRosterAssets(): Promise<void> {
    const { lazyRosterAssets } = getSplitBundles();
    const loadedEntries = Object.entries(lazyRosterAssets).filter(([, asset]) => Assets.cache.has(asset.src));
    await Promise.allSettled(loadedEntries.map(([, asset]) => Assets.unload(asset.src)));
    for (const [key] of loadedEntries) {
        delete (loadedTextures as Record<string, Texture | undefined>)[key];
    }
}

export async function preloadCoreAssets(onProgress?: (p: number) => void): Promise<Partial<PreloadedPixiTextures>> {
    const { core } = getSplitBundles();
    if (Object.keys(core).length === 0) return loadedTextures;

    addBundleOnce(coreBundleName, core);
    const loaded = await Assets.loadBundle(coreBundleName, onProgress);
    loadedTextures = { ...loadedTextures, ...loaded };
    return loadedTextures;
}

/** Tier 2a: the idle/default board atlases only — small, and every visible creature needs one. */
export async function preloadIdleAtlasAssets(
    onProgress?: (p: number) => void,
): Promise<Partial<PreloadedPixiTextures>> {
    const { idleAtlases } = getSplitBundles();
    if (Object.keys(idleAtlases).length === 0) return loadedTextures;

    const bundleName = `${idleAtlasesBundleName}_${CREATURE_SPRITE_ANIMATION_SETTINGS.enabled ? "full" : "static"}`;
    addBundleOnce(bundleName, idleAtlases);
    const loaded = await Assets.loadBundle(bundleName, onProgress);
    loadedTextures = { ...loadedTextures, ...loaded };
    return loadedTextures;
}

/** Tier 2b: the remaining walk/attack/VFX atlases. */
export async function preloadAnimationAssets(
    onProgress?: (p: number) => void,
): Promise<Partial<PreloadedPixiTextures>> {
    const { animations } = getSplitBundles();
    if (Object.keys(animations).length === 0) return loadedTextures;

    const bundleName = `${animationsBundleName}_${CREATURE_SPRITE_ANIMATION_SETTINGS.enabled ? "full" : "static"}`;
    addBundleOnce(bundleName, animations);
    const loaded = await Assets.loadBundle(bundleName, onProgress);
    loadedTextures = { ...loadedTextures, ...loaded };
    return loadedTextures;
}

/** Legacy: Loads everything (Tier 1 + Tier 2) - Kept for compatibility if needed, but we should switch */
export async function preloadPixiTextures(onProgress?: (p: number) => void): Promise<PreloadedPixiTextures> {
    await preloadCoreAssets((p) => onProgress?.(p * 0.5));
    await preloadIdleAtlasAssets((p) => onProgress?.(0.5 + p * 0.1));
    await preloadAnimationAssets((p) => onProgress?.(0.6 + p * 0.4));
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
