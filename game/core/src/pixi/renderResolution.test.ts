import { describe, expect, test } from "bun:test";

import {
    MAX_MSAA_RENDER_PIXELS,
    MAX_RENDER_PIXELS,
    MIN_RENDER_RESOLUTION,
    renderResolutionForViewport,
    renderTexturePoolBucket,
    shouldUseRenderAntialias,
} from "./renderResolution";

describe("renderResolutionForViewport", () => {
    test("keeps small Retina viewports sharp and caps device pixel ratio at two", () => {
        expect(renderResolutionForViewport(390, 844, 3)).toBe(2);
        expect(renderResolutionForViewport(640, 480, 1)).toBe(1);
    });

    test("limits large backing buffers to the 1440p pixel budget", () => {
        const laptopResolution = renderResolutionForViewport(1512, 982, 2);
        expect(laptopResolution).toBeGreaterThan(1.5);
        expect(1512 * laptopResolution * 982 * laptopResolution).toBeCloseTo(MAX_RENDER_PIXELS);
        expect(renderResolutionForViewport(2560, 1440, 2)).toBe(1);
        const fourKResolution = renderResolutionForViewport(3840, 2160, 2);
        expect(fourKResolution).toBeCloseTo(2 / 3);
        expect(3840 * fourKResolution * 2160 * fourKResolution).toBeCloseTo(MAX_RENDER_PIXELS);
    });

    test("keeps a half-resolution floor for unusually large displays", () => {
        expect(renderResolutionForViewport(7680, 4320, 2)).toBe(MIN_RENDER_RESOLUTION);
    });

    test("handles invalid or zero dimensions without returning an unusable resolution", () => {
        expect(renderResolutionForViewport(0, 0, Number.NaN)).toBe(1);
        expect(renderResolutionForViewport(Number.NaN, Number.POSITIVE_INFINITY, 2)).toBe(2);
    });
});

describe("shouldUseRenderAntialias", () => {
    test("keeps MSAA only where physical pixels are visible and its buffer is inexpensive", () => {
        expect(shouldUseRenderAntialias(1, 1280, 720)).toBe(true);
        expect(shouldUseRenderAntialias(1, 1920, 1080)).toBe(false);
        expect(shouldUseRenderAntialias(1, MAX_MSAA_RENDER_PIXELS, 1)).toBe(false);
        expect(shouldUseRenderAntialias(1.49, 1512, 982)).toBe(false);
        expect(shouldUseRenderAntialias(Number.NaN)).toBe(true);
    });

    test("avoids the redundant multisample buffer at Retina density", () => {
        expect(shouldUseRenderAntialias(1.5, 640, 480)).toBe(false);
        expect(shouldUseRenderAntialias(2, 390, 844)).toBe(false);
    });
});

describe("renderTexturePoolBucket", () => {
    test("groups nearby resizes that reuse the same physical filter textures", () => {
        expect(renderTexturePoolBucket(900, 700, 1)).toEqual([1024, 1024]);
        expect(renderTexturePoolBucket(1000, 720, 1)).toEqual([1024, 1024]);
    });

    test("changes only when a physical power-of-two boundary is crossed", () => {
        expect(renderTexturePoolBucket(1024, 720, 1)).toEqual([1024, 1024]);
        expect(renderTexturePoolBucket(1025, 720, 1)).toEqual([2048, 1024]);
        expect(renderTexturePoolBucket(640, 480, 2)).toEqual([2048, 1024]);
    });

    test("normalizes invalid dimensions and resolution", () => {
        expect(renderTexturePoolBucket(0, Number.NaN, Number.POSITIVE_INFINITY)).toEqual([1, 1]);
    });
});
