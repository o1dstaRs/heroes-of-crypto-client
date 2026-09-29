import { expect, test } from "bun:test";
import { CreatureVals } from "@heroesofcrypto/common";

import {
    PORTRAIT_DECODE_CACHE_LIMIT,
    PORTRAIT_DECODE_CONCURRENCY,
    enqueueDecodedImage,
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
} from "./leftSidebarPortraitWarm";

const deferred = (): { images: PortraitImageStub[]; release: Array<() => void> } => {
    const images: PortraitImageStub[] = [];
    const release: Array<() => void> = [];
    installPortraitImageFactoryForTests(() => {
        let src = "";
        let resolveDecode: (() => void) | undefined;
        const image = {
            decoding: "",
            naturalWidth: 8,
            onload: null,
            onerror: null,
            get src() {
                return src;
            },
            set src(value: string) {
                src = value;
            },
            decode: () =>
                new Promise<void>((resolve) => {
                    resolveDecode = resolve;
                }),
        } satisfies PortraitImageStub;
        images.push(image);
        release.push(() => resolveDecode?.());
        return image;
    });
    return { images, release };
};

test("a sidebar portrait stays on the previous creature until the next pair is decoded", () => {
    expect(displayedSidebarCreatureId(7, 5, false)).toBe(5);
    expect(displayedSidebarCreatureId(7, 5, true)).toBe(7);
    expect(displayedSidebarCreatureId(5, 5, false)).toBe(5);
    expect(displayedSidebarCreatureId(7, undefined, false)).toBeUndefined();
    expect(displayedSidebarCreatureId(undefined, 5, true)).toBeUndefined();
});

test("left sidebar art keeps the cutout and the faction plate as two files", () => {
    const champion = leftSidebarPortraitSources(CreatureVals.CHAMPION);
    expect(champion.creature).toContain("champion_left_screen_x2.webp");
    expect(champion.background).toBeTruthy();
    expect(champion.background).not.toContain("champion_left_screen_x2");
    expect(leftSidebarPortraitSources(CreatureVals.PEASANT).atlas).toContain("peasant_left_screen_idle_atlas.webp");
    expect(leftSidebarPortraitSources(CreatureVals.CHAMPION).atlas).toBeUndefined();
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

test("roster warming decodes a few cutouts at a time", async () => {
    resetPortraitImageCacheForTests();
    const pending = deferred();
    const urls = ["a", "b", "c", "d"];
    for (const url of urls) enqueueDecodedImage(url);
    await Promise.resolve();
    expect(pending.images).toHaveLength(PORTRAIT_DECODE_CONCURRENCY);

    pending.release[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(pending.images.length).toBeGreaterThan(PORTRAIT_DECODE_CONCURRENCY);
    expect(pending.images.length).toBeLessThan(urls.length + 1);

    for (const release of pending.release) release();
    await Promise.resolve();
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
