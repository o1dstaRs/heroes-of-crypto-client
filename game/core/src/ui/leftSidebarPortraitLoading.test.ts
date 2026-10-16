import { afterEach, beforeEach, expect, test } from "bun:test";
import { CreatureVals } from "@heroesofcrypto/common";

import {
    installPortraitImageFactoryForTests,
    isDecodedImageReady,
    PORTRAIT_DECODE_CACHE_LIMIT,
    resetPortraitImageCacheForTests,
    type PortraitImageStub,
    warmDecodedImage,
} from "./decodedImageCache";
import { isAtlasReady, warmAtlas } from "./LeftSideBar/unitAtlas";
import {
    clearLeftSidebarPortraitSelection,
    isLeftSidebarPortraitReady,
    leftSidebarPortraitSources,
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
    const jobs: Array<{
        image: PortraitImageStub;
        resolve?: () => void;
        reject?: (error: Error) => void;
        settled: boolean;
    }> = [];
    installPortraitImageFactoryForTests(() => {
        const job: (typeof jobs)[number] = {
            image: {
                src: "",
                decoding: "",
                naturalWidth: 0,
                onload: null,
                onerror: null,
            },
            settled: false,
        };
        job.image.decode = () =>
            new Promise<void>((resolve, reject) => {
                job.resolve = resolve;
                job.reject = reject;
            });
        jobs.push(job);
        return job.image;
    });
    const settle = (src: string | undefined, successful = true) => {
        const job = jobs.find((candidate) => candidate.image.src === src && !candidate.settled);
        if (!job) throw new Error(`No pending portrait decode for ${src}`);
        job.settled = true;
        if (successful) {
            job.image.naturalWidth = 8;
            job.resolve?.();
        } else {
            job.reject?.(new Error("Image request failed"));
        }
    };
    return { jobs, settle };
};

test("the selected cutout and background finish without waiting for optional atlas or glow", async () => {
    const controlled = controlledDecodes();
    const sources = leftSidebarPortraitSources(CreatureVals.PEASANT);
    expect(sources.atlas).toBeTruthy();
    expect(sources.glow).toBeTruthy();
    const pair = warmLeftSidebarPortrait(CreatureVals.PEASANT);
    expect(controlled.jobs.map((job) => job.image.src)).toEqual([sources.creature!, sources.background!]);
    let settled = false;
    void pair.then(() => {
        settled = true;
    });

    controlled.settle(sources.creature);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(isLeftSidebarPortraitReady(CreatureVals.PEASANT)).toBe(false);
    controlled.settle(sources.background);

    expect(await pair).toBe(true);
    expect(isLeftSidebarPortraitReady(CreatureVals.PEASANT)).toBe(true);
    expect(isAtlasReady(sources.atlas!)).toBe(false);
    expect(isDecodedImageReady(sources.glow)).toBe(false);
    expect(controlled.jobs.find((job) => job.image.src === sources.atlas)?.settled).toBe(false);
});

for (const failedLayer of ["creature", "background"] as const) {
    test(`a failed ${failedLayer} cannot release the selected portrait and can retry`, async () => {
        const controlled = controlledDecodes();
        const sources = leftSidebarPortraitSources(CreatureVals.CHAMPION);
        const first = warmLeftSidebarPortrait(CreatureVals.CHAMPION);
        controlled.settle(sources.creature, failedLayer !== "creature");
        controlled.settle(sources.background, failedLayer !== "background");

        expect(await first).toBe(false);
        expect(isLeftSidebarPortraitReady(CreatureVals.CHAMPION)).toBe(false);
        const retry = warmLeftSidebarPortrait(CreatureVals.CHAMPION);
        controlled.settle(sources[failedLayer]);
        expect(await retry).toBe(true);
        expect(isLeftSidebarPortraitReady(CreatureVals.CHAMPION)).toBe(true);
        expect(controlled.jobs.filter((job) => job.image.src === sources[failedLayer])).toHaveLength(2);
    });
}

test("optional image failures do not block an otherwise ready portrait", async () => {
    const controlled = controlledDecodes();
    const sources = leftSidebarPortraitSources(CreatureVals.PEASANT);
    const pair = warmLeftSidebarPortrait(CreatureVals.PEASANT);
    controlled.settle(sources.creature);
    controlled.settle(sources.background);

    expect(await pair).toBe(true);
    controlled.settle(sources.atlas, false);
    controlled.settle(sources.glow, false);
    await Promise.resolve();
    expect(isAtlasReady(sources.atlas!)).toBe(false);
    expect(isLeftSidebarPortraitReady(CreatureVals.PEASANT)).toBe(true);
});

test("atlas callers share one pending decode, and failed atlases remain retryable", async () => {
    const controlled = controlledDecodes();
    const first = warmAtlas("retryable-atlas");
    const joined = warmAtlas("retryable-atlas");
    expect(controlled.jobs).toHaveLength(1);
    controlled.settle("retryable-atlas", false);

    expect(await first).toBe(false);
    expect(await joined).toBe(false);
    expect(isAtlasReady("retryable-atlas")).toBe(false);
    const retry = warmAtlas("retryable-atlas");
    expect(controlled.jobs).toHaveLength(2);
    controlled.settle("retryable-atlas");
    expect(await retry).toBe(true);
    expect(isAtlasReady("retryable-atlas")).toBe(true);
});

test("an evicted atlas must decode again before it replaces a still portrait", async () => {
    const controlled = controlledDecodes();
    const first = warmAtlas("evicted-atlas");
    controlled.settle("evicted-atlas");
    expect(await first).toBe(true);

    for (let index = 0; index < PORTRAIT_DECODE_CACHE_LIMIT; index += 1) {
        const src = `cutout-${index}`;
        const decode = warmDecodedImage(src);
        controlled.settle(src);
        await decode;
    }
    expect(isAtlasReady("evicted-atlas")).toBe(false);
    const retry = warmAtlas("evicted-atlas");
    expect(isAtlasReady("evicted-atlas")).toBe(false);
    expect(controlled.jobs.filter((job) => job.image.src === "evicted-atlas")).toHaveLength(2);
    controlled.settle("evicted-atlas");
    expect(await retry).toBe(true);
    expect(isAtlasReady("evicted-atlas")).toBe(true);
});

test("a faction background retried after failure stays locked through roster eviction", async () => {
    const controlled = controlledDecodes();
    const sources = leftSidebarPortraitSources(CreatureVals.CHAMPION);
    const first = warmLeftSidebarPortrait(CreatureVals.CHAMPION);
    controlled.settle(sources.creature);
    controlled.settle(sources.background, false);
    expect(await first).toBe(false);
    const retry = warmLeftSidebarPortrait(CreatureVals.CHAMPION);
    controlled.settle(sources.background);
    expect(await retry).toBe(true);
    clearLeftSidebarPortraitSelection(CreatureVals.CHAMPION, retry);

    for (let index = 0; index < PORTRAIT_DECODE_CACHE_LIMIT + 1; index += 1) {
        const src = `later-cutout-${index}`;
        const decode = warmDecodedImage(src);
        controlled.settle(src);
        await decode;
    }
    expect(isDecodedImageReady(sources.background)).toBe(true);
    expect(isDecodedImageReady(sources.creature)).toBe(false);
});
