import { describe, expect, test } from "bun:test";

import { MAX_RENDER_PIXELS, renderResolutionForViewport, shouldUseRenderAntialias } from "./renderResolution";

describe("renderResolutionForViewport", () => {
    test("keeps ordinary Retina viewports sharp and caps device pixel ratio at two", () => {
        expect(renderResolutionForViewport(1512, 982, 2)).toBe(2);
        expect(renderResolutionForViewport(390, 844, 3)).toBe(2);
        expect(renderResolutionForViewport(640, 480, 1)).toBe(1);
    });

    test("limits large backing buffers to the 4K pixel budget", () => {
        const resolution = renderResolutionForViewport(2560, 1440, 2);
        expect(resolution).toBeCloseTo(1.5);
        expect(2560 * resolution * 1440 * resolution).toBeCloseTo(MAX_RENDER_PIXELS);
        expect(renderResolutionForViewport(3840, 2160, 2)).toBe(1);
    });

    test("handles invalid or zero dimensions without returning an unusable resolution", () => {
        expect(renderResolutionForViewport(0, 0, Number.NaN)).toBe(1);
        expect(renderResolutionForViewport(Number.NaN, Number.POSITIVE_INFINITY, 2)).toBe(2);
    });
});

describe("shouldUseRenderAntialias", () => {
    test("keeps MSAA where physical pixels are visible", () => {
        expect(shouldUseRenderAntialias(1)).toBe(true);
        expect(shouldUseRenderAntialias(1.49)).toBe(true);
        expect(shouldUseRenderAntialias(Number.NaN)).toBe(true);
    });

    test("avoids the redundant multisample buffer at Retina density", () => {
        expect(shouldUseRenderAntialias(1.5)).toBe(false);
        expect(shouldUseRenderAntialias(2)).toBe(false);
    });
});
