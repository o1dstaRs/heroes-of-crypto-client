import { animationAtlases } from "../generated/animation_atlases";
import { images } from "../imageAssets";
import halfBodyAtlases from "./halfBodyAtlases.json";

/**
 * Creature animation atlases authored with large frames are decoded at half size before GPU upload.
 *
 * Measured in a live AI-vs-AI match (2026-11-20): each client held about 3.7 GB of decoded textures, 51
 * of them 4096x2048 or larger (Griffin's idle sheet alone was 342 MB). The renderer's backing buffer is
 * capped at 2560x1440 (`renderResolution.ts`), and at that cap creature frames of 768 px and more were
 * drawn at 0.29-0.39 of their source pixels. Halved, they still supply at least one texel per screen
 * pixel, so the board looks the same while those atlases take a quarter of the memory.
 *
 * Sprite size is derived from the frame texture's own size, so a halved frame is scaled back up to the
 * same board height. Frame slicing reads the divider from the decoded size (see `runtimeAtlasDivider`),
 * which also keeps a browser that falls back to full-size decoding correct.
 */
export const RUNTIME_HALVED_MIN_FRAME_PX = 768;

/**
 * Only creature body clips, which RenderableUnit slices through `runtimeAtlasDivider`. Effect sheets,
 * projectiles and sidebar portrait sheets are sliced elsewhere with full-resolution rectangles.
 */
const BODY_STATES = /^(idle|walk|flight_walk|hit|death|cast|(melee_)?attack(_up|_down)?)$/;
/**
 * Creatures whose helpers slice body atlases with fixed full-resolution pixels: Leprechaun's lab idle
 * requires a 4096x3072 sheet, Troll's attack guard pads its idle frame to 1152/768 px, and Tsar Cannon's
 * wheel and lab visuals cut 768 px cells. They upload at their authored size (see transportRuleKeys).
 */
const FIXED_PIXEL_PREFIXES = ["leprechaun_lab_", "troll_", "tsar_cannon"];
const isAnyBodyAtlasKey = (key: string): boolean => !key.startsWith("vfx_") && !key.includes("left_screen");
const isFixedPixelAtlasKey = (key: string): boolean => FIXED_PIXEL_PREFIXES.some((prefix) => key.startsWith(prefix));

const assetPath = (url: string): string => new URL(url, "https://scene.invalid").pathname;

/** Atlases the release already ships at half size (scripts/build_half_body_atlases.ts). */
const prebuiltHalfKeys = new Set(Object.keys(halfBodyAtlases.atlases));
/**
 * Every large body atlas by rule (frame size, state, exclusions), whether or not this build's image map
 * carries it. The development map leaves out a full-size key that has a hand-made `_half`/`_quarter`
 * variant, so the release pipeline and its tests read this set, never the map-dependent one below.
 */
const ruleKeys = new Set<string>();
/**
 * Large body atlases of the fixed-pixel creatures. The release ships them halved for transport only: the
 * decoder restores their authored size before upload, so their helpers keep slicing full-size pixels and
 * only the download shrinks (measured 2026-11-20: 37 MB of a match's images, 28 MB of it saved).
 */
const transportRuleKeys = new Set<string>();
/** Served path -> width of the halved file the release ships for it. */
const restoredWidths = new Map<string, number>();
const catalogWidth = (key: string): number | undefined =>
    (halfBodyAtlases.atlases as Record<string, { width?: number }>)[key]?.width;
/** The rule set as loaded by this build: halved by the release or by the browser. */
const candidateKeys = new Set<string>();
const halvedKeys = new Set<string>();
const halvedPaths = new Set<string>();
for (const [unit, states] of Object.entries(animationAtlases as Record<string, Record<string, unknown>>)) {
    for (const [state, value] of Object.entries(states)) {
        const meta = value as { frameWidth?: number; frameHeight?: number } | undefined;
        if (!meta?.frameWidth || !meta.frameHeight || !BODY_STATES.test(state)) continue;
        if (Math.max(meta.frameWidth, meta.frameHeight) < RUNTIME_HALVED_MIN_FRAME_PX) continue;
        const key = `${unit.toLowerCase().replace(/ /g, "_")}_${state}_atlas`;
        if (!isAnyBodyAtlasKey(key)) continue;
        if (isFixedPixelAtlasKey(key)) {
            transportRuleKeys.add(key);
            const url = (images as Record<string, unknown>)[key];
            if (typeof url === "string" && prebuiltHalfKeys.has(key)) {
                candidateKeys.add(key);
                restoredWidths.set(assetPath(url), catalogWidth(key) ?? 0);
            }
            continue;
        }
        ruleKeys.add(key);
        const url = (images as Record<string, unknown>)[key];
        if (typeof url !== "string") continue;
        candidateKeys.add(key);
        if (prebuiltHalfKeys.has(key)) continue;
        halvedKeys.add(key);
        halvedPaths.add(assetPath(url));
    }
}

/** Halved in the browser after download: the release still ships this atlas at full size. */
export const isRuntimeHalvedAtlasKey = (key: string): boolean => halvedKeys.has(key);
export const isRuntimeHalvedAtlasUrl = (url: string): boolean => halvedPaths.has(assetPath(url));
export const runtimeHalvedAtlasKeys = (): ReadonlySet<string> => halvedKeys;
/** Shipped already halved; decoded off the main thread like the others, never halved again. */
export const isPrebuiltHalfAtlasKey = (key: string): boolean =>
    prebuiltHalfKeys.has(key) && candidateKeys.has(key) && !transportRuleKeys.has(key);
/** Every large body atlas by rule, independent of the image map. The release derives files for these. */
export const halvedAtlasCandidateKeys = (): ReadonlySet<string> => ruleKeys;
/** Large body atlases of fixed-pixel creatures: shipped halved, restored to full size on decode. */
export const halfTransportCandidateKeys = (): ReadonlySet<string> => transportRuleKeys;
/**
 * Restore this atlas to its authored size? Only the release's halved copy is restored. A development
 * checkout serves the authored master under the same URL, and doubling that would draw a zoomed quarter
 * of every frame (seen locally on Troll and Leprechaun, 2026-11-25). Pass the downloaded file's width when
 * it is known; without it the URL decides.
 */
export const isRestoredHalfAtlasUrl = (url: string, shippedWidth?: number): boolean => {
    const halfWidth = restoredWidths.get(assetPath(url));
    return halfWidth !== undefined && (shippedWidth === undefined || shippedWidth === halfWidth);
};
/** Decode these off the main thread (see decodedSceneTextures.ts). */
export const isHalfSizeAtlasKey = (key: string): boolean => candidateKeys.has(key);

/**
 * Divider between the authored frame size in the atlas metadata and the decoded texture. File suffixes
 * name pre-reduced variants. A large body atlas is measured: the release ships most of them already
 * halved, the browser halves the rest, and a full-size fallback (an older art checkout, a browser that
 * cannot resample) stays at 1.
 */
export const runtimeAtlasDivider = (
    imageKey: string,
    meta: { atlasWidth?: number },
    decodedWidth: number | undefined,
): number => {
    const suffixDivider = imageKey.endsWith("_half") ? 2 : imageKey.endsWith("_quarter") ? 4 : 1;
    if (!ruleKeys.has(imageKey) || !meta.atlasWidth || !decodedWidth) return suffixDivider;
    // Only an exact half is the loader's resample; any other size keeps the authored slicing.
    return Math.abs(meta.atlasWidth - decodedWidth * 2) <= 1 ? 2 : suffixDivider;
};
