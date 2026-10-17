import { expect, test } from "bun:test";
import { animationAtlases } from "../generated/animation_atlases";
import { shouldPreloadUnitAnimationAtlas } from "../pixi/creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import { abominationIdlePages } from "./AbominationIdlePages";

test("Abomination's complete smooth idle stays native and pages are loaded on demand", () => {
    const meta = animationAtlases["Abomination Lab"].idle;
    const format = abominationIdlePages(meta)!;
    expect(format.frameCount).toBe(96);
    expect(format.durations.reduce((sum, duration) => sum + duration, 0)).toBeCloseTo(3200, 8);
    expect(meta.fps).toBe(30);
    expect(meta.footAnchorY).toBe(730 / 768);
    expect(format.pages).toHaveLength(4);
    for (const page of format.pages) {
        expect(page.width).toBeLessThanOrEqual(4096);
        expect(page.height).toBeLessThanOrEqual(4096);
        expect(shouldPreloadUnitAnimationAtlas(page.imageKey, false)).toBe(false);
        expect(shouldPreloadUnitAnimationAtlas(page.imageKey, true)).toBe(false);
        expect(isRedundantFullResolutionUnitAtlasKey(page.imageKey)).toBe(false);
    }
    expect(abominationIdlePages({ ...meta, frameWidth: 192 })).toBeUndefined();
    expect(abominationIdlePages({ ...meta, pages: meta.pages!.slice(1) })).toBeUndefined();
    expect(abominationIdlePages({ ...meta, frameDurationsMs: [40] })).toBeUndefined();
    expect(
        abominationIdlePages({ ...meta, pages: [{ ...meta.pages![0], width: 7680 }, ...meta.pages!.slice(1)] }),
    ).toBeUndefined();
});
