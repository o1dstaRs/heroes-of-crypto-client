/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { useSyncExternalStore } from "react";

import { images } from "../generated/image_imports";
import { BATTLEFIELD_TEXTURE_KEYS } from "../pixi/battlefieldTextureKeys";
import { isCoreTextureAssetKey, isLazyAbilityAssetKey, isLazySpellAssetKey } from "../pixi/imageAssetTiers";
import { UNIT_ID_TO_IMAGE } from "./unit_ui_constants";

/**
 * Warm the browser cache with a match's art while the player is still in the ranked arena (and, as a
 * fallback, while they are drafting).
 *
 * Sitting on /play is minutes of idle network time before a match exists. Without this a cold cache fetches the
 * art at the one moment the player is waiting to act, and on a slow connection the units in the match can still
 * be missing from the board minutes into placement: a creature's board image is only requested once the board
 * has started, after the whole blocking core tier.
 *
 * The art goes in the order a match needs it: the blocking core tier, then every creature's board image, then
 * the draft's creature portraits, then the ability and spell icons the draft and the fight show (about 16 MB in
 * all). Fetching the same URLs puts them in the HTTP cache, so the later loads resolve from it. Deliberately a
 * plain fetch rather than Pixi's Assets: this runs on screens that have no renderer and must not pull the Pixi
 * runtime (or its GPU upload path) into the arena/pick bundle.
 *
 * Everything here is best-effort. A failed prefetch costs nothing — the real load re-requests it. Progress is
 * published (useAssetPrefetchProgress) so the arena can show how much of a match's art is ready.
 */

/** How many requests to keep in flight. Low enough to leave room for the pick phase's own API traffic. */
export const ASSET_PREFETCH_CONCURRENCY = 6;

const urlsWhere = (include: (key: string) => boolean): string[] =>
    Object.entries(images as Record<string, string>)
        .filter(([key, url]) => include(key) && typeof url === "string" && url.length > 0)
        .map(([, url]) => url);

export const coreAssetUrls = (): string[] => urlsWhere(isCoreTextureAssetKey);

/**
 * Every URL the prefetch fetches, once each, in the order it fetches them: the blocking core tier, every
 * creature's board image, the draft's creature portraits, then ability and spell icons.
 */
export const prefetchAssetUrls = (): string[] => [
    ...new Set([
        ...coreAssetUrls(),
        ...urlsWhere((key) => BATTLEFIELD_TEXTURE_KEYS.has(key)),
        ...Object.values(UNIT_ID_TO_IMAGE).filter((url) => typeof url === "string" && url.length > 0),
        ...urlsWhere((key) => isLazyAbilityAssetKey(key) || isLazySpellAssetKey(key)),
    ]),
];

export interface AssetPrefetchProgress {
    /** URLs this session prefetches; 0 until the prefetch starts. */
    total: number;
    /** URLs finished, whether downloaded or failed. */
    settled: number;
    /** Of those, the ones that failed (offline, or art this build does not ship). */
    failed: number;
}

const IDLE_PROGRESS: AssetPrefetchProgress = { total: 0, settled: 0, failed: 0 };

let progress = IDLE_PROGRESS;
const listeners = new Set<() => void>();
let urls: string[] = [];
let next = 0;
let running = 0;
let paused = false;
// Bumped by the test reset, so a request still in flight from an earlier run never counts toward a new one.
let generation = 0;

const publish = (update: Partial<AssetPrefetchProgress>): void => {
    progress = { ...progress, ...update };
    for (const listener of listeners) {
        listener();
    }
};

export const getAssetPrefetchProgress = (): AssetPrefetchProgress => progress;

export const subscribeAssetPrefetchProgress = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/** The live prefetch progress, for the arena's readout. */
export const useAssetPrefetchProgress = (): AssetPrefetchProgress =>
    useSyncExternalStore(subscribeAssetPrefetchProgress, getAssetPrefetchProgress, getAssetPrefetchProgress);

/** True once every URL has settled. */
export const isAssetPrefetchComplete = (state: AssetPrefetchProgress): boolean =>
    state.total > 0 && state.settled >= state.total;

const pump = async (): Promise<void> => {
    const run = generation;
    running += 1;
    try {
        while (!paused && run === generation && next < urls.length) {
            const url = urls[next++];
            let ok = false;
            try {
                // `priority: "low"` keeps this behind the page's own requests where supported; the response body is
                // drained so the entry is actually stored rather than left pending.
                const response = await fetch(url, { credentials: "same-origin", priority: "low" } as RequestInit);
                await response.arrayBuffer();
                ok = response.ok !== false;
            } catch {
                // Offline, or a 404 on art this build does not ship: the real load handles it.
            }
            if (run === generation) {
                publish({ settled: progress.settled + 1, failed: progress.failed + (ok ? 0 : 1) });
            }
        }
    } finally {
        if (run === generation) {
            running -= 1;
        }
    }
};

/**
 * Start (once per session) or resume fetching a match's art in the background.
 *
 * @returns a function that pauses the queue: requests already in flight finish and land in the cache, and no new
 *          ones start until the next start() resumes it. The draft route pauses it as the board takes over, so it
 *          never competes with the board's own loading; the arena resumes it. The arena itself never pauses it:
 *          hopping to the portal and back must not stall the queue.
 */
export const startBackgroundAssetPrefetch = (): (() => void) => {
    if (typeof fetch !== "function") {
        return () => undefined;
    }
    if (progress.total === 0) {
        urls = prefetchAssetUrls();
        publish({ total: urls.length });
    }
    paused = false;
    for (let pumps = running; pumps < ASSET_PREFETCH_CONCURRENCY && next < urls.length; pumps++) {
        void pump();
    }
    return () => {
        paused = true;
    };
};

/** Test seam: forget any earlier run. */
export const resetBackgroundAssetPrefetchForTests = (): void => {
    generation += 1;
    urls = [];
    next = 0;
    running = 0;
    paused = false;
    publish(IDLE_PROGRESS);
};
