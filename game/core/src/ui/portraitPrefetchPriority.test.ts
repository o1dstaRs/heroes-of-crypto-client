import { afterEach, beforeEach, expect, test } from "bun:test";
import { CreatureVals, FactionVals, getCreaturesOf } from "@heroesofcrypto/common";

import {
    clearDecodedImagePrefetch,
    installPortraitImageFactoryForTests,
    isDecodedImageReady,
    PORTRAIT_DECODE_CACHE_LIMIT,
    replaceDecodedImagePrefetch,
    resetPortraitImageCacheForTests,
    warmDecodedImage,
    type PortraitImageStub,
} from "./decodedImageCache";
import {
    clearLeftSidebarPortraitPrefetch,
    enqueueLeftSidebarPortraits,
    leftSidebarPortraitSources,
    resetLeftSidebarPortraitWarmForTests,
    SIDEBAR_PORTRAIT_PREFETCH_LIMIT,
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
    return { jobs, settle, sources: () => jobs.map((job) => job.image.src) };
};

test("cold selection starts exactly its two high-priority critical files, then low-priority optional layers", async () => {
    const controlled = controlledDecodes();
    const sources = leftSidebarPortraitSources(CreatureVals.PEASANT);
    const pair = warmLeftSidebarPortrait(CreatureVals.PEASANT);
    expect(controlled.sources()).toEqual([sources.creature!, sources.background!]);
    expect(controlled.jobs.every((job) => job.image.fetchPriority === "high")).toBe(true);
    await controlled.settle(sources.creature!);
    expect(controlled.sources()).toHaveLength(2);
    await controlled.settle(sources.background!);
    expect(await pair).toBe(true);
    expect(controlled.sources()).toEqual([sources.creature!, sources.background!, sources.glow!, sources.atlas!]);
    expect(controlled.jobs.slice(2).every((job) => job.image.fetchPriority === "low")).toBe(true);
});

test("a selected pair pauses further speculative starts and promotes an already-loading source without duplication", async () => {
    const controlled = controlledDecodes();
    const owner = {};
    replaceDecodedImagePrefetch(owner, [{ src: "old-a" }, { src: "old-b" }, { src: "old-c" }]);
    const selected = warmDecodedImage("old-a", { priority: "high" });
    const background = warmDecodedImage("selected-background", { priority: "high", lock: true });
    expect(controlled.sources()).toEqual(["old-a", "old-b", "selected-background"]);
    expect(controlled.jobs[0].image.fetchPriority).toBe("high");
    await controlled.settle("old-b");
    expect(controlled.sources()).not.toContain("old-c");
    await controlled.settle("old-a");
    expect(await selected).toBe(true);
    expect(controlled.sources()).not.toContain("old-c");
    await controlled.settle("selected-background");
    expect(await background).toBe(true);
    expect(controlled.sources()).toEqual(["old-a", "old-b", "selected-background", "old-c"]);
});

test("replacing a level drops its old queued files and starts the new level on the first released slot", async () => {
    const controlled = controlledDecodes();
    const owner = {};
    const factions = [FactionVals.LIFE, FactionVals.NATURE, FactionVals.CHAOS, FactionVals.MIGHT];
    const level1 = factions.flatMap((faction) => [...getCreaturesOf(faction, 1)]);
    const level4 = factions.flatMap((faction) => [...getCreaturesOf(faction, 4)]);
    enqueueLeftSidebarPortraits(level1, owner);
    const oldInitialSources = controlled.sources();
    expect(oldInitialSources).toHaveLength(2);
    enqueueLeftSidebarPortraits(level4, owner);
    expect(controlled.sources()).toEqual(oldInitialSources);
    await controlled.settle(oldInitialSources[0]);
    expect(controlled.sources()[2]).toBe(leftSidebarPortraitSources(level4[0]).creature!);

    // Finish only work that actually started. The remaining old level and both levels' atlases stay cold.
    for (let round = 0; round < 12; round += 1) {
        for (const job of controlled.jobs.filter((candidate) => !candidate.settled))
            await controlled.settle(job.image.src);
    }
    const requestedCutouts = controlled
        .sources()
        .filter((src) => level4.some((id) => leftSidebarPortraitSources(id).creature === src));
    expect(requestedCutouts).toHaveLength(SIDEBAR_PORTRAIT_PREFETCH_LIMIT);
    expect(controlled.sources()).not.toContain(leftSidebarPortraitSources(level1[1]).creature!);
    expect(controlled.sources()).not.toContain(leftSidebarPortraitSources(CreatureVals.PEASANT).atlas!);
});

