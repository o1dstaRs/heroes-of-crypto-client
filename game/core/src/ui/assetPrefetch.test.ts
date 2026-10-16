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

import { CreatureVals } from "@heroesofcrypto/common";
import { afterEach, describe, expect, test } from "bun:test";

import { images } from "../generated/image_imports";
import { BATTLEFIELD_TEXTURE_KEYS } from "../pixi/battlefieldTextureKeys";
import { isCoreTextureAssetKey, isLazyAbilityAssetKey } from "../pixi/imageAssetTiers";
import {
    ASSET_PREFETCH_CONCURRENCY,
    coreAssetUrls,
    getAssetPrefetchProgress,
    isAssetPrefetchComplete,
    prefetchAssetUrls,
    resetBackgroundAssetPrefetchForTests,
    startBackgroundAssetPrefetch,
    subscribeAssetPrefetchProgress,
} from "./assetPrefetch";
import { UNIT_ID_TO_IMAGE } from "./unit_ui_constants";

afterEach(() => resetBackgroundAssetPrefetchForTests());

const byKey = images as Record<string, string>;

const withFetch = async (fake: typeof fetch, run: () => Promise<void>): Promise<void> => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = fake;
    try {
        await run();
    } finally {
        globalThis.fetch = realFetch;
    }
};

const until = async (condition: () => boolean, timeoutMs = 5000): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error("timed out");
        }
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
};

/**
 * Ranked-arena idle time (and the draft, as a fallback) should pull a match's art down before Pixi boots, so the
 * blocking core load resolves from cache and the units show on the board as soon as the match starts.
 */
describe("what gets prefetched", () => {
    test("the core tier uses the same lean classification as the Pixi runtime", () => {
        const urls = coreAssetUrls();
        const expected = Object.entries(byKey)
            .filter(([key, url]) => isCoreTextureAssetKey(key) && typeof url === "string" && url.length > 0)
            .map(([, url]) => url);

        expect(urls).toEqual(expected);
        expect(urls.some((url) => url.includes("wolf_walk_atlas"))).toBe(false);
        expect(urls.some((url) => url.includes("wolf_pick_sandbox_x2"))).toBe(false);
        expect(urls.some((url) => url.includes("wolf_battlefield_side_right_final_v1"))).toBe(false);
        expect(urls.some((url) => url.includes("ambient_fire_video_torch_left_natural"))).toBe(false);
        expect(urls.some((url) => url.includes("placement_carpet_green_uniform"))).toBe(false);
        expect(urls.some((url) => url.includes("artifact_t1_"))).toBe(false);
        expect(urls.some((url) => url.includes("combat_toolbar_"))).toBe(false);
        expect(urls.some((url) => url.includes("pick_ban_slash_variant2_atlas"))).toBe(false);
        expect(urls.some((url) => url.includes("vfx_dust_smoky_ash_atlas"))).toBe(false);
        expect(urls.some((url) => url.includes("book_1024_clean_pages_v1"))).toBe(false);
        expect(urls.some((url) => url.includes("craft_anvil"))).toBe(false);
        expect(urls.some((url) => url.includes("craft_hammer"))).toBe(false);
        expect(urls.some((url) => url.includes("range_target_arrow_v7_gold_wide_crisp"))).toBe(false);
        expect(urls.some((url) => url.includes("shot_range_corner_aaa_v4_green"))).toBe(false);
        expect(urls.some((url) => url.includes("efreet_board_128"))).toBe(false);
        expect(urls.some((url) => url.includes("units_overlay_toggle_square_v1"))).toBe(false);
    });

    test("a match's art goes in the order it is needed: core, every board image, draft portraits, icons", () => {
        const urls = prefetchAssetUrls();
        const at = (url: string | undefined): number => (url ? urls.indexOf(url) : -1);
        const boardUrls = [...BATTLEFIELD_TEXTURE_KEYS].map((key) => byKey[key]);

        expect(new Set(urls).size).toBe(urls.length);
        expect(boardUrls.every((url) => at(url) >= 0)).toBe(true);
        expect(Math.max(...coreAssetUrls().map(at))).toBeLessThan(Math.min(...boardUrls.map(at)));

        const peasantPortrait = at(UNIT_ID_TO_IMAGE[CreatureVals.PEASANT]);
        expect(peasantPortrait).toBeGreaterThan(Math.max(...boardUrls.map(at)));
        const abilityIcon = Object.keys(byKey).find(isLazyAbilityAssetKey);
        expect(at(abilityIcon ? byKey[abilityIcon] : undefined)).toBeGreaterThan(peasantPortrait);

        // Heavy optional art stays out: animation sheets, placement carpets, map ambience.
        expect(urls.some((url) => /_walk_atlas|placement_carpet_|ambient_fire_video_torch_/.test(url))).toBe(false);
    });

    test("every entry is a real URL, never a bare key", () => {
        for (const url of prefetchAssetUrls().slice(0, 300)) {
            expect(url).toMatch(/^(?:file|https?|data|blob):/);
        }
    });
});

