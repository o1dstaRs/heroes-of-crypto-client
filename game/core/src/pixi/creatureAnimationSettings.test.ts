import { expect, test } from "bun:test";

import { CREATURE_SPRITE_ANIMATION_SETTINGS, shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "./imageAssetTiers";

test("preloads Battle Mage lab melee attacks and cast at full quality before first playback", () => {
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down", "cast"]) {
        const key = `battle_mage_lab_${state}_atlas`;
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`${key}_quarter`, false)).toBe(false);
    }
});

test("preloads White Tiger reactions at idle resolution before their first combat playback", () => {
    for (const state of ["idle", "walk", "hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"]) {
        const key = `white_tiger_lab_${state}_atlas`;
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`${key}_quarter`, false)).toBe(false);
    }
});

test("preloads the native Elf lab idle, walk and reactions without enabling legacy Elf motion", () => {
    expect(isRedundantFullResolutionUnitAtlasKey("elf_lab_idle_atlas")).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("elf_lab_idle_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("elf_lab_idle_atlas_quarter", false)).toBe(false);
    expect(isRedundantFullResolutionUnitAtlasKey("elf_lab_walk_atlas")).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("elf_lab_walk_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("elf_lab_walk_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("elf_walk_atlas_quarter", false)).toBe(false);
    for (const state of [
        "hit",
        "death",
        "melee_attack",
        "melee_attack_up",
        "melee_attack_down",
        "attack",
        "attack_up",
        "attack_down",
    ]) {
        const key = `elf_lab_${state}_atlas`;
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`${key}_quarter`, false)).toBe(false);
    }
});

test("loads the native Leprechaun lab walk during the animation freeze", () => {
    expect(isRedundantFullResolutionUnitAtlasKey("leprechaun_lab_walk_atlas")).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("leprechaun_lab_walk_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("leprechaun_lab_walk_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("leprechaun_walk_atlas_quarter", false)).toBe(false);
});

test("preloads Centaur lab reactions before their first use during the animation freeze", () => {
    for (const state of [
        "hit",
        "death",
        "melee_attack",
        "melee_attack_up",
        "melee_attack_down",
        "attack",
        "attack_up",
        "attack_down",
    ]) {
        const key = `centaur_lab_${state}_atlas`;
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`${key}_quarter`, false)).toBe(false);
    }
});

test("preloads the full-resolution Healer lab walk without enabling legacy Healer actions", () => {
    for (const action of ["hit", "death", "attack", "attack_up", "attack_down", "cast"]) {
        const key = `healer_lab_${action}_atlas`;
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`${key}_quarter`, false)).toBe(false);
    }
    expect(isRedundantFullResolutionUnitAtlasKey("healer_lab_idle_atlas")).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("healer_lab_idle_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("healer_lab_idle_atlas_quarter", false)).toBe(false);
    expect(isRedundantFullResolutionUnitAtlasKey("healer_lab_walk_atlas")).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("healer_lab_walk_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("healer_lab_walk_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("healer_attack_atlas", false)).toBe(false);
});

