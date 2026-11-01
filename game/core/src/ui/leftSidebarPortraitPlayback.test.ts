import { expect, test } from "bun:test";

import {
    createForwardPortraitClock,
    createPortraitIdleClock,
    isRefinedPortrait,
    sidebarPortraitSourceFile,
    REFINED_HIGHER_LEVEL_PORTRAIT_FRAMES,
    REFINED_PORTRAIT_FRAMES,
    isRefinedLevelOnePortrait,
    REFINED_LEVEL_ONE_PORTRAIT_FRAMES,
} from "./leftSidebarPortraitPlayback";

test("Peasant starts at zero after decoding and keeps all 34 forward frames at its authored speed", () => {
    const frame = createForwardPortraitClock(34, 9.936);
    const origin = 999999;
    expect(frame(origin)).toBe(0);
    expect(Array.from({ length: 35 }, (_, i) => frame(origin + ((i + 0.1) * 1000) / 9.936))).toEqual([
        ...Array.from({ length: 34 }, (_, i) => i),
        0,
    ]);
});

test("a late decoded portrait starts at frame zero and has no repeated endpoint", () => {
    const frame = createPortraitIdleClock(4, 10);
    expect(Array.from({ length: 13 }, (_, i) => frame(987654 + i * 100))).toEqual([
        0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0,
    ]);
    expect(createPortraitIdleClock(4, 10)(999999)).toBe(0);
});

test("all twelve reviewed portraits stay in range over repeated cycles", () => {
    expect(Object.keys(REFINED_LEVEL_ONE_PORTRAIT_FRAMES)).toHaveLength(12);
    for (const [slug, count] of Object.entries(REFINED_LEVEL_ONE_PORTRAIT_FRAMES)) {
        expect(isRefinedLevelOnePortrait(`/images/${slug}_left_screen_idle_atlas.webp?v=2`)).toBe(true);
        const frame = createPortraitIdleClock(count, 10);
        for (let i = 0; i < count * 6; i++) {
            const current = frame(200000 + i * 100);
            expect(current).toBeGreaterThanOrEqual(0);
            expect(current).toBeLessThan(count);
        }
    }
    for (const slug of ["peasant", "squire", "blacksmith", "arbalester", "angel"]) {
        expect(isRefinedLevelOnePortrait(`/images/${slug}_left_screen_idle_atlas.webp`)).toBe(false);
    }
});

test("single-frame and backwards clock samples remain safe", () => {
    const frame = createPortraitIdleClock(1, 10);
    expect(frame(1000)).toBe(0);
    expect(frame(500)).toBe(0);
    expect(frame(2000)).toBe(0);
});

test("full portraits retain all 100 source frames and the original 20.084 second cycle", () => {
    const cycleMs = 20084;
    for (const count of Object.values(REFINED_PORTRAIT_FRAMES)) {
        expect(count).toBe(100);
        const frame = createPortraitIdleClock(count, 2400 / 241, cycleMs);
        const origin = 765432;
        expect(frame(origin)).toBe(0);
        const visited = Array.from({ length: 198 }, (_, step) => frame(origin + ((step + 0.5) * cycleMs) / 198));
        expect(visited).toEqual([
            ...Array.from({ length: 100 }, (_, i) => i),
            ...Array.from({ length: 98 }, (_, i) => 98 - i),
        ]);
        expect(new Set(visited).size).toBe(100);
        expect(frame(origin + cycleMs - 0.01)).toBe(1);
        expect(frame(origin + cycleMs)).toBe(0);
    }
});

test("all 39 higher-level portraits use the full clock while Life level one stays unchanged", () => {
    expect(Object.keys(REFINED_HIGHER_LEVEL_PORTRAIT_FRAMES)).toHaveLength(39);
    expect(Object.keys(REFINED_PORTRAIT_FRAMES)).toHaveLength(51);
    for (const slug of Object.keys(REFINED_HIGHER_LEVEL_PORTRAIT_FRAMES)) {
        expect(isRefinedPortrait(`/images/${slug}_left_screen_idle_atlas.webp?v=3`)).toBe(true);
        expect(isRefinedLevelOnePortrait(`/images/${slug}_left_screen_idle_atlas.webp`)).toBe(false);
    }
    for (const slug of ["peasant", "squire", "blacksmith", "arbalester"]) {
        expect(isRefinedPortrait(`/images/${slug}_left_screen_idle_atlas.webp`)).toBe(false);
    }
});

test("deployed content hashes preserve the approved portrait playback selection", () => {
    for (const slug of Object.keys(REFINED_PORTRAIT_FRAMES)) {
        const deployed = `/assets/${slug}_left_screen_idle_atlas-Dhpkex1K.webp?v=3#portrait`;
        expect(isRefinedPortrait(deployed)).toBe(true);
        expect(isRefinedLevelOnePortrait(deployed)).toBe(slug in REFINED_LEVEL_ONE_PORTRAIT_FRAMES);
        expect(sidebarPortraitSourceFile(deployed)).toBe(`${slug}_left_screen_idle_atlas.webp`);
    }
    for (const slug of ["peasant", "hydra"]) {
        expect(sidebarPortraitSourceFile(`/assets/${slug}_left_screen_idle_atlas-aB_12-xy.webp`)).toBe(
            `${slug}_left_screen_idle_atlas.webp`,
        );
    }
    expect(isRefinedPortrait("/assets/unknown_left_screen_idle_atlas-Dhpkex1K.webp")).toBe(false);
    expect(sidebarPortraitSourceFile("/images/custom-portrait.webp")).toBe("custom-portrait.webp");
});
