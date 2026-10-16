import { resolveCreaturePortraitBackgroundMotion } from "./creaturePortraitBackgroundMotion";
import { resolveCreaturePortraitVisual } from "./creaturePortraitVisual";
import {
    clearDecodedImagePrefetch,
    clearDecodedImageForeground,
    isDecodedImageReady,
    pinDecodedImages,
    replaceDecodedImagePrefetch,
    retainDecodedImages,
    setDecodedImageForeground,
    warmDecodedImage,
    type PortraitImagePrefetch,
} from "./decodedImageCache";
import { resolveLeftSidebarPortraitAnimation } from "./leftSidebarPortraitAnimation";
import { resolveLeftSidebarPortraitArt } from "./leftSidebarPortraitArt";

export interface LeftSidebarPortraitSources {
    creature?: string;
    background?: string;
    glow?: string;
    atlas?: string;
}

const defaultPortraitPrefetchOwner = {};
const selectedOptionalPrefetchOwner = {};
const selectedForegroundOwner = {};
let selectedRetention: { creatureId: number; release: () => void; readiness?: Promise<boolean> } | undefined;

/** Each full-size cutout is over a megabyte; only speculate on the next likely inspections. */
export const SIDEBAR_PORTRAIT_PREFETCH_LIMIT = 2;

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

/** Decode the required pair now; optional layers must not delay or release the selection handoff. */
export const warmLeftSidebarPortrait = (creatureId: number): Promise<boolean> => {
    clearDecodedImagePrefetch(selectedOptionalPrefetchOwner);
    const sources = leftSidebarPortraitSources(creatureId);
    // Acquire first: duplicate overlay/React warming must not leave a trim gap for the same pair.
    const release = retainDecodedImages([sources.creature, sources.background]);
    selectedRetention?.release();
    const selection = { creatureId, release, readiness: undefined as Promise<boolean> | undefined };
    selectedRetention = selection;
    setDecodedImageForeground(selectedForegroundOwner, [sources.creature, sources.background]);
    const readiness = Promise.all([
        warmDecodedImage(sources.creature, { priority: "high", foregroundOwner: selectedForegroundOwner }),
        sources.background
            ? warmDecodedImage(sources.background, {
                  lock: true,
                  priority: "high",
                  foregroundOwner: selectedForegroundOwner,
              })
            : Promise.resolve(true),
    ]).then(([creatureReady, backgroundReady]) => {
        const ready = creatureReady && backgroundReady && isLeftSidebarPortraitReady(creatureId);
        if (selectedRetention === selection) {
            clearDecodedImageForeground(selectedForegroundOwner);
            if (ready) {
                replaceDecodedImagePrefetch(selectedOptionalPrefetchOwner, [
                    { src: sources.glow, lock: true },
                    { src: sources.atlas },
                ]);
            } else {
                selectedRetention?.release();
                selectedRetention = undefined;
            }
        }
        return ready;
    });
    selection.readiness = readiness;
    return readiness;
};

/**
 * Warm only the next likely inspections from the open roster or the active-first turn queue.
 * The larger optional atlas is requested after an actual selection, once its still pair is ready.
 */
export const enqueueLeftSidebarPortraits = (
    creatureIds: readonly number[],
    owner: object = defaultPortraitPrefetchOwner,
): void => {
    const critical: PortraitImagePrefetch[] = [];
    for (const creatureId of [...new Set(creatureIds)].slice(0, SIDEBAR_PORTRAIT_PREFETCH_LIMIT)) {
        const sources = leftSidebarPortraitSources(creatureId);
        critical.push({ src: sources.creature }, { src: sources.background, lock: true });
    }
    replaceDecodedImagePrefetch(owner, critical);
};

export const clearLeftSidebarPortraitPrefetch = (owner: object): void => clearDecodedImagePrefetch(owner);

/** A stale React cleanup may not release the newer creature prewarmed by the roster. */
export const clearLeftSidebarPortraitSelection = (creatureId: number, readiness: Promise<boolean>): void => {
    if (selectedRetention?.creatureId !== creatureId || selectedRetention.readiness !== readiness) return;
    selectedRetention.release();
    selectedRetention = undefined;
    clearDecodedImagePrefetch(selectedOptionalPrefetchOwner);
    clearDecodedImageForeground(selectedForegroundOwner);
};

/** The portrait on screen is not eligible for eviction. */
export const pinLeftSidebarPortrait = (creatureId: number): void => {
    const sources = leftSidebarPortraitSources(creatureId);
    pinDecodedImages([sources.creature, sources.background, sources.glow, sources.atlas]);
    // The displayed pins are installed before handing back the selected pair's temporary hold.
    if (selectedRetention?.creatureId === creatureId) selectedRetention.release();
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
    selectedRetention?.release();
    selectedRetention = undefined;
    clearDecodedImageForeground(selectedForegroundOwner);
};
