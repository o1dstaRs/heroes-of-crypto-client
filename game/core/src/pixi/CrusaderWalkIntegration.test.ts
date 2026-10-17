import { crusaderReactionFilterEnabled } from "../scenes/CrusaderLabReaction";
import { CRUSADER_HIT_BLADES, crusaderFirePose } from "../scenes/CrusaderLabIdle";
import { expect, test } from "bun:test";

import { animationAtlases } from "../generated/animation_atlases";
import { creatureWalkAnimationEnabledForUnit } from "../scenes/RenderableUnit";
import { shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "./imageAssetTiers";
import { getSplitBundles } from "./PixiTextureLoader";

test("Crusader lab walk loads all eight corrected full-resolution poses", () => {
    expect(creatureWalkAnimationEnabledForUnit("Crusader", true)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Crusader", false)).toBe(true);
    expect(animationAtlases.Crusader.walk.frameCount).toBe(8);
    expect(animationAtlases.Crusader.walk.frameWidth).toBe(768);
    expect(animationAtlases.Crusader.walk.layout).toEqual({ cols: 5, rows: 2 });
    expect(shouldPreloadUnitAnimationAtlas("crusader_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("crusader_walk_atlas")).toBe(false);
    expect(getSplitBundles({ animationsEnabled: false }).animations.crusader_walk_atlas).toBeDefined();
});

test("Crusader lab reactions preload complete padded atlases with authored timing", () => {
    for (const state of ["hit", "death"] as const) {
        const meta = animationAtlases.Crusader[state];
        expect(meta.frameCount).toBe(6);
        expect(meta.frameWidth).toBe(896);
        expect(meta.frameHeight).toBe(896);
        expect(meta.frameDurationsMs?.length).toBe(meta.frameCount);
        expect(meta.frameDurationsMs?.every((duration) => duration > 0)).toBe(true);
        expect(meta.footAnchorY).toBeCloseTo(850 / 896);
        const key = `crusader_${state}_atlas`;
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(getSplitBundles({ animationsEnabled: false }).animations[key]).toBeDefined();
    }
});

test("Crusader reactions use the requested speed increases", () => {
    const hit = animationAtlases.Crusader.hit.frameDurationsMs!;
    const death = animationAtlases.Crusader.death.frameDurationsMs!;
    expect(hit.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(820 / 1.1 / 1.07);
    expect(death.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(1620 / 1.25 / 1.2 / 0.94 / 0.95);
});

test("Crusader hit is sprite-only and never enables the reaction deformation filter", () => {
    for (let frame = 0; frame < animationAtlases.Crusader.hit.frameCount; frame++) {
        expect(crusaderReactionFilterEnabled("hit", frame)).toBe(false);
    }
    expect(crusaderReactionFilterEnabled("death", 3)).toBe(true);
    expect(crusaderReactionFilterEnabled("idle", 0)).toBe(false);
});

test("Crusader hit tracks the flame on every authored blade without idle deformation", () => {
    expect(animationAtlases.Crusader.hit.frameCount).toBe(CRUSADER_HIT_BLADES.length);
    for (let i = 0; i < CRUSADER_HIT_BLADES.length; i++) {
        const pose = crusaderFirePose(-1, i);
        expect(pose.canvasSize).toBe(896);
        expect(pose.idleDeformation).toBe(0);
        expect(pose.blade[2]).toBeGreaterThan(pose.blade[0]);
    }
    expect(crusaderFirePose().idleDeformation).toBe(1);
    expect(crusaderFirePose(0).canvasSize).toBe(768);
});

test("Crusader three attacks load authored full-body sprites and registered fire and visor", () => {
    for (const state of ["melee_attack_up", "melee_attack", "melee_attack_down"] as const) {
        const meta = animationAtlases.Crusader[state];
        expect(meta.frameCount).toBe(6);
        expect(meta.frameWidth).toBe(1280);
        expect(meta.footAnchorY).toBeCloseTo(1114 / 1280);
        expect(meta.frameDurationsMs?.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(700);
        const key = `crusader_${state}_atlas`;
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(getSplitBundles({ animationsEnabled: false }).animations[key]).toBeDefined();
        for (let frame = 0; frame < meta.frameCount; frame++) {
            const pose = crusaderFirePose(-1, -1, state, frame);
            expect(pose.canvasSize).toBe(1280);
            expect(pose.idleDeformation).toBe(0);
            expect(pose.eyesEnabled).toBe(1);
            expect(pose.attack).toBe(1);
            expect([...pose.blade, ...pose.eye].every(Number.isFinite)).toBe(true);
            expect(Math.hypot(pose.blade[2] - pose.blade[0], pose.blade[3] - pose.blade[1])).toBeGreaterThan(100);
        }
    }
});

test("Crusader side attack swings the blade through a broad arc and returns to the idle registration", () => {
    const windup = crusaderFirePose(-1, -1, "melee_attack", 2).blade;
    const impact = crusaderFirePose(-1, -1, "melee_attack", 6).blade;
    const a = [windup[2] - windup[0], windup[3] - windup[1]];
    const b = [impact[2] - impact[0], impact[3] - impact[1]];
    const cosine = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b));
    expect(cosine).toBeLessThan(-0.7);
    const idle = crusaderFirePose();
    for (const state of ["melee_attack_up", "melee_attack", "melee_attack_down"] as const) {
        for (const frame of [0, animationAtlases.Crusader[state].frameCount - 1]) {
            const pose = crusaderFirePose(-1, -1, state, frame);
            expect(pose.blade.map((value, i) => value - (i % 2 ? 384 : 256))).toEqual([...idle.blade]);
            expect(pose.eye.map((value, i) => value - (i % 2 ? 384 : 256))).toEqual([...idle.eye]);
        }
    }
});
