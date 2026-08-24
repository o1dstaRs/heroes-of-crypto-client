import { describe, expect, test } from "bun:test";

import { images } from "../imageAssets";
import { getSplitBundles, isIdleAtlasKey } from "./PixiTextureLoader";

// The board renders every creature's PERMANENT art from its idle/default atlas. If those keys ride
// in the big Tier-2b animation bundle, a fresh-cache load shows the old static tokens until hundreds
// of MB finish downloading — the "old squared images on initial load" bug. These tests pin the
// three-way split so the idle bundle stays small and first.
describe("pixi texture bundle split", () => {
    test("classifies the board idle/default atlases and nothing else", () => {
        expect(isIdleAtlasKey("wolf_idle_atlas_quarter")).toBe(true);
        expect(isIdleAtlasKey("behemoth_default_atlas_half")).toBe(true);
        // Named idle specials (Orc's twirl, Scavenger's flourish) are part of the permanent loop too.
        expect(isIdleAtlasKey("orc_idle_axe_twirl_atlas_quarter")).toBe(true);

        // Action states, full-size atlases and VFX stay in the big background bundle.
        expect(isIdleAtlasKey("wolf_walk_atlas_quarter")).toBe(false);
        expect(isIdleAtlasKey("wolf_idle_atlas")).toBe(false);
        expect(isIdleAtlasKey("active_turn_blue_fire_atlas")).toBe(false);
        // Non-atlas art never belongs here.
        expect(isIdleAtlasKey("wolf_512")).toBe(false);
    });

    test("splits every manifest key into exactly one of core / idle atlases / animations", () => {
        const { core, idleAtlases, animations } = getSplitBundles();
        const allKeys = Object.keys(images);
        const split = [...Object.keys(core), ...Object.keys(idleAtlases), ...Object.keys(animations)];

        expect(split.length).toBe(allKeys.length);
        expect(new Set(split).size).toBe(allKeys.length);

        for (const key of Object.keys(idleAtlases)) {
            expect(`${key}: ${isIdleAtlasKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(animations)) {
            expect(`${key}: ${key.includes("_atlas") && !isIdleAtlasKey(key)}`).toBe(`${key}: true`);
        }
        for (const key of Object.keys(core)) {
            expect(`${key}: ${key.includes("_atlas")}`).toBe(`${key}: false`);
        }
    });

    test("the idle bundle is present and stays a small fraction of the atlas payload", () => {
        const { idleAtlases, animations } = getSplitBundles();
        const idleCount = Object.keys(idleAtlases).length;
        const animationCount = Object.keys(animations).length;
        // Every enabled creature ships an idle or default atlas, so this can never be empty; and if
        // it ever grows to rival the background bundle, the "load the board art first" split has
        // silently stopped doing its job.
        expect(idleCount).toBeGreaterThan(0);
        expect(idleCount).toBeLessThan(animationCount);
    });
});