test("preloads the full-resolution Berserker lab walk", () => {
    expect(shouldPreloadUnitAnimationAtlas("berserker_sword_idle_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("berserker_walk_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("berserker_hit_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("berserker_death_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("berserker_walk_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("berserker_attack_atlas", false)).toBe(false);
});

test("preloads the native Troll lab walk without its legacy motion", () => {
    expect(shouldPreloadUnitAnimationAtlas("troll_lab_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("troll_lab_walk_atlas")).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("troll_lab_walk_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("troll_walk_atlas_quarter", false)).toBe(false);
});

test("keeps the Troll lab idle at native resolution during the animation freeze", () => {
    expect(shouldPreloadUnitAnimationAtlas("troll_lab_idle_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("troll_lab_idle_atlas")).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("troll_lab_idle_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("troll_idle_atlas_quarter", false)).toBe(false);
});

test("preloads Wolf attacks, damage and death at the same resolution as its idle", () => {
    for (const state of ["idle", "walk", "hit", "death", "attack", "attack_up", "attack_down"]) {
        expect(shouldPreloadUnitAnimationAtlas(`wolf_${state}_atlas_half`, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`wolf_${state}_atlas_quarter`, false)).toBe(false);
        expect(shouldPreloadUnitAnimationAtlas(`wolf_${state}_atlas`, false)).toBe(false);
    }
    expect(shouldPreloadUnitAnimationAtlas("wolf_attack_atlas_quarter", false)).toBe(false);
});

test("preloads native Arbalester actions and leaves native idle pages to their bounded player", () => {
    for (const state of [
        "walk",
        "hit",
        "death",
        "attack",
        "attack_up",
        "attack_down",
        "melee_attack",
        "melee_attack_up",
        "melee_attack_down",
    ]) {
        expect(isRedundantFullResolutionUnitAtlasKey(`arbalester_${state}_atlas`)).toBe(false);
        expect(shouldPreloadUnitAnimationAtlas(`arbalester_${state}_atlas_quarter`, false)).toBe(false);
        expect(shouldPreloadUnitAnimationAtlas(`arbalester_${state}_atlas`, false)).toBe(true);
    }
    expect(shouldPreloadUnitAnimationAtlas("arbalester_idle_atlas_quarter", false)).toBe(false);
    for (const enabled of [true, false]) {
        expect(shouldPreloadUnitAnimationAtlas("arbalester_idle_page_00_atlas", enabled)).toBe(false);
        expect(shouldPreloadUnitAnimationAtlas("arbalester_idle_page_21_atlas", enabled)).toBe(false);
    }
    expect(shouldPreloadUnitAnimationAtlas("arbalester_attack_atlas_quarter", false)).toBe(false);
    expect(CREATURE_SPRITE_ANIMATION_SETTINGS.enabled).toBe(false);
});

test("preloads Wandering Mage idle, walk and reactions before their first use during the global freeze", () => {
    expect(shouldPreloadUnitAnimationAtlas("ash_moth_idle_atlas_quarter", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("ash_moth_walk_atlas_quarter", false)).toBe(true);
    for (const state of ["hit", "death", "cast", "melee_attack", "melee_attack_up", "melee_attack_down"]) {
        expect(shouldPreloadUnitAnimationAtlas(`ash_moth_${state}_atlas_quarter`, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`ash_moth_${state}_atlas`, false)).toBe(false);
    }
    expect(shouldPreloadUnitAnimationAtlas("ash_moth_idle_atlas", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("ash_moth_attack_atlas_quarter", false)).toBe(false);
});

test("preloads every approved Peasant combat atlas while other animations are frozen", () => {
    for (const state of ["attack", "attack_up", "attack_down", "hit", "death"]) {
        expect(shouldPreloadUnitAnimationAtlas(`peasant_${state}_atlas_quarter`, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`peasant_${state}_atlas`, false)).toBe(false);
    }
});

test("preloads the full-resolution Blacksmith motion and reactions", () => {
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down", "cast"]) {
        expect(shouldPreloadUnitAnimationAtlas(`blacksmith_${state}_atlas`, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`blacksmith_${state}_atlas_quarter`, false)).toBe(false);
    }
    expect(shouldPreloadUnitAnimationAtlas("blacksmith_walk_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("blacksmith_idle_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("blacksmith_hit_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("blacksmith_death_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("blacksmith_hit_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("blacksmith_death_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("blacksmith_melee_attack_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("blacksmith_walk_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("blacksmith_idle_atlas_quarter", false)).toBe(false);
});

test("preloads the approved Scavenger walk without enabling its other frozen animations", () => {
    expect(shouldPreloadUnitAnimationAtlas("thief_walk_atlas_quarter", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("thief_idle_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("thief_attack_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("orc_walk_atlas_quarter", false)).toBe(false);
    expect(CREATURE_SPRITE_ANIMATION_SETTINGS.enabled).toBe(false);
});

test("preloads the detailed Orc walk during the freeze without enabling old action sheets", () => {
    expect(shouldPreloadUnitAnimationAtlas("orc_idle_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("orc_idle_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("orc_idle_axe_twirl_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("orc_walk_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("orc_walk_atlas_quarter", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("orc_attack_atlas_quarter", false)).toBe(false);
    expect(CREATURE_SPRITE_ANIMATION_SETTINGS.enabled).toBe(false);
});

test("preloads Troglodyte idle, walk, reactions and all three attacks", () => {
    expect(shouldPreloadUnitAnimationAtlas("troglodyte_walk_atlas_quarter", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("troglodyte_idle_atlas_quarter", false)).toBe(true);
    for (const state of ["hit", "death"]) {
        expect(shouldPreloadUnitAnimationAtlas(`troglodyte_${state}_atlas_quarter`, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`troglodyte_${state}_atlas`, false)).toBe(false);
    }
    for (const state of ["attack", "attack_up", "attack_down"]) {
        expect(shouldPreloadUnitAnimationAtlas(`troglodyte_${state}_atlas_quarter`, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`troglodyte_${state}_atlas`, false)).toBe(false);
    }
});

test("preloads the new Scavenger lab preview sheets at board resolution", () => {
    expect(shouldPreloadUnitAnimationAtlas("scavenger_homm_idle_atlas_quarter", false)).toBe(true);
    for (const state of ["hit", "death", "attack", "attack_up", "attack_down"]) {
        expect(shouldPreloadUnitAnimationAtlas(`scavenger_combat_${state}_atlas_quarter`, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`scavenger_combat_${state}_atlas`, false)).toBe(false);
    }
});

test("preloads all three Squire attacks before the first combat or lab preview", () => {
    for (const state of ["attack", "attack_up", "attack_down"]) {
        expect(shouldPreloadUnitAnimationAtlas(`squire_${state}_atlas_quarter`, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`squire_${state}_atlas`, false)).toBe(false);
    }
});

test("preloads all three Troll lab attacks at native resolution", () => {
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down"]) {
        expect(shouldPreloadUnitAnimationAtlas(`troll_lab_${state}_atlas`, false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(`troll_lab_${state}_atlas_quarter`, false)).toBe(false);
    }
});
