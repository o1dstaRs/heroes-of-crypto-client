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

import { MissingAssetLocationError, resolveAnimationsOutputLocation, resolveImagesLocation } from "./assetLocations";

/**
 * The art source is ALWAYS the environment variable.
 *
 * These pin the rule itself and the two specific ways the old code broke it, because both were silent:
 * an unset variable resolved to a missing sibling checkout that `build:images` would copy nothing from
 * (after having already deleted the art), and a configured variable was thrown away outright whenever
 * its path mentioned Dropbox.
 */
describe("asset locations come from the environment", () => {
    test("the images location is read from HOC_IMAGES_LOC", () => {
        expect(resolveImagesLocation({ HOC_IMAGES_LOC: "/Volumes/art/images" })).toBe("/Volumes/art/images");
    });

    test("an unset images location throws instead of guessing a default", () => {
        expect(() => resolveImagesLocation({})).toThrow(MissingAssetLocationError);
        // The message has to be actionable: it names the variable and shows a real path shape.
        expect(() => resolveImagesLocation({})).toThrow(/HOC_IMAGES_LOC/);
    });

    test("a blank or whitespace-only value counts as unset", () => {
        expect(() => resolveImagesLocation({ HOC_IMAGES_LOC: "" })).toThrow(MissingAssetLocationError);
        expect(() => resolveImagesLocation({ HOC_IMAGES_LOC: "   " })).toThrow(MissingAssetLocationError);
    });

    test("surrounding whitespace is trimmed, so a copy-pasted path still resolves", () => {
        expect(resolveImagesLocation({ HOC_IMAGES_LOC: "  /Volumes/art/images  " })).toBe("/Volumes/art/images");
    });

    test("a Dropbox path is honoured like any other — the skip-Dropbox hack is gone", () => {
        // Regression pin: consumers used to discard this value and read a non-existent local checkout,
        // which is what kept the image-policy gate vacuous.
        const dropbox = "/Users/someone/Dropbox/heroesofcrypto/images";
        expect(resolveImagesLocation({ HOC_IMAGES_LOC: dropbox })).toBe(dropbox);
    });

    test("a path containing spaces survives (Google Drive is the current source)", () => {
        const drive = "/Users/someone/Google Drive/My Drive/heroesofcrypto/images";
        expect(resolveImagesLocation({ HOC_IMAGES_LOC: drive })).toBe(drive);
    });

    test("an explicit argument wins over the environment", () => {
        expect(resolveImagesLocation({ HOC_IMAGES_LOC: "/from/env" }, "/from/cli")).toBe("/from/cli");
        // ...and satisfies the requirement on its own, since it is a deliberate choice at the call site.
        expect(resolveImagesLocation({}, "/from/cli")).toBe("/from/cli");
    });
});

describe("animation atlases resolve to the output subdirectory", () => {
    test("HOC_ANIMATIONS_LOC names the root, and exports live under output/", () => {
        expect(resolveAnimationsOutputLocation({ HOC_ANIMATIONS_LOC: "/Volumes/art/animations" })).toBe(
            join("/Volumes/art/animations", "output"),
        );
    });

    test("an unset animations location throws and names its own variable", () => {
        expect(() => resolveAnimationsOutputLocation({})).toThrow(MissingAssetLocationError);
        expect(() => resolveAnimationsOutputLocation({})).toThrow(/HOC_ANIMATIONS_LOC/);
    });

    test("an explicit argument is used exactly as given, with no output/ appended", () => {
        expect(resolveAnimationsOutputLocation({ HOC_ANIMATIONS_LOC: "/from/env" }, "/exact/dir")).toBe("/exact/dir");
    });
});

/**
 * The consumers, pinned against their source. These are the three places that used to guess, and a
 * regression here is a silent art rollback rather than a failing render, so it is worth pinning the
 * absence of the old fallbacks directly.
 */
describe("no consumer keeps a fallback art path", () => {
    const read = (relativePath: string): string => readFileSync(join(import.meta.dir, "..", relativePath), "utf8");

    test("copy:images requires the variable and has no :- default", () => {
        const packageJson = read("package.json");
        const copyImages = JSON.parse(packageJson).scripts["copy:images"] as string;
        expect(copyImages).toContain("$HOC_IMAGES_LOC");
        // `${HOC_IMAGES_LOC:-...}` is the exact shape that deleted the art set and copied nothing back.
        expect(copyImages).not.toContain(":-");
        // The guard must run first, so an unset variable stops the script before rimraf/cpy touch anything.
        expect(copyImages.indexOf("require_asset_location")).toBeLessThan(copyImages.indexOf("cpy"));
    });

    test("the image-policy checker and the atlas generator resolve through this module", () => {
        for (const script of ["scripts/check_image_asset_policy.ts", "scripts/generate_animation_atlases.js"]) {
            const source = read(script);
            expect(source).toContain("assetLocations");
            // Neither the missing sibling checkout nor the skip-Dropbox exclusion may come back.
            expect(source).not.toContain("heroesofcrypto-assets");
            expect(source).not.toContain('includes("Dropbox")');
        }
    });
});
