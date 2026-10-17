import { beforeAll, expect, spyOn, test } from "bun:test";
import { Filter, Sprite } from "pixi.js";
import {
    MANTIS_EYE_PULSE_MS,
    MantisEyeGlowFilter,
    mantisEyeIntensity,
    syncMantisLabEyeGlow,
} from "./MantisLabIdleVisuals";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            createElement: () => ({ getContext: () => null }),
        };
});

test("Mantis eye light pulses smoothly without a discontinuity at its loop boundary", () => {
    expect(mantisEyeIntensity(0)).toBeCloseTo(0.3);
    expect(mantisEyeIntensity(MANTIS_EYE_PULSE_MS / 2)).toBeCloseTo(1);
    expect(mantisEyeIntensity(MANTIS_EYE_PULSE_MS)).toBeCloseTo(0.3);
    expect(mantisEyeIntensity(MANTIS_EYE_PULSE_MS - 0.01)).toBeCloseTo(mantisEyeIntensity(0.01), 10);
    expect(mantisEyeIntensity(Number.NaN)).toBeCloseTo(0.3);
});

test("Mantis eye effect stays singular, preserves other filters and releases its resources", () => {
    const sprite = new Sprite();
    const other = new Filter({});
    sprite.filters = [other];
    sprite.anchor.set(0.5, 730 / 768);
    sprite.scale.set(-0.25, -0.25);
    syncMantisLabEyeGlow(sprite, true, 0);
    const eye = sprite.filters!.find((filter) => filter instanceof MantisEyeGlowFilter)!;
    syncMantisLabEyeGlow(sprite, true, MANTIS_EYE_PULSE_MS / 2);
    expect(sprite.filters).toEqual([other, eye]);
    expect(sprite.anchor.y).toBeCloseTo(730 / 768);
    expect(sprite.scale.x).toBe(-0.25);
    expect(sprite.children).toHaveLength(0);
    syncMantisLabEyeGlow(sprite, false, 0);
    expect(sprite.filters).toEqual([other]);
    syncMantisLabEyeGlow(sprite, true, 0);
    expect(sprite.filters).toEqual([other, eye]);
    const cleanup = spyOn(eye, "destroy");
    sprite.destroy();
    expect(cleanup).toHaveBeenCalledTimes(1);
    cleanup.mockRestore();
    other.destroy();
});
