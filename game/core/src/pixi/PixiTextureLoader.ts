import { Assets, Texture, loadTextures } from "pixi.js";
import { images as rawImages } from "../imageAssets";
import { CREATURE_SPRITE_ANIMATION_SETTINGS, shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import { isUnitAnimationAtlasKey } from "./unitAtlasKeys";

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

// The board draws every creature's PERMANENT art from its idle/default atlas (quarter for 1x1, half
// for 2x2). Those are ~5% of the animation payload (~33MB of ~700MB), yet they used to ride in the
// same single Tier-2 bundle as every walk/attack/VFX atlas — so on a fresh cache the whole board sat
// on the old static tokens until hundreds of MB finished. They get their own bundle, loaded FIRST.
export function isIdleAtlasKey(key: string): boolean {
    return (
        isUnitAnimationAtlasKey(key) &&
        (key.includes("_idle") || key.includes("_default")) &&
        (key.endsWith("_atlas_quarter") || key.endsWith("_atlas_half"))
    );
}

/**
 * Runtime unit rendering resolves only `_atlas_quarter` and `_atlas_half`. The unsuffixed source
 * sheets are authoring/export inputs (often 4K x 5K) and can never be selected by
 * atlasImageKeyFromUnitAndState, so decoding them wastes several GiB without changing a pixel.
 */
export function isRedundantFullResolutionUnitAtlasKey(key: string): boolean {
    return isUnitAnimationAtlasKey(key) && key.endsWith("_atlas");
}

/**
 * Sidebar portraits and draft-screen backdrops are rendered by React as ordinary images, never by the
 * Pixi scene. The `_pick_sandbox_x2` portraits and silver pick icons deliberately stay in core because
 * Pixi's expandable Units overlay shares that art.
 */
export function isDeferredReactUiAssetKey(key: string): boolean {
    return (
        key.startsWith("pick_phase_") ||
        key.startsWith("pick_bundle_") ||
        key.startsWith("pick_l2_legacy_") ||
        key.startsWith("fight_results_") ||
        key.startsWith("left_sidebar_") ||
        key.startsWith("ui_sidebar_") ||
        key.startsWith("ui_up_next_") ||
        key.startsWith("sidebar_") ||
        key.endsWith("_left_screen_x2") ||
        key.endsWith("_portrait_full")
    );
}

const LIVE_ENVIRONMENT_ASSETS = new Set([
    "ambient_fire_video_torch_left_natural_v4_64_atlas",
    "ambient_fire_video_torch_right_natural_v4_64_atlas",
    "background_stone_tiles_sinister_16x16_original_restored",
]);

/**
 * Large environment exports kept for art comparison must not all become live GPU textures. The active
 * fire-pit overlay is also omitted here because DungeonVisuals already loads it lazily only for lava maps.
 */
export function isDeferredEnvironmentAssetKey(key: string): boolean {
    if (LIVE_ENVIRONMENT_ASSETS.has(key)) return false;
    if (
        key === "active_turn_blue_fire_atlas" ||
        key === "cemetery_obstacles_9x_256_atlas" ||
        key === "dungeon_god_rays_v2" ||
        key === "dungeon_volumetric_fog_v2" ||
        key === "lava_center_anim_atlas"
    ) {
        return true;
    }
    if (key.startsWith("fire_pit_") && (key.endsWith("_atlas") || key.endsWith("_atlas_half"))) return true;
    if (key.startsWith("ambient_fire_video_torch_") && key.endsWith("_atlas")) return true;
    if (key.startsWith("background_test_abyss_")) return true;
    return key.startsWith("background_stone_tiles") && key !== "background_new";
}

const LIVE_PLACEMENT_CARPET = /^placement_carpet_green_uniform_gold_aaa_[345]col_v16$/;
const LIVE_PLACEMENT_BORDER = /^placement_gold_outer_border_green_continuous_[3456]col_(?:14|16)row_v23$/;

/** Only the eleven keys returned by PixiDrawablePlacement's runtime selectors belong in core. */
export function isDeferredPlacementAssetKey(key: string): boolean {
    return key.startsWith("placement_") && !LIVE_PLACEMENT_CARPET.test(key) && !LIVE_PLACEMENT_BORDER.test(key);
}

/** Superseded creature exports; the board's approved files all end in `_battlefield_side_right_final_v1`. */
export function isDeferredLegacyCreatureAssetKey(key: string): boolean {
    if (key.endsWith("_final")) return true;
    if (/_portrait_full_v\d+$/.test(key)) return true;
    return key.includes("_battlefield_side_right_") && !key.endsWith("_battlefield_side_right_final_v1");
}

/** Approved full-resolution board figures load per creature present in the current match. */
export function isLazyBattlefieldCreatureAssetKey(key: string): boolean {
    return key.endsWith("_battlefield_side_right_final_v1");
}

const LAZY_PROJECTILE_ASSETS = new Set([
    "armor_piercing_bolt",
    "orc_throwing_axe",
    "arbalester_cyan_bolt",
    "centaur_spear_variant_4",
    "dryad_thorn_dart",
    "beholder_purple_eye_orb",
    "elf_emerald_arrow",
    "medusa_spectral_serpent",
    "cyclops_heavy_boulder",
    "monk_solar_orb",
    "tsar_cannon_molten_ball",
    "gargantuan_root_boulder",
]);

/** Large projectile cutouts load for the first matching shot instead of every fight. */
export function isLazyProjectileAssetKey(key: string): boolean {
    return LAZY_PROJECTILE_ASSETS.has(key);
}

/** Sandbox roster portraits are needed only before combat and are released when the fight starts. */
export function isLazyRosterAssetKey(key: string): boolean {
    return key.endsWith("_pick_sandbox_x2") || key.includes("_portrait_bg_");
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
