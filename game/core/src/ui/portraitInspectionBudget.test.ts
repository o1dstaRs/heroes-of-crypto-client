import { afterEach, expect, test } from "bun:test";
import { CreatureVals } from "@heroesofcrypto/common";

import {
    installPortraitImageFactoryForTests,
    isDecodedImageReady,
    pinDecodedImages,
    resetPortraitImageCacheForTests,
    warmDecodedImage,
} from "./decodedImageCache";
import { resolveIntegratedArbalesterPortrait } from "./integratedArbalesterPortrait";
import { resolveLeftSidebarPortraitAnimation } from "./leftSidebarPortraitAnimation";
import {
    leftSidebarPortraitSources,
    pinLeftSidebarPortrait,
    resetLeftSidebarPortraitWarmForTests,
    warmLeftSidebarPortrait,
} from "./leftSidebarPortraitWarm";

afterEach(() => {
    resetLeftSidebarPortraitWarmForTests();
    resetPortraitImageCacheForTests();
});

test("hover inspection warms only the still pair and leaves large idle sheets cold", async () => {
    resetPortraitImageCacheForTests();
    const requested: string[] = [];
    installPortraitImageFactoryForTests(() => ({
        decoding: "",
        naturalWidth: 1144,
        naturalHeight: 1616,
        onload: null,
        onerror: null,
        get src() {
            return requested.at(-1) ?? "";
        },
        set src(value: string) {
            requested.push(value);
        },
        decode: () => Promise.resolve(),
    }));
    for (const id of [CreatureVals.HEALER, CreatureVals.BATTLE_MAGE, CreatureVals.MANTICORE]) {
        const sources = leftSidebarPortraitSources(id);
        expect(await warmLeftSidebarPortrait(id, false)).toBe(true);
        expect(requested).toContain(sources.creature!);
        expect(requested).not.toContain(sources.atlas!);
    }
});

test("a 100-frame portrait sheet is released when it leaves the screen, even below the image-count cap", async () => {
    resetPortraitImageCacheForTests();
    installPortraitImageFactoryForTests(() => ({
        decoding: "",
        naturalWidth: 5720,
        naturalHeight: 8080,
        onload: null,
        onerror: null,
        src: "",
        decode: () => Promise.resolve(),
    }));
    pinDecodedImages(["current-sheet"]);
    expect(await warmDecodedImage("current-sheet")).toBe(true);
    expect(isDecodedImageReady("current-sheet")).toBe(true);
    pinDecodedImages(["next-portrait"]);
    expect(isDecodedImageReady("current-sheet")).toBe(false);
});

test("selecting Arbalester warms the same integrated atlas painted by its sidebar portrait", async () => {
    const requested: string[] = [];
    installPortraitImageFactoryForTests(() => ({
        decoding: "",
        naturalWidth: 1144,
        naturalHeight: 1616,
        onload: null,
        onerror: null,
        get src() {
            return requested.at(-1) ?? "";
        },
        set src(value: string) {
            requested.push(value);
        },
        decode: () => Promise.resolve(),
    }));
    expect(await warmLeftSidebarPortrait(CreatureVals.ARBALESTER)).toBe(true);
    const displayedAtlas = resolveIntegratedArbalesterPortrait(CreatureVals.ARBALESTER, null)!.src;
    const supersededAtlas = resolveLeftSidebarPortraitAnimation(CreatureVals.ARBALESTER)!.src;
    expect(requested).toContain(displayedAtlas);
    expect(requested).not.toContain(supersededAtlas);
});

test("the displayed Arbalester atlas stays decoded until another sidebar portrait replaces it", async () => {
    installPortraitImageFactoryForTests(() => ({
        decoding: "",
        naturalWidth: 5720,
        naturalHeight: 8080,
        onload: null,
        onerror: null,
        src: "",
        decode: () => Promise.resolve(),
    }));
    const displayedAtlas = resolveIntegratedArbalesterPortrait(CreatureVals.ARBALESTER, null)!.src;
    pinLeftSidebarPortrait(CreatureVals.ARBALESTER);
    expect(await warmDecodedImage(displayedAtlas)).toBe(true);
    expect(isDecodedImageReady(displayedAtlas)).toBe(true);
    pinLeftSidebarPortrait(CreatureVals.PEASANT);
    expect(isDecodedImageReady(displayedAtlas)).toBe(false);
});