describe("running it", () => {
    test("fetches with bounded concurrency and returns a pause", async () => {
        const seen: string[] = [];
        let inFlight = 0;
        let peak = 0;
        await withFetch(
            (async (input: RequestInfo | URL) => {
                inFlight++;
                peak = Math.max(peak, inFlight);
                seen.push(String(input));
                await new Promise((resolve) => setTimeout(resolve, 0));
                inFlight--;
                return { arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
            }) as typeof fetch,
            async () => {
                const pause = startBackgroundAssetPrefetch();
                expect(typeof pause).toBe("function");
                await new Promise((resolve) => setTimeout(resolve, 40));
                pause();
                expect(seen.length).toBeGreaterThan(0);
                // The whole point of the cap: leave room for the pick phase's own API traffic.
                expect(peak).toBeLessThanOrEqual(ASSET_PREFETCH_CONCURRENCY);
            },
        );
    });

    test("only ever runs once per session", async () => {
        let calls = 0;
        await withFetch(
            (async () => {
                calls++;
                return { arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
            }) as unknown as typeof fetch,
            async () => {
                startBackgroundAssetPrefetch();
                await until(() => isAssetPrefetchComplete(getAssetPrefetchProgress()));
                const after = calls;
                // A re-render, or a second draft in the same tab, must not re-download everything.
                startBackgroundAssetPrefetch();
                await new Promise((resolve) => setTimeout(resolve, 20));
                expect(calls).toBe(after);
                expect(after).toBe(prefetchAssetUrls().length);
            },
        );
    });

    test("progress runs to complete, counting failures, and notifies subscribers", async () => {
        let calls = 0;
        let notified = 0;
        const unsubscribe = subscribeAssetPrefetchProgress(() => notified++);
        await withFetch(
            (async () => {
                calls++;
                if (calls % 3 === 0) {
                    throw new Error("offline");
                }
                return { ok: calls % 5 !== 0, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
            }) as unknown as typeof fetch,
            async () => {
                expect(getAssetPrefetchProgress().total).toBe(0);
                startBackgroundAssetPrefetch();
                expect(getAssetPrefetchProgress().total).toBe(prefetchAssetUrls().length);
                expect(isAssetPrefetchComplete(getAssetPrefetchProgress())).toBe(false);
                await until(() => isAssetPrefetchComplete(getAssetPrefetchProgress()));
                const done = getAssetPrefetchProgress();
                expect(done.settled).toBe(done.total);
                expect(done.failed).toBeGreaterThan(0);
                expect(done.failed).toBeLessThan(done.total);
                expect(notified).toBeGreaterThan(done.total);
            },
        );
        unsubscribe();
    });

    test("pausing lets requests in flight finish and starts no new ones; starting again resumes", async () => {
        const releases: Array<() => void> = [];
        await withFetch(
            (async () => {
                await new Promise<void>((resolve) => releases.push(resolve));
                return { arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
            }) as unknown as typeof fetch,
            async () => {
                const pause = startBackgroundAssetPrefetch();
                await until(() => releases.length === ASSET_PREFETCH_CONCURRENCY);
                pause();
                releases.splice(0).forEach((release) => release());
                await until(() => getAssetPrefetchProgress().settled === ASSET_PREFETCH_CONCURRENCY);
                await new Promise((resolve) => setTimeout(resolve, 20));
                // Paused: the six finished and landed, nothing new was requested.
                expect(releases.length).toBe(0);

                startBackgroundAssetPrefetch();
                await until(() => releases.length === ASSET_PREFETCH_CONCURRENCY);
                releases.splice(0).forEach((release) => release());
            },
        );
    });

    test("a failing request never escapes", async () => {
        await withFetch(
            (async () => {
                throw new Error("offline");
            }) as unknown as typeof fetch,
            async () => {
                const pause = startBackgroundAssetPrefetch();
                await new Promise((resolve) => setTimeout(resolve, 20));
                pause();
            },
        );
        // Reaching here without an unhandled rejection is the assertion.
        expect(true).toBe(true);
    });
});

describe("where it is started", () => {
    test("the ranked arena arms it, keeps it running after leave, and shows its progress", () => {
        const source = readFileSync(join(import.meta.dir, "MatchmakingRoute.tsx"), "utf8");
        expect(source).toContain("startBackgroundAssetPrefetch()");
        // Arena mount is fire-and-forget: hopping to the portal must not pause the queue.
        expect(source).not.toContain("return startBackgroundAssetPrefetch()");
        expect(source).toContain("<ArenaArtReadout />");
    });

    test("the draft route arms it as a fallback, and pauses it on leaving", () => {
        const source = readFileSync(join(import.meta.dir, "index.tsx"), "utf8");
        const route = source.slice(source.indexOf("const GameRoute:"), source.indexOf("const GameRoute:") + 4000);
        expect(route).toContain("startBackgroundAssetPrefetch()");
        // Gated on the pick screen: this must not fire on the play route, where Pixi is already loading.
        expect(route).toContain('routeMode !== "pick"');
        // Returned from the effect so React pauses it when the draft hands over to the board.
        expect(route).toContain("return startBackgroundAssetPrefetch()");
    });
});
