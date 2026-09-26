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
 * OWNER CALL (2026-09-20, supersedes the earlier sandbox-only rule): every IN-GAME screen — sandbox,
 * ranked battle and the draft — wears the same corner HUD, and that includes folding the four dock
 * buttons into the compact medallion. Menus keep the full bottom-right dock.
 *
 * SocialDock renders one of two shapes: `systemMenuMode ? systemDockControls : dockControls`. The first
 * is the compact corner medallion, which folds bets/friends/notifications/sound behind a fan. Publishing
 * setBattleSystemControlsActive(true) on mount is what selects it, so each in-game host must do so and
 * must release it on unmount — otherwise a menu reached from a fight keeps the folded shape.
 *
 * Source-contract, like the sibling pointer/placement specs: this repo has no DOM harness, and the
 * regression is a dropped (or unreleased) effect rather than anything observable from a unit test.
 */
const read = (relative: string): string => readFileSync(join(import.meta.dir, relative), "utf8");

const withoutComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("every in-game screen wears the collapsed medallion", () => {
    // Each host publishes the mode on mount and releases it on unmount. A host that only set it would
    // leave the menu it navigates to wearing the fight's HUD.
    for (const [screen, file] of [
        ["sandbox", "index.tsx"],
        ["ranked battle", "RankedGameViewRuntime.tsx"],
        ["draft", "PickAndBan/runtime.tsx"],
    ] as const) {
        test(`the ${screen} collapses SocialDock and releases it again`, () => {
            const code = withoutComments(read(file));
            expect(code).toContain("setBattleSystemControlsActive(true)");
            expect(code).toContain("setBattleSystemControlsActive(false)");
        });
    }

    test("the dock still carries all four controls, gated in production on being logged in", () => {
        const dock = read("social/SocialDockRuntime.tsx");
        for (const control of [
            'aria-label="Bets and predictions"',
            'aria-label="Friends"',
            'aria-label="Notifications"',
        ]) {
            expect(dock).toContain(control);
        }
        // Sound is a slot the volume control mounts into rather than an IconButton of its own.
        expect(dock).toContain('data-volume-control="social-dock"');
        // Production still gates the dock on an active account; the existing dev-only portal preview
        // may render it without a session so the social bubbles can be reviewed in the browser.
        expect(withoutComments(dock)).toContain(
            "const active = (authenticated && user?.is_active !== false) || mockPreview",
        );
    });

    test("the dock reserves the speaker footprint while the game footer owns the live control", () => {
        const dock = read("social/SocialDockRuntime.tsx");
        const slotStart = dock.indexOf('data-volume-control="social-dock"');
        const slotEnd = dock.indexOf("/>", slotStart);
        const slot = dock.slice(slotStart, slotEnd);

        expect(slotStart).toBeGreaterThan(-1);
        expect(slot).toContain("width: 32");
        expect(slot).toContain("height: 32");
        expect(slot).toContain('flex: "0 0 32px"');
    });
});
