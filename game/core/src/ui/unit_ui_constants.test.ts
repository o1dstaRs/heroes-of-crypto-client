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

import { UNIT_ID_TO_IMAGE } from "./unit_ui_constants";

/**
 * This map is built at module scope, so anything that throws while building it takes the whole client
 * down — and it is built from art that is generated per machine, not committed. A missing portrait
 * therefore has to degrade rather than throw; these pin that it degrades to something usable instead of
 * letting `undefined` reach a texture loader, where the failure would resurface as an unreadable
 * "could not find a source type for resource" much further from the cause.
 */
describe("creature portraits", () => {
    test("every creature resolves to a usable image URL", () => {
        const entries = Object.entries(UNIT_ID_TO_IMAGE);
        expect(entries.length).toBeGreaterThan(50);

        const unusable = entries.filter(([, url]) => typeof url !== "string" || url.trim() === "");
        expect(unusable).toEqual([]);
    });

    test("portraits point at real art rather than a bare key", () => {
        // The generated map stores resolved URLs; a raw key here means a lookup returned the key itself.
        for (const [id, url] of Object.entries(UNIT_ID_TO_IMAGE)) {
            expect(`${id}:${url}`).toMatch(/:(?:file|https?|data|blob):/);
        }
    });
});
