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
import { isCoreTextureAssetKey } from "../pixi/imageAssetTiers";

/**
 * Warm the browser cache with the board's art while the player is still in the ranked arena (and, as a
 * fallback, while they are drafting).
 *
 * Sitting on /play is minutes of idle network time before a match exists. The pick phase is more of the
 * same. The board then boots Pixi, which BLOCKS on preloadCoreAssets behind a loading screen — so without
 * this, the whole core tier is fetched at the one moment the player is waiting to act.
 *
 * This does not replace that load: it front-runs it. Fetching the same URLs here puts them in the HTTP
 * cache, so the later Assets.loadBundle resolves from cache and the blocking step passes through in a
 * blink. Deliberately a plain fetch rather than Pixi's Assets: this runs on screens that have no
 * renderer and must not pull the Pixi runtime (or its GPU upload path) into the arena/pick bundle.
 *
 * Everything here is best-effort. A failed prefetch costs nothing — the real load re-requests it.
 */

/** How many requests to keep in flight. Low enough to leave room for the pick phase's own API traffic. */
export const ASSET_PREFETCH_CONCURRENCY = 6;

let prefetchStarted = false;

export const coreAssetUrls = (): string[] =>
    Object.entries(images as Record<string, string>)
        .filter(([key, url]) => isCoreTextureAssetKey(key) && typeof url === "string" && url.length > 0)
        .map(([, url]) => url);

/**
 * Begin (once per session) fetching the core art in the background.
 *
 * @returns a function that stops any still-pending requests. The draft route uses this so leaving a
 *          direct-linked match aborts leftover work. The arena does not: hopping to the portal and
 *          back must not drop the rest of the queue, and a later start() on pick is a no-op.
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
