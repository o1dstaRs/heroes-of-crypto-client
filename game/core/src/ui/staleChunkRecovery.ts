/*
 * -----------------------------------------------------------------------------
 * This file is part of the code of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

/**
 * Recover a page that outlived its release.
 *
 * Every deploy rewrites the content-hashed chunk names. A tab left open across a deploy — or a page
 * loaded from a stale cached index.html — holds references to chunks that no longer exist, and its
 * next lazy route/dynamic import dies with "Failed to fetch dynamically imported module". That used
 * to be a permanent white screen: the app had already booted, so nothing was left to render an error.
 *
 * The fix is one unconditional hard reload — the fresh index.html is served no-store, so it names the
 * new chunks and the page comes back. Once per page lifetime only: a reload that fails again means a
 * real outage, and reload-looping would only hide it.
 */
export function installStaleChunkRecovery(): void {
    window.addEventListener("vite:preloadError", (event) => {
        if (sessionStorage.getItem("hoc-stale-chunk-reloaded") === "1") return;
        event.preventDefault();
        sessionStorage.setItem("hoc-stale-chunk-reloaded", "1");
        window.location.reload();
    });
    // The reload landed and the new bundle booted: retire the guard so a LATER deploy in this same tab
    // can recover too. Delayed so an immediate re-failure (a genuinely broken release) still refuses
    // to loop rather than bouncing the tab forever.
    if (sessionStorage.getItem("hoc-stale-chunk-reloaded") === "1") {
        window.setTimeout(() => sessionStorage.removeItem("hoc-stale-chunk-reloaded"), 10_000);
    }
}
