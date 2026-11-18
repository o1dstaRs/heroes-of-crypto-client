import { expect, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { animatableEffectNames } from "./effect_pops";
import { shatterArmorRecipients } from "./shatterArmorFlagEffects";
import { commonFlagFrameAt } from "./sandbox/CommonFlagPops";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";

const events = [
    {
        type: "effects_applied",
        applications: [
            { unitId: "target", name: "Shatter Armor", kind: "debuff", resisted: false },
            { unitId: "target", name: "Shatter Armor", kind: "debuff", resisted: false },
            { unitId: "resisted", name: "Shatter Armor", kind: "debuff", resisted: true },
            { unitId: "other", name: "Weakness", kind: "debuff", resisted: false },
            { unitId: "secondary", name: "Shatter Armor", kind: "debuff", resisted: false },
        ],
    },
] as GameEvent[];

test("armor fracture uses successful applications, including existing stacks, without a duplicate generic icon", () => {
    expect(shatterArmorRecipients(events)).toEqual(["target", "secondary"]);
    expect(shatterArmorRecipients(undefined)).toEqual([]);
    expect(animatableEffectNames(["Shatter Armor", "Weakness"])).toEqual(new Set(["Weakness"]));
    expect(commonFlagFrameAt("shatter_armor", 0)).toBe(0);
    expect(commonFlagFrameAt("shatter_armor", 999)).toBe(8);
    expect(commonFlagFrameAt("shatter_armor", 1000)).toBeUndefined();
    expect(isLazyCombatEffectAssetKey("vfx_shatter_armor_pop_atlas")).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_shatter_armor_pop_atlas")).toBe(false);
});

test("impact checkpoints animate the actual victim once per action; later actions and lab can replay it", () => {
    const pops: string[] = [];
    let dead = false;
    const target = {
        getId: () => "target",
        getName: () => "Dark Champion",
        isDead: () => dead,
        flashDebuffDarken() {},
    };
    const secondary = { ...target, getId: () => "secondary" };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    ["target", target],
                    ["secondary", secondary],
                ]),
        },
        combatVisuals: {
            spawnCommonFlagPop: (unit: typeof target, kind: string) => pops.push(`${unit.getId()}:${kind}`),
        },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit: target }),
        moveAnimManager: { isMoving: () => false },
    });
    scene.beginDullingDefensePresentation();
    scene.popRecordedShatterArmor(events, new Set(["target"]));
    scene.popRecordedShatterArmor(events);
    scene.popRecordedShatterArmor(events);
    expect(pops).toEqual(["target:shatter_armor", "secondary:shatter_armor"]);
    scene.beginDullingDefensePresentation();
    scene.popRecordedShatterArmor(events, new Set(["target"]));
    expect(pops).toHaveLength(3);
    dead = true;
    scene.popRecordedShatterArmor(events);
    expect(pops).toHaveLength(3);
    dead = false;
    expect(scene.playCreatureAnimationLabState("shatter_armor").ok).toBe(true);
    expect(pops.at(-1)).toBe("target:shatter_armor");
});
