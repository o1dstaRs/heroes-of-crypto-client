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

/**
 * OWNER CALL: a logged-in player keeps the full four-button dock in the bottom-right corner of the
 * SANDBOX — bets, friends, notifications and sound — the same four that sit there on every non-battle
 * screen.
 *
 * SocialDock renders one of two shapes: `systemMenuMode ? systemDockControls : dockControls`. The first
 * is the compact top-right medallion, which folds those four behind a fan. The offline sandbox used to
 * publish setBattleSystemControlsActive(true) on mount, so it always got the folded shape. Ranked keeps
 * that collapse (RankedGameView), where board space is genuinely contested; the sandbox has room.
 *
 * Source-contract, like the sibling pointer/placement specs: this repo has no DOM harness, and the
 * regression is a re-added effect rather than anything observable from a unit test.
 */
const read = (relative: string): string => readFileSync(join(import.meta.dir, relative), "utf8");

const withoutComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the sandbox keeps the bottom-right dock", () => {
    test("it does not switch SocialDock into the collapsed medallion", () => {
        const code = withoutComments(read("index.tsx"));
        // Naming it in prose is fine; calling it is what folds the four buttons away.
        expect(code).not.toContain("setBattleSystemControlsActive(");
    });

    test("ranked still collapses it — this is a sandbox-only rule, not a global one", () => {
        const ranked = withoutComments(read("RankedGameViewRuntime.tsx"));
        expect(ranked).toContain("setBattleSystemControlsActive(true)");
        expect(ranked).toContain("setBattleSystemControlsActive(false)");
    });

    test("the dock still carries all four controls, gated only on being logged in", () => {
        const dock = read("social/SocialDock.tsx");
        for (const control of [
            'aria-label="Bets and predictions"',
            'aria-label="Friends"',
            'aria-label="Notifications"',
        ]) {
            expect(dock).toContain(control);
        }
        // Sound is a slot the volume control mounts into rather than an IconButton of its own.
        expect(dock).toContain('data-volume-control="social-dock"');
        // The only thing that may hide the dock is an inactive/logged-out account.
        expect(withoutComments(dock)).toContain("const active = authenticated && user?.is_active !== false");
    });

    test("the dock reserves the speaker footprint while the game footer owns the live control", () => {
        const dock = read("social/SocialDock.tsx");
        const slotStart = dock.indexOf('data-volume-control="social-dock"');
        const slotEnd = dock.indexOf("/>", slotStart);
        const slot = dock.slice(slotStart, slotEnd);

        expect(slotStart).toBeGreaterThan(-1);
        expect(slot).toContain("width: 32");
        expect(slot).toContain("height: 32");
        expect(slot).toContain('flex: "0 0 32px"');
    });
});
