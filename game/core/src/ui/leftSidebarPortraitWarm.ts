import { factionPortraitBackgroundSources } from "./creaturePortraitBackground";
import {
    factionPortraitGlowSources,
    resolveCreaturePortraitBackgroundMotion,
} from "./creaturePortraitBackgroundMotion";
import { resolveCreaturePortraitVisual } from "./creaturePortraitVisual";
import { enqueueDecodedImage, isDecodedImageReady, pinDecodedImages, warmDecodedImage } from "./decodedImageCache";
import { warmAtlas } from "./LeftSideBar/unitAtlas";
import { resolveLeftSidebarPortraitAnimation } from "./leftSidebarPortraitAnimation";
import { resolveLeftSidebarPortraitArt } from "./leftSidebarPortraitArt";

export interface LeftSidebarPortraitSources {
    creature?: string;
    background?: string;
    glow?: string;
    atlas?: string;
}

let sharedLayersStarted = false;

/** The cutout, the faction plate behind it, and the optional idle sheet. These are separate files. */
export const leftSidebarPortraitSources = (creatureId: number): LeftSidebarPortraitSources => {
    const art = resolveLeftSidebarPortraitArt(creatureId);
    const visual = resolveCreaturePortraitVisual(creatureId);
    const animation = resolveLeftSidebarPortraitAnimation(creatureId);
    return {
        creature: art.source ?? visual?.source,
        background: visual?.background,
        glow: resolveCreaturePortraitBackgroundMotion(creatureId)?.glowSrc,
        atlas: animation?.src,
    };
};

/**
 * True once the cutout and its faction background are both decoded. The glow is warmed too, but it is
 * only a tint over the plate, so it must not hold the swap.
 */
export const isLeftSidebarPortraitReady = (creatureId: number): boolean => {
    const sources = leftSidebarPortraitSources(creatureId);
    return !!sources.creature && isDecodedImageReady(sources.creature) && isDecodedImageReady(sources.background);
};

const ensureSharedLayers = (): void => {
    if (sharedLayersStarted) return;
    sharedLayersStarted = true;
    for (const src of factionPortraitBackgroundSources()) void warmDecodedImage(src, { lock: true });
    for (const src of factionPortraitGlowSources()) void warmDecodedImage(src, { lock: true });
};

/** Decode the required pair now; optional layers must not delay or release the selection handoff. */
export const warmLeftSidebarPortrait = (creatureId: number): Promise<boolean> => {
    ensureSharedLayers();
    const sources = leftSidebarPortraitSources(creatureId);
    if (sources.atlas) void warmAtlas(sources.atlas);
    if (sources.glow) void warmDecodedImage(sources.glow, { lock: true });
    return Promise.all([
        warmDecodedImage(sources.creature),
        sources.background ? warmDecodedImage(sources.background, { lock: true }) : Promise.resolve(true),
    ]).then(
        ([creatureReady, backgroundReady]) =>
            creatureReady && backgroundReady && isLeftSidebarPortraitReady(creatureId),
    );
};

/**
 * Warm a band of creatures the player can select next (the open roster level, or the turn queue).
 * Cutouts go first; the rare idle sheet follows so it cannot delay the stills.
 */
export const enqueueLeftSidebarPortraits = (creatureIds: readonly number[]): void => {
    ensureSharedLayers();
    const atlases: string[] = [];
    for (const creatureId of creatureIds) {
        const sources = leftSidebarPortraitSources(creatureId);
        enqueueDecodedImage(sources.creature);
        if (sources.atlas) atlases.push(sources.atlas);
    }
    for (const atlas of atlases) enqueueDecodedImage(atlas);
};

/** The portrait on screen is not eligible for eviction. */
export const pinLeftSidebarPortrait = (creatureId: number): void => {
    const sources = leftSidebarPortraitSources(creatureId);
    pinDecodedImages([sources.creature, sources.background, sources.glow, sources.atlas]);
};

/**
 * Which creature the portrait box paints. A new id stays on the previous picture until its cutout and
 * background have both decoded, so the two files cannot change on different frames. The same id keeps
 * painting even if its bitmap was since evicted: the img already holds it.
 */
export const displayedSidebarCreatureId = (
    requested: number | undefined,
    held: number | undefined,
    ready: boolean,
): number | undefined => {
    if (requested === undefined) return undefined;
    if (ready || held === requested) return requested;
    return held;
};

export const resetLeftSidebarPortraitWarmForTests = (): void => {
    sharedLayersStarted = false;
};
