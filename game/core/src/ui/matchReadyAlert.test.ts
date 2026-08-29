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

import { describe, expect, test } from "bun:test";

import { isFreshMatchReady, matchReadyTitle, MATCH_READY_NOTIFICATION_TAG } from "./matchReadyAlert";

/**
 * The matchmaking stream repeats the pending match on EVERY tick, so "is this new?" is the whole
 * correctness question: get it wrong and a player waiting out a 30-second accept window collects thirty
 * desktop toasts. The id is the dedupe key, not the arrival of an event.
 */
describe("deciding when a match is worth announcing", () => {
    test("a match we have not announced yet is fresh", () => {
        expect(isFreshMatchReady("game-1", "", 30)).toBe(true);
    });

    test("the same match on every later tick is not", () => {
        expect(isFreshMatchReady("game-1", "game-1", 29)).toBe(false);
        expect(isFreshMatchReady("game-1", "game-1", 1)).toBe(false);
    });

    test("a different match after the first re-arms the alert", () => {
        // Declining or missing one match and being re-queued into another must announce again.
        expect(isFreshMatchReady("game-2", "game-1", 30)).toBe(true);
    });

    test("no pending match is never announced", () => {
        expect(isFreshMatchReady("", "", 30)).toBe(false);
        expect(isFreshMatchReady("", "game-1", 30)).toBe(false);
    });

    test("an already-expired window is not announced", () => {
        // The server marks a closed window with a negative countdown; shouting about it would only
        // point the player at a match they can no longer accept.
        expect(isFreshMatchReady("game-1", "", -1)).toBe(false);
    });

    test("a missing countdown still announces — the match matters more than the timer", () => {
        expect(isFreshMatchReady("game-1", "", null)).toBe(true);
    });
});

describe("the flashing tab title", () => {
    test("counts down when the stream gives a countdown", () => {
        expect(matchReadyTitle(12)).toContain("12s");
        expect(matchReadyTitle(12)).toContain("accept");
    });

    test("rounds a fractional second up rather than showing 0s while time remains", () => {
        expect(matchReadyTitle(0.4)).toContain("1s");
    });

    test("drops the countdown when there is none", () => {
        expect(matchReadyTitle(null)).not.toContain("s)");
        expect(matchReadyTitle(null)).toContain("accept");
    });
});

/**
 * Wiring, pinned against the source: this feature is only worth anything if it is armed and disarmed at
 * the right moments, and none of that is reachable from a bun test (no DOM, no Notification).
 */
describe("matchmaking route wiring", () => {
    const routeSource = (): string => readFileSync(join(import.meta.dir, "MatchmakingRoute.tsx"), "utf8");

    test("permission is asked when the player enters the queue, not on page load", () => {
        const source = routeSource();
        const handleStart = source.slice(source.indexOf("const handleStart = async ()"));
        expect(handleStart.slice(0, 900)).toContain("requestMatchReadyPermission()");
    });

    test("every exit from a pending match clears the alert", () => {
        const source = routeSource();
        // Accepted (c === 1), window closed (r < 0), back to searching (no pending id), and unmount.
        expect(source.split("clearMatchReadyAlert()").length - 1).toBeGreaterThanOrEqual(4);
        const unmount = source.slice(source.indexOf("mountedRef.current = false;"));
        expect(unmount.slice(0, 500)).toContain("clearMatchReadyAlert()");
    });

    test("the announce is deduped by match id", () => {
        const source = routeSource();
        expect(source).toContain("isFreshMatchReady(event.ps, alertedGameIdRef.current");
        expect(source).toContain("alertedGameIdRef.current = event.ps");
    });
});

describe("notification identity", () => {
    test("one stable tag, so a re-fire replaces rather than stacks", () => {
        expect(MATCH_READY_NOTIFICATION_TAG).toBe("hoc-match-ready");
    });
});
