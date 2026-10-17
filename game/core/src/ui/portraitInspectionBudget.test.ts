import { afterEach, expect, test } from "bun:test";
import { CreatureVals } from "@heroesofcrypto/common";

import {
    installPortraitImageFactoryForTests,
    isDecodedImageReady,
    pinDecodedImages,
    resetPortraitImageCacheForTests,
    warmDecodedImage,
} from "./decodedImageCache";
import {
    leftSidebarPortraitSources,
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
