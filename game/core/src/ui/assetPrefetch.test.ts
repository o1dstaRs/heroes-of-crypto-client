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

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import {
    ASSET_PREFETCH_CONCURRENCY,
    coreAssetUrls,
    resetBackgroundAssetPrefetchForTests,
    startBackgroundAssetPrefetch,
} from "./assetPrefetch";

afterEach(() => resetBackgroundAssetPrefetchForTests());

/**
 * Drafting is dead network time; the board's art should arrive during it rather than behind a loading
 * screen between the draft and the augment step.
 */
describe("what gets prefetched", () => {
    test("the core tier only — animation atlases are left to their own later tiers", () => {
        const urls = coreAssetUrls();
        expect(urls.length).toBeGreaterThan(100);
        // PixiTextureLoader splits on "_atlas"; prefetching the ~700MB animation tier during a draft
        // would compete with the pick phase's own requests for no gain.
        expect(urls.some((url) => url.includes("_atlas"))).toBe(false);
    });

    test("every entry is a real URL, never a bare key", () => {
        for (const url of coreAssetUrls().slice(0, 200)) {
            expect(url).toMatch(/^(?:file|https?|data|blob):/);
        }
    });
});

describe("running it", () => {
    test("fetches with bounded concurrency and returns an aborter", async () => {
        const seen: string[] = [];
        let inFlight = 0;
        let peak = 0;
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            seen.push(String(input));
            await new Promise((resolve) => setTimeout(resolve, 0));
            inFlight--;
            return { arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
        }) as typeof fetch;

        try {
            const stop = startBackgroundAssetPrefetch();
            expect(typeof stop).toBe("function");
            await new Promise((resolve) => setTimeout(resolve, 40));
            stop();
            expect(seen.length).toBeGreaterThan(0);
            // The whole point of the cap: leave room for the pick phase's own API traffic.
            expect(peak).toBeLessThanOrEqual(ASSET_PREFETCH_CONCURRENCY);
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    test("only ever runs once per session", async () => {
        let calls = 0;
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async () => {
            calls++;
            return { arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
        }) as unknown as typeof fetch;

        try {
            const stop = startBackgroundAssetPrefetch();
            await new Promise((resolve) => setTimeout(resolve, 20));
            const after = calls;
            // A re-render, or a second draft in the same tab, must not re-download everything.
            const stopAgain = startBackgroundAssetPrefetch();
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(calls).toBe(after);
            stop();
            stopAgain();
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    test("a failing request never escapes", async () => {
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async () => {
            throw new Error("offline");
        }) as unknown as typeof fetch;
        try {
            const stop = startBackgroundAssetPrefetch();
            await new Promise((resolve) => setTimeout(resolve, 20));
            stop();
        } finally {
            globalThis.fetch = realFetch;
        }
        // Reaching here without an unhandled rejection is the assertion.
        expect(true).toBe(true);
    });
});

describe("where it is started", () => {
    test("the draft route arms it, and disarms it on leaving", () => {
        const source = readFileSync(join(import.meta.dir, "index.tsx"), "utf8");
        const route = source.slice(source.indexOf("const GameRoute:"), source.indexOf("const GameRoute:") + 4000);
        expect(route).toContain("startBackgroundAssetPrefetch()");
        // Gated on the pick screen: this must not fire on the play route, where Pixi is already loading.
        expect(route).toContain('routeMode !== "pick"');
        // Returned from the effect so React tears it down.
        expect(route).toContain("return startBackgroundAssetPrefetch()");
    });
});
