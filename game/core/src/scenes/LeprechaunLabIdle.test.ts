import { expect, test } from "bun:test";
import { LEPRECHAUN_IDLE_CYCLE_MS, LEPRECHAUN_IDLE_DURATIONS, leprechaunIdleMotion } from "./LeprechaunLabIdle";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import { shouldPreloadUnitAnimationAtlas } from "../pixi/creatureAnimationSettings";

test("Leprechaun idle pauses before greeting, raises the hat, and closes without a sway jump", () => {
    expect(leprechaunIdleMotion(0)).toEqual({ frame: 0, sway: 0, breathe: 0 });
    expect(leprechaunIdleMotion(3500 / 1.12).frame).toBe(0);
    const raisedAt = LEPRECHAUN_IDLE_DURATIONS.slice(0, 9).reduce((sum, n) => sum + n, 0);
    expect(leprechaunIdleMotion(raisedAt + 10).frame).toBe(3);
    expect(leprechaunIdleMotion(LEPRECHAUN_IDLE_CYCLE_MS).frame).toBe(0);
    expect(leprechaunIdleMotion(LEPRECHAUN_IDLE_CYCLE_MS).sway).toBe(0);
    const end = leprechaunIdleMotion(LEPRECHAUN_IDLE_CYCLE_MS - 0.001);
    expect(end.sway).toBeCloseTo(0, 6);
    expect(end.breathe).toBeCloseTo(leprechaunIdleMotion(LEPRECHAUN_IDLE_CYCLE_MS).breathe, 4);
    expect(LEPRECHAUN_IDLE_DURATIONS[0]).toBeCloseTo(3600 / 1.12, 6);
    expect(LEPRECHAUN_IDLE_CYCLE_MS - 3600 / 1.12).toBeCloseTo(2600 / 1.07 / 1.12, 6);
    expect(leprechaunIdleMotion(3100 / 1.2 / 1.12).breathe).toBeCloseTo(0, 6);
    expect(leprechaunIdleMotion(1550 / 1.2 / 1.12).breathe).toBeCloseTo(6.72, 6);
    expect(leprechaunIdleMotion(Number.NaN)).toEqual(leprechaunIdleMotion(0));
});

test("Leprechaun idle keeps native hat detail available during the animation freeze", () => {
    expect(shouldPreloadUnitAnimationAtlas("leprechaun_lab_idle_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("leprechaun_lab_idle_atlas_quarter", false)).toBe(false);
    expect(isRedundantFullResolutionUnitAtlasKey("leprechaun_lab_idle_atlas")).toBe(false);
});
