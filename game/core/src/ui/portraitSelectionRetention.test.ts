import { afterEach, beforeEach, expect, test } from "bun:test";
import { CreatureVals } from "@heroesofcrypto/common";

import {
    installPortraitImageFactoryForTests,
    isDecodedImageReady,
    PORTRAIT_DECODE_CACHE_LIMIT,
    replaceDecodedImagePrefetch,
    resetPortraitImageCacheForTests,
    retainDecodedImages,
    warmDecodedImage,
    type PortraitImageStub,
} from "./decodedImageCache";
import {
    clearLeftSidebarPortraitSelection,
    leftSidebarPortraitSources,
    pinLeftSidebarPortrait,
    resetLeftSidebarPortraitWarmForTests,
    warmLeftSidebarPortrait,
} from "./leftSidebarPortraitWarm";

const reset = () => {
    resetPortraitImageCacheForTests();
    resetLeftSidebarPortraitWarmForTests();
};
beforeEach(reset);
afterEach(reset);

const controlledDecodes = () => {
    const jobs: Array<{ image: PortraitImageStub; finish: (ok?: boolean) => void; settled: boolean }> = [];
    installPortraitImageFactoryForTests(() => {
        const image: PortraitImageStub = { src: "", decoding: "", naturalWidth: 0, onload: null, onerror: null };
        let resolve!: () => void;
        let reject!: (error: Error) => void;
        const job = {
            image,
            settled: false,
            finish: (ok = true) => {
                job.settled = true;
                image.naturalWidth = ok ? 8 : 0;
                if (ok) resolve();
                else reject(new Error("Failed image"));
            },
        };
        image.decode = () =>
            new Promise<void>((done, fail) => {
                resolve = done;
                reject = fail;
            });
        jobs.push(job);
        return image;
    });
    const settle = async (src: string, ok = true) => {
        const job = jobs.find((candidate) => candidate.image.src === src && !candidate.settled);
        if (!job) throw new Error(`Missing pending decode: ${src}`);
        job.finish(ok);
        for (let index = 0; index < 8; index += 1) await Promise.resolve();
    };
    const fill = async (prefix: string) => {
        for (let index = 0; index < PORTRAIT_DECODE_CACHE_LIMIT; index += 1) {
            const src = `${prefix}-${index}`;
            const ready = warmDecodedImage(src);
            await settle(src);
            await ready;
        }
    };
    return { jobs, settle, fill, sources: () => jobs.map((job) => job.image.src) };
};

test("a selected cutout survives 18 late older completions, its slow plate, and the async React pin handoff", async () => {
    const controlled = controlledDecodes();
    const old = Array.from({ length: PORTRAIT_DECODE_CACHE_LIMIT }, (_, index) => `older-${index}`);
    const older = old.map((src) => warmDecodedImage(src, { priority: "high" }));
    const sources = leftSidebarPortraitSources(CreatureVals.BLACK_DRAGON);
    const selected = warmLeftSidebarPortrait(CreatureVals.BLACK_DRAGON);
    await controlled.settle(sources.creature!);
    for (const src of old) await controlled.settle(src);
    await Promise.all(older);
    expect(isDecodedImageReady(sources.creature)).toBe(true);
    await controlled.settle(sources.background!);
    expect(await selected).toBe(true);

    // React's effect pin has not committed yet: fulfillment must leave the pair protected.
    await controlled.fill("before-react-pin");
    expect(isDecodedImageReady(sources.creature)).toBe(true);
    pinLeftSidebarPortrait(CreatureVals.BLACK_DRAGON);
    await controlled.fill("after-react-pin");
    expect(isDecodedImageReady(sources.creature)).toBe(true);
    expect(controlled.sources().filter((src) => src === sources.creature)).toHaveLength(1);
});

test("the old displayed pair stays pinned while the new pair is pending or waiting for its matching pin", async () => {
    const controlled = controlledDecodes();
    const old = leftSidebarPortraitSources(CreatureVals.PEASANT);
    const next = leftSidebarPortraitSources(CreatureVals.BLACK_DRAGON);
    const previous = warmLeftSidebarPortrait(CreatureVals.PEASANT);
    await controlled.settle(old.creature!);
    await controlled.settle(old.background!);
    expect(await previous).toBe(true);
    pinLeftSidebarPortrait(CreatureVals.PEASANT);

    const selected = warmLeftSidebarPortrait(CreatureVals.BLACK_DRAGON);
    await controlled.settle(next.creature!);
    pinLeftSidebarPortrait(CreatureVals.PEASANT);
    await controlled.fill("during-next-plate");
    expect(isDecodedImageReady(old.creature)).toBe(true);
    expect(isDecodedImageReady(next.creature)).toBe(true);
    await controlled.settle(next.background!);
    expect(await selected).toBe(true);
    await controlled.fill("waiting-for-new-pin");
    expect(isDecodedImageReady(old.creature)).toBe(true);
    expect(isDecodedImageReady(next.creature)).toBe(true);
    pinLeftSidebarPortrait(CreatureVals.BLACK_DRAGON);
    await controlled.fill("new-pair-displayed");
    expect(isDecodedImageReady(old.creature)).toBe(false);
    expect(isDecodedImageReady(next.creature)).toBe(true);
});

