import { expect, test } from "bun:test";
import { CreatureVals } from "@heroesofcrypto/common";

import {
    PORTRAIT_DECODE_CACHE_LIMIT,
    installPortraitImageFactoryForTests,
    isDecodedImageReady,
    pinDecodedImages,
    resetPortraitImageCacheForTests,
    warmDecodedImage,
    type PortraitImageStub,
} from "./decodedImageCache";
import {
    displayedSidebarCreatureId,
    leftSidebarPortraitSources,
    resetLeftSidebarPortraitWarmForTests,
    showsSidebarAnimationFrame,
} from "./leftSidebarPortraitWarm";
import { resolveLeftSidebarPortraitAnimation, sidebarPortraitFirstFrame } from "./leftSidebarPortraitAnimation";

test("a sidebar portrait stays on the previous creature until the next pair is decoded", () => {
    expect(displayedSidebarCreatureId(7, 5, false)).toBe(5);
    expect(displayedSidebarCreatureId(7, 5, true)).toBe(7);
    expect(displayedSidebarCreatureId(5, 5, false)).toBe(5);
    expect(displayedSidebarCreatureId(7, undefined, false)).toBeUndefined();
    expect(displayedSidebarCreatureId(undefined, 5, true)).toBeUndefined();
});

test("a still inspection shows the animation's frame zero, with the faction plate as its own file", () => {
    const animation = resolveLeftSidebarPortraitAnimation(CreatureVals.CHAMPION)!;
    const still = leftSidebarPortraitSources(CreatureVals.CHAMPION, false);
    const playing = leftSidebarPortraitSources(CreatureVals.CHAMPION, true);
    // The same picture whether inspected or selected, so starting playback never swaps the image.
    expect(still.creature).toBe(sidebarPortraitFirstFrame(animation).src);
    expect(playing.creature).toBe(still.creature);
    expect(still.background).toBeTruthy();
    expect(still.background).not.toBe(still.creature);
    // An unpaged sheet is too large to decode on hover: a still inspection keeps the cutout for it.
    const unpaged = { ...animation, pages: undefined };
    expect(showsSidebarAnimationFrame(unpaged, false)).toBe(false);
    expect(showsSidebarAnimationFrame(unpaged, true)).toBe(true);
    expect(showsSidebarAnimationFrame(null, true)).toBe(false);
    for (const id of [CreatureVals.PEASANT, CreatureVals.CHAMPION]) {
        const animation = resolveLeftSidebarPortraitAnimation(id)!;
        expect(leftSidebarPortraitSources(id).atlas).toBe(animation.pages?.[0]?.src ?? animation.src);
    }
});

test("decoded portraits stay ready, and the cache drops the oldest cutout past the cap", async () => {
    resetPortraitImageCacheForTests();
    resetLeftSidebarPortraitWarmForTests();
    const made: string[] = [];
    installPortraitImageFactoryForTests(() => {
        let src = "";
        const image = {
            decoding: "",
            naturalWidth: 4,
            onload: null,
            onerror: null,
            get src() {
                return src;
            },
            set src(value: string) {
                src = value;
                made.push(value);
            },
            decode: () => Promise.resolve(),
        } satisfies PortraitImageStub;
        return image;
    });

    expect(await warmDecodedImage("kept", { lock: true })).toBe(true);
    const urls = Array.from({ length: PORTRAIT_DECODE_CACHE_LIMIT + 2 }, (_, index) => `cutout-${index}`);
    for (const url of urls) expect(await warmDecodedImage(url)).toBe(true);

    expect(isDecodedImageReady("kept")).toBe(true);
    expect(isDecodedImageReady(urls[0])).toBe(false);
    expect(isDecodedImageReady(urls[1])).toBe(false);
    expect(isDecodedImageReady(urls.at(-1)!)).toBe(true);
    expect(made.filter((url) => url === urls[0])).toHaveLength(1);

    pinDecodedImages([urls[2]]);
    for (let extra = 0; extra < 3; extra++) await warmDecodedImage(`later-${extra}`);
    expect(isDecodedImageReady(urls[2])).toBe(true);
});

test("a failed decode does not count as ready", async () => {
    resetPortraitImageCacheForTests();
    installPortraitImageFactoryForTests(() => {
        let src = "";
        return {
            decoding: "",
            naturalWidth: 0,
            onload: null,
            onerror: null,
            get src() {
                return src;
            },
            set src(value: string) {
                src = value;
            },
            decode: () => Promise.resolve(),
        };
    });
    expect(await warmDecodedImage("missing")).toBe(false);
    expect(isDecodedImageReady("missing")).toBe(false);
});