test("one owner's cleanup retains another owner's shared queued URL and leaves started work alive", async () => {
    const controlled = controlledDecodes();
    const roster = {};
    const turns = {};
    replaceDecodedImagePrefetch(roster, [
        { src: "started-a" },
        { src: "started-b" },
        { src: "shared" },
        { src: "roster-only" },
    ]);
    replaceDecodedImagePrefetch(turns, [{ src: "shared" }, { src: "turn-only" }]);
    clearDecodedImagePrefetch(roster);
    await controlled.settle("started-a");
    await controlled.settle("started-b");
    expect(controlled.sources()).toEqual(["started-a", "started-b", "shared", "turn-only"]);
    expect(isDecodedImageReady("started-a")).toBe(true);
    expect(isDecodedImageReady("started-b")).toBe(true);
    expect(controlled.jobs.slice(2).every((job) => job.image.fetchPriority === "low")).toBe(true);
});

test("foreground joins a queued URL urgently, and a failed promoted request can retry", async () => {
    const controlled = controlledDecodes();
    const owner = {};
    replaceDecodedImagePrefetch(owner, [{ src: "a" }, { src: "b" }, { src: "selected" }]);
    const first = warmDecodedImage("selected", { priority: "high" });
    expect(controlled.sources()).toEqual(["a", "b", "selected"]);
    expect(controlled.jobs[2].image.fetchPriority).toBe("high");
    await controlled.settle("selected", false);
    expect(await first).toBe(false);
    expect(isDecodedImageReady("selected")).toBe(false);
    const retry = warmDecodedImage("selected", { priority: "high" });
    await controlled.settle("selected");
    expect(await retry).toBe(true);
    expect(controlled.sources().filter((src) => src === "selected")).toHaveLength(2);
});

test("foreground promotion preserves a queued faction plate's locked retention", async () => {
    const controlled = controlledDecodes();
    replaceDecodedImagePrefetch({}, [{ src: "a" }, { src: "b" }, { src: "plate", lock: true }]);
    const plate = warmDecodedImage("plate", { priority: "high" });
    await controlled.settle("plate");
    expect(await plate).toBe(true);
    for (let index = 0; index <= PORTRAIT_DECODE_CACHE_LIMIT; index += 1) {
        const src = `cutout-${index}`;
        const cutout = warmDecodedImage(src);
        await controlled.settle(src);
        await cutout;
    }
    expect(isDecodedImageReady("plate")).toBe(true);
    expect(isDecodedImageReady("cutout-0")).toBe(false);
});

test("clearing a portrait owner suppresses its remaining HD prefetch while preserving completed readiness", async () => {
    const controlled = controlledDecodes();
    const owner = {};
    enqueueLeftSidebarPortraits([CreatureVals.PEASANT, CreatureVals.SQUIRE, CreatureVals.CHAMPION], owner);
    const sources = controlled.sources();
    clearLeftSidebarPortraitPrefetch(owner);
    for (const src of sources) await controlled.settle(src);
    expect(controlled.sources()).toEqual(sources);
    expect(sources.every((src) => isDecodedImageReady(src))).toBe(true);
});

test("a superseded selection does not enqueue its large optional atlas", async () => {
    const controlled = controlledDecodes();
    const peasant = leftSidebarPortraitSources(CreatureVals.PEASANT);
    const champion = leftSidebarPortraitSources(CreatureVals.CHAMPION);
    const first = warmLeftSidebarPortrait(CreatureVals.PEASANT);
    const second = warmLeftSidebarPortrait(CreatureVals.CHAMPION);
    await controlled.settle(peasant.creature!);
    await controlled.settle(peasant.background!);
    expect(await first).toBe(true);
    expect(controlled.sources()).not.toContain(peasant.atlas!);
    await controlled.settle(champion.creature!);
    expect(await second).toBe(true);
    expect(controlled.sources()).not.toContain(peasant.atlas!);
});
