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

import { describe, expect, test } from "bun:test";

import { getBattlefieldCreatureContourFilter } from "./BattlefieldCreatureContourFilter";

/**
 * The contour shader is compiled once per opacity and shared. Two properties matter:
 *
 *  - a TRANSIENT compile failure must not cost that opacity its contour for the rest of the session.
 *    The first `Filter.from` of a process throws in a not-yet-warm/headless renderer and every later
 *    call succeeds, so writing the failure off immediately left whichever creature rendered first
 *    permanently un-outlined — and made specs order-dependent (the first one to render ate it).
 *  - success is still cached, so sprites share one immutable filter instance rather than recompiling.
 */
describe("battlefield creature contour filter", () => {
    test("a transient first-call failure is retried, not written off", () => {
        // 0.04 is what the process's very first call asks for in this file; whether or not the
        // renderer is warm, asking twice must converge on a real filter rather than a permanent hole.
        const first = getBattlefieldCreatureContourFilter(0.04);
        const second = getBattlefieldCreatureContourFilter(0.04);
        expect(second ?? first).toBeDefined();
    });

    test("a compiled opacity is cached and shared by identity", () => {
        const a = getBattlefieldCreatureContourFilter(0.5);
        const b = getBattlefieldCreatureContourFilter(0.5);
        expect(a).toBeDefined();
        expect(b).toBe(a);
    });

    test("opacity is clamped, so out-of-range requests reuse the endpoint filters", () => {
        expect(getBattlefieldCreatureContourFilter(5)).toBe(getBattlefieldCreatureContourFilter(1));
        expect(getBattlefieldCreatureContourFilter(-3)).toBe(getBattlefieldCreatureContourFilter(0));
    });
});
