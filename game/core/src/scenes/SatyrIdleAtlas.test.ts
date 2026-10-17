import { expect, test } from "bun:test";
import { animationAtlases } from "../generated/animation_atlases";
import { shouldPreloadUnitAnimationAtlas } from "../pixi/creatureAnimationSettings";
import {
    authoredIdleFrameForElapsed,
    creatureIdleAnimationEnabledForUnit,
    creatureOneShotAnimationEnabledForUnit,
} from "./RenderableUnit";

test("Satyr's authored staff-lift idle is available while generic animation is disabled", () => {
    const meta = animationAtlases.Satyr.idle;
    expect(meta.frameCount).toBe(8);
    expect(meta.frameDurationsMs).toEqual([850, 650, 650, 220, 800, 650, 250, 380]);
    expect(creatureIdleAnimationEnabledForUnit("Satyr")).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("satyr_idle_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("satyr_idle_atlas_quarter", false)).toBe(false);
});

test("Satyr sways, raises and grips his staff, then returns to idle", () => {
    const durations = animationAtlases.Satyr.idle.frameDurationsMs;
    expect(durations).toBeDefined();
    if (!durations) return;
    expect(authoredIdleFrameForElapsed(0, durations)).toBe(0);
    expect(authoredIdleFrameForElapsed(850, durations)).toBe(1);
    expect(authoredIdleFrameForElapsed(2370, durations)).toBe(4);
    expect(authoredIdleFrameForElapsed(3170, durations)).toBe(5);
    expect(authoredIdleFrameForElapsed(4449, durations)).toBe(7);
    expect(authoredIdleFrameForElapsed(4450, durations)).toBe(0);
});

test("Satyr hit and death use authored timing during the animation freeze", () => {
    expect(animationAtlases.Satyr.hit.frameDurationsMs).toEqual([80, 75, 80, 100, 95, 85, 80, 110]);
    expect(animationAtlases.Satyr.death.frameDurationsMs).toEqual([69, 69, 83, 97, 110, 138, 159, 248]);
    expect(animationAtlases.Satyr.death.totalDurationSec).toBe(0.973);
    for (const state of ["hit", "death"] as const) {
        const key = `satyr_${state}_atlas`;
        expect(animationAtlases.Satyr[state].frameCount).toBe(8);
        expect(creatureOneShotAnimationEnabledForUnit("Satyr", state)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`${key}_quarter`, false)).toBe(false);
    }
    expect(creatureOneShotAnimationEnabledForUnit("Satyr", "attack")).toBe(false);
});

test("Satyr has three authored grounded melee directions", () => {
    for (const state of ["melee_attack_up", "melee_attack", "melee_attack_down"] as const) {
        const meta = animationAtlases.Satyr[state];
        const key = `satyr_${state}_atlas`;
        expect(meta.frameCount).toBe(8);
        expect(meta.frameWidth).toBe(1408);
        expect(meta.frameHeight).toBe(768);
        expect(meta.footAnchorY).toBe(742 / 768);
        expect(meta.frameDurationsMs).toEqual([90, 85, 100, 90, 110, 85, 90, 100]);
        expect(creatureOneShotAnimationEnabledForUnit("Satyr", state)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`${key}_quarter`, false)).toBe(false);
    }
});

test("Satyr casts with a padded canvas, fixed feet and a brief staff glow", () => {
    const meta = animationAtlases.Satyr.cast;
    expect(meta.frameCount).toBe(8);
    expect(meta.frameWidth).toBe(1200);
    expect(meta.frameHeight).toBe(1200);
    expect(meta.footAnchorY).toBe(1174 / 1200);
    expect(meta.frameDurationsMs).toEqual([120, 120, 120, 120, 140, 120, 120, 140]);
    expect(creatureOneShotAnimationEnabledForUnit("Satyr", "cast")).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("satyr_cast_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("satyr_cast_atlas_quarter", false)).toBe(false);
});
