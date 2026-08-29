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

import { images } from "../generated/image_imports";

/**
 * Warm the browser cache with the board's art while the player is busy drafting.
 *
 * The pick phase is pure React and takes tens of seconds of deliberate thinking; nothing is downloading
 * during it. The board then boots Pixi, which BLOCKS on preloadCoreAssets behind a loading screen — so
 * the whole core tier is fetched at the one moment the player is waiting to act, and a load screen sits
 * between the draft and choosing augments.
 *
 * This does not replace that load: it front-runs it. Fetching the same URLs here puts them in the HTTP
 * cache, so the later Assets.loadBundle resolves from cache and the blocking step passes through in a
 * blink. Deliberately a plain fetch rather than Pixi's Assets: this runs on a screen that has no
 * renderer and must not pull the Pixi runtime (or its GPU upload path) into the pick bundle.
 *
 * Everything here is best-effort. A failed prefetch costs nothing — the real load re-requests it.
 */

/** Mirrors PixiTextureLoader's tiering: the core tier is everything that is not an animation atlas. */
const isCoreAsset = (key: string): boolean => !key.includes("_atlas");

/** How many requests to keep in flight. Low enough to leave room for the pick phase's own API traffic. */
export const ASSET_PREFETCH_CONCURRENCY = 6;

let prefetchStarted = false;

export const coreAssetUrls = (): string[] =>
    Object.entries(images as Record<string, string>)
        .filter(([key, url]) => isCoreAsset(key) && typeof url === "string" && url.length > 0)
        .map(([, url]) => url);

/**
 * Begin (once per session) fetching the core art in the background.
 *
 * @returns a function that stops any still-pending requests — call it when the screen unmounts so a
 *          player who leaves the draft is not still pulling megabytes.
 */
export const startBackgroundAssetPrefetch = (): (() => void) => {
    if (prefetchStarted || typeof fetch !== "function") {
        return () => undefined;
    }
    prefetchStarted = true;

    const controller = typeof AbortController === "function" ? new AbortController() : undefined;
    const urls = coreAssetUrls();
    let next = 0;

    const pump = async (): Promise<void> => {
        while (next < urls.length) {
            const url = urls[next++];
            if (!url) continue;
            try {
                // `priority: "low"` keeps this behind the pick phase's own requests where supported; the
                // response body is drained so the entry is actually stored rather than left pending.
                const response = await fetch(url, {
                    signal: controller?.signal,
                    credentials: "same-origin",
                    priority: "low",
                } as RequestInit);
                await response.arrayBuffer().catch(() => undefined);
            } catch {
                // Aborted, offline, or a 404 on art this build does not ship: the real load handles it.
            }
        }
    };

    void Promise.all(Array.from({ length: ASSET_PREFETCH_CONCURRENCY }, () => pump()));

    return () => controller?.abort();
};

/** Test seam: forget that a prefetch already ran. */
export const resetBackgroundAssetPrefetchForTests = (): void => {
    prefetchStarted = false;
};
