import { expect, test } from "bun:test";
import { readFireSpellRenderMode, saveFireSpellRenderMode } from "./fireSpellTiming";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";
import { isUnitAnimationAtlasKey } from "../pixi/unitAtlasKeys";

test("a chosen spell renderer survives scene recreation, invalid preferences fall back to sprites", () => {
    let value: string | null = null;
    const storage = {
        getItem: () => value,
        setItem: (_key: string, next: string) => {
            value = next;
        },
    };
    expect(readFireSpellRenderMode(storage)).toBe("sprites");
    saveFireSpellRenderMode("particles", storage);
    expect(readFireSpellRenderMode(storage)).toBe("particles");
    saveFireSpellRenderMode("sprites", storage);
    expect(readFireSpellRenderMode(storage)).toBe("sprites");
    value = "obsolete";
    expect(readFireSpellRenderMode(storage)).toBe("sprites");
    const blocked = {
        getItem: () => {
            throw new Error("blocked");
        },
        setItem: () => {
            throw new Error("blocked");
        },
    };
    expect(readFireSpellRenderMode(blocked)).toBe("sprites");
    expect(() => saveFireSpellRenderMode("particles", blocked)).not.toThrow();
});

test("Magic Reflection ships as a lazily loaded spell effect in ordinary builds", () => {
    const key = "vfx_magic_reflection_pop_atlas";
    expect(isUnitAnimationAtlasKey(key)).toBe(false);
    expect(isProductionOmittedAssetKey(key)).toBe(false);
    expect(isLazyCombatEffectAssetKey(key)).toBe(true);
});
