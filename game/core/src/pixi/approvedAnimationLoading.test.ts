import { expect, test } from "bun:test";
import { Assets } from "pixi.js";
import {
    animationAtlasPrewarmKeys,
    approvedAnimationAssetKeysForUnit,
    CREATURE_SPRITE_ANIMATION_SETTINGS,
} from "./creatureAnimationSettings";
import { preloadIdleAtlasAssets, preloadAnimationAssets } from "./PixiTextureLoader";
import assets from "../animations/levelOneAssets.json";

test("approved loading is limited to the visible creature, including its authored aliases", () => {
    const wolves = approvedAnimationAssetKeysForUnit("Wolf");
    expect(wolves).toContain("wolf_walk_atlas_half");
    expect(wolves.some((key) => key.startsWith("wolf_rider_"))).toBe(false);
    expect(approvedAnimationAssetKeysForUnit("Scavenger")).toContain("thief_walk_atlas_quarter");
    expect(approvedAnimationAssetKeysForUnit("Wandering Mage")).toContain("ash_moth_cast_atlas_quarter");
    expect(approvedAnimationAssetKeysForUnit("Black Dragon")).toEqual([]);
    expect(approvedAnimationAssetKeysForUnit("Arbalester").some((key) => key.includes("idle_page"))).toBe(false);
    const manifest = new Set(assets.map((asset) => asset.key));
    for (const name of [
        "Peasant",
        "Squire",
        "Arbalester",
        "Blacksmith",
        "Wolf",
        "Fairy",
        "Dryad",
        "Leprechaun",
        "Orc",
        "Scavenger",
        "Troglodyte",
        "Wandering Mage",
        "Centaur",
        "Berserker",
        "Wolf Rider",
        "Mermaid",
    ]) {
        const keys = approvedAnimationAssetKeysForUnit(name);
        expect(
            keys.some((key) => key.includes("_walk_")),
            name,
        ).toBe(true);
        expect(
            keys.every((key) => manifest.has(key)),
            name,
        ).toBe(true);
    }
});

test("combat sheets are prewarmed before walk and idle, and idle pager pages stay out", () => {
    const keys = animationAtlasPrewarmKeys("Elf", "elf_lab_idle_atlas");
    const attack = keys.findIndex((key) => key.includes("_attack"));
    const walk = keys.findIndex((key) => key.includes("_walk_"));
    const idle = keys.findIndex((key) => key.includes("_idle_"));
    expect(attack).toBeGreaterThanOrEqual(0);
    expect(attack).toBeLessThan(walk);
    expect(walk).toBeLessThan(idle);
    expect(keys.filter((key) => key.includes("_idle_"))).toEqual(["elf_lab_idle_atlas"]);
    expect(keys.some((key) => /arbalester_idle_page_\d{2}_atlas/.test(key))).toBe(false);
    expect(animationAtlasPrewarmKeys("Black Dragon")).toEqual([]);
});

test("production startup leaves approved animations on demand instead of flooding the network", async () => {
    const original = Assets.loadBundle;
    const previous = { ...CREATURE_SPRITE_ANIMATION_SETTINGS };
    let loads = 0;
    Assets.loadBundle = (async () => {
        loads++;
        return {};
    }) as typeof Assets.loadBundle;
    try {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
        await preloadIdleAtlasAssets();
        await preloadAnimationAssets();
        expect(loads).toBe(0);
    } finally {
        Assets.loadBundle = original;
        Object.assign(CREATURE_SPRITE_ANIMATION_SETTINGS, previous);
    }
});