test("an obsolete stalled foreground pair does not keep speculation paused after the current pair completes", async () => {
    const controlled = controlledDecodes();
    const old = leftSidebarPortraitSources(CreatureVals.PEASANT);
    const next = leftSidebarPortraitSources(CreatureVals.BLACK_DRAGON);
    const obsolete = warmLeftSidebarPortrait(CreatureVals.PEASANT);
    const selected = warmLeftSidebarPortrait(CreatureVals.BLACK_DRAGON);
    replaceDecodedImagePrefetch({}, [{ src: "next-likely" }]);
    expect(controlled.sources()).not.toContain("next-likely");
    await controlled.settle(next.creature!);
    await controlled.settle(next.background!);
    expect(await selected).toBe(true);
    expect(controlled.sources()).toContain("next-likely");
    expect(controlled.jobs.find((job) => job.image.src === old.creature)?.settled).toBe(false);
    clearLeftSidebarPortraitSelection(CreatureVals.PEASANT, obsolete);
    await controlled.fill("stale-cleanup");
    expect(isDecodedImageReady(next.creature)).toBe(true);
});

test("same-id duplicate warming protects the pair and old cleanup cannot dispose the newer request", async () => {
    const controlled = controlledDecodes();
    const sources = leftSidebarPortraitSources(CreatureVals.BLACK_DRAGON);
    const overlay = warmLeftSidebarPortrait(CreatureVals.BLACK_DRAGON);
    const react = warmLeftSidebarPortrait(CreatureVals.BLACK_DRAGON);
    expect(overlay).not.toBe(react);
    clearLeftSidebarPortraitSelection(CreatureVals.BLACK_DRAGON, overlay);
    await controlled.settle(sources.creature!);
    await controlled.fill("old-same-id-cleanup");
    expect(isDecodedImageReady(sources.creature)).toBe(true);
    await controlled.settle(sources.background!);
    expect(await overlay).toBe(true);
    expect(await react).toBe(true);
    expect(controlled.sources().filter((src) => src === sources.creature)).toHaveLength(1);

    clearLeftSidebarPortraitSelection(CreatureVals.BLACK_DRAGON, react);
    await controlled.fill("after-matching-cleanup");
    expect(isDecodedImageReady(sources.creature)).toBe(false);
});

test("a failed current pair releases its hold, while a stale failure cannot release the newer pair", async () => {
    const controlled = controlledDecodes();
    const old = leftSidebarPortraitSources(CreatureVals.PEASANT);
    const next = leftSidebarPortraitSources(CreatureVals.BLACK_DRAGON);
    const obsolete = warmLeftSidebarPortrait(CreatureVals.PEASANT);
    const selected = warmLeftSidebarPortrait(CreatureVals.BLACK_DRAGON);
    await controlled.settle(next.creature!);
    await controlled.settle(old.creature!, false);
    await controlled.settle(old.background!);
    expect(await obsolete).toBe(false);
    await controlled.fill("stale-failure");
    expect(isDecodedImageReady(next.creature)).toBe(true);
    await controlled.settle(next.background!, false);
    expect(await selected).toBe(false);
    await controlled.fill("current-failure");
    expect(isDecodedImageReady(next.creature)).toBe(false);
});

test("retention leases share references, dispose idempotently, and trim back to the cache cap", async () => {
    const controlled = controlledDecodes();
    const sources = Array.from({ length: PORTRAIT_DECODE_CACHE_LIMIT + 2 }, (_, index) => `held-${index}`);
    const first = retainDecodedImages(sources);
    const second = retainDecodedImages([sources[0]]);
    for (const src of sources) {
        const ready = warmDecodedImage(src);
        await controlled.settle(src);
        await ready;
    }
    expect(sources.every((src) => isDecodedImageReady(src))).toBe(true);
    first();
    first();
    expect(sources.filter((src) => isDecodedImageReady(src))).toHaveLength(PORTRAIT_DECODE_CACHE_LIMIT);
    expect(isDecodedImageReady(sources[0])).toBe(true);
    second();
    await controlled.fill("released-lease");
    expect(isDecodedImageReady(sources[0])).toBe(false);
});

test("disposing the latest pending selection releases only its foreground gate and allows a future retry", async () => {
    const controlled = controlledDecodes();
    const sources = leftSidebarPortraitSources(CreatureVals.BLACK_DRAGON);
    const selected = warmLeftSidebarPortrait(CreatureVals.BLACK_DRAGON);
    replaceDecodedImagePrefetch({}, [{ src: "after-deselect" }]);
    expect(controlled.sources()).not.toContain("after-deselect");
    clearLeftSidebarPortraitSelection(CreatureVals.BLACK_DRAGON, selected);
    expect(controlled.sources()).toContain("after-deselect");
    await controlled.settle(sources.creature!);
    await controlled.settle(sources.background!);
    await selected;
    await controlled.fill("after-deselected");
    expect(isDecodedImageReady(sources.creature)).toBe(false);

    const retry = warmLeftSidebarPortrait(CreatureVals.BLACK_DRAGON);
    await controlled.settle(sources.creature!);
    expect(await retry).toBe(true);
});
