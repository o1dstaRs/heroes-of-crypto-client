import { describe, expect, test } from "bun:test";

import { Perk } from "@heroesofcrypto/common";

import { images } from "../generated/image_imports";
import { getPerkIconImage } from "./perkCopy";

/**
 * Every selectable perk must resolve to art that actually ships.
 *
 * PerkProperties.imageKey used to be built as `perk_<slug>_256` — perk_three_reveals_256,
 * perk_see_all_256, perk_see_none_256 — while the art has always shipped as perk_scout,
 * perk_spymaster and perk_blind_fury. Not one of those keys resolved to anything, and nothing
 * failed: the icon just silently rendered nothing.
 */
// CI has no Dropbox access, so it runs against generate_ci_stubs.js's `images = {}` stub (empty by
// design — that script only exists to let `tsc --noEmit` resolve the import, see its own header
// comment) rather than the real generate_image_imports.js manifest. There is nothing here to check
// against a manifest with zero real entries, so — mirroring gameImageAssetPolicy.test.ts's own
// Dropbox-dependent test, which early-returns the same way when its real data source is unavailable —
// these bodies no-op under the stub instead of failing on data the environment cannot provide. Locally
// (and in any CI that ever gains real image generation) the manifest is always non-empty and the real
// checks run.
const hasRealImageManifest = Object.keys(images as Record<string, string>).length > 0;

describe("perk art resolves", () => {
    test("every selectable perk has an imageKey pointing at a real asset", () => {
        if (!hasRealImageManifest) return;
        const missing = Perk.PERK_LIST.filter((perk) => !(perk.imageKey in (images as Record<string, string>))).map(
            (perk) => `${perk.name} -> ${perk.imageKey}`,
        );

        expect(missing).toEqual([]);
    });

    test("the client's icon lookup returns a usable image for each of them", () => {
        if (!hasRealImageManifest) return;
        for (const perk of Perk.PERK_LIST) {
            expect(`${perk.name}: ${typeof getPerkIconImage(perk.id)}`).toBe(`${perk.name}: string`);
        }
    });
});
