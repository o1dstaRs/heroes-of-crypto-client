import { afterAll, beforeAll, expect, test } from "bun:test";
import { ColorMatrixFilter, DOMAdapter, Sprite, Texture } from "pixi.js";

import {
    SCAVENGER_HIT_COLOR_GAINS,
    SCAVENGER_IDLE_COLOR_GAINS,
    syncScavengerHitColorFilter,
    syncScavengerIdleColorFilter,
} from "./ScavengerIdleColorFilter";

const originalAdapter = DOMAdapter.get();
beforeAll(() => {
    DOMAdapter.set({
        ...originalAdapter,
        createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
    });
});
afterAll(() => DOMAdapter.set(originalAdapter));

test("matches idle to the approved hit palette without changing geometry or alpha", () => {
    const sprite = new Sprite(Texture.WHITE);
    sprite.scale.set(-2, 2);
    sprite.anchor.set(0.5, 0.9);
    syncScavengerIdleColorFilter(sprite, true);
    const grade = sprite.filters![0] as ColorMatrixFilter;
    const idleMean = [45.716998, 29.56117, 24.507928];
    const hitMean = [38.494694, 25.954694, 19.008719];
    SCAVENGER_IDLE_COLOR_GAINS.forEach((gain, channel) => {
        expect(idleMean[channel] * gain).toBeCloseTo(hitMean[channel], 3);
    });
    expect(grade.matrix[18]).toBe(1);
    expect(grade.matrix[19]).toBe(0);
    expect(sprite.texture).toBe(Texture.WHITE);
    expect(sprite.scale.x).toBe(-2);
    expect(sprite.scale.y).toBe(2);
    expect(sprite.anchor.y).toBe(0.9);
});

test("reuses the idle grade and removes it for actions while retaining other effects", () => {
    const sprite = new Sprite(Texture.WHITE);
    const effect = new ColorMatrixFilter();
    sprite.filters = [effect];
    syncScavengerIdleColorFilter(sprite, true);
    const grade = sprite.filters![0];
    syncScavengerIdleColorFilter(sprite, true);
    expect(sprite.filters).toEqual([grade, effect]);
    syncScavengerIdleColorFilter(sprite, false);
    expect(sprite.filters).toEqual([effect]);
    syncScavengerIdleColorFilter(sprite, true);
    expect(sprite.filters).toEqual([grade, effect]);
});

test("caps hit highlights at idle brightness and swaps grades without accumulating filters", () => {
    const idleHighlights = [108.620709, 82.532, 63.60043];
    const hitHighlights = [
        [112, 91, 73],
        [111, 89, 71],
        [113, 91, 72],
        [111, 89, 71],
        [111, 91, 73],
        [114, 92, 74],
        [112, 91, 73],
        [111, 90, 72],
    ];
    const sprite = new Sprite(Texture.WHITE);
    sprite.scale.set(-2, 2);
    const footCorrection = new ColorMatrixFilter();
    sprite.filters = [footCorrection];
    for (let frame = 0; frame < 8; frame++) {
        syncScavengerHitColorFilter(sprite, frame);
        expect(sprite.filters).toHaveLength(2);
        expect(sprite.filters).toContain(footCorrection);
        const grade = sprite.filters![0] as ColorMatrixFilter;
        SCAVENGER_HIT_COLOR_GAINS[frame].forEach((gain, channel) => {
            expect(hitHighlights[frame][channel] * gain).toBeLessThanOrEqual(idleHighlights[channel] + 0.001);
            expect(gain).toBeLessThanOrEqual(1);
        });
        expect(grade.matrix[18]).toBe(1);
        expect(grade.matrix[19]).toBe(0);
        expect(sprite.scale.x).toBe(-2);
        expect(sprite.scale.y).toBe(2);
    }
    syncScavengerHitColorFilter(sprite, -1);
    expect(sprite.filters).toEqual([footCorrection]);
});
