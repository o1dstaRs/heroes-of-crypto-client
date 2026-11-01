import { expect, test } from "bun:test";

import { approvedAnimationAssetKeysForUnit } from "../pixi/creatureAnimationSettings";
import { TextureType, unitToTextureName } from "../pixi/PixiUnitsFactory";
import { replayActionTextureKeys, replayStateTextureKeys } from "./replayTextureKeys";
import type { SandboxReplayActionRecord } from "./sandbox_replay";
import { GridVals } from "@heroesofcrypto/common";
import type { SandboxSceneState } from "../scenes/Sandbox";
import { LAVA_PIT_ASSETS, lavaPitTextureKeys } from "../scenes/sandbox/lavaPitAssets";

const state = (...names: string[]): SandboxSceneState =>
    ({ units: names.map((name) => ({ properties: { id: name, name } })) }) as SandboxSceneState;

test("the opening waits only for this army's figures while idle and combat artwork warms separately", () => {
    const opening = replayStateTextureKeys(state("Peasant", "Wolf", "Wolf"));
    expect(opening).toContain(unitToTextureName("Peasant", TextureType.SMALL));
    expect(opening).toContain(unitToTextureName("Wolf", TextureType.SMALL));
    for (const key of approvedAnimationAssetKeysForUnit("Wolf")) {
        expect(opening).not.toContain(key);
    }
    for (const key of ["vfx_meteor_shower_impact_atlas", "cyclops_heavy_boulder", "double_shot_256", "heal_256"]) {
        expect(opening).not.toContain(key);
    }
    expect(opening).not.toContain(unitToTextureName("Orc", TextureType.SMALL));
    expect(new Set(opening).size).toBe(opening.length);
});

test("an exchange readies the attacker, response, secondary victims and summons without unrelated combat sheets", () => {
    const previous = state("Wolf", "Orc", "Healer", "Peasant");
    const after = state("Wolf", "Orc", "Healer", "Peasant", "Arachna Spider");
    after.units[1].dead = true;
    const record = {
        action: { type: "melee_attack", attackerId: "Wolf", targetId: "Orc" },
        events: [{ type: "unit_attacked", damage: { secondary: [{ unitId: "Healer" }] } }],
        stateAfter: after,
    } as unknown as SandboxReplayActionRecord;
    const keys = replayActionTextureKeys(previous, record);
    for (const name of ["Wolf", "Orc", "Healer", "Arachna Spider"]) {
        expect(keys).toContain(unitToTextureName(name, TextureType.SMALL));
        for (const key of approvedAnimationAssetKeysForUnit(name)) expect(keys).toContain(key);
    }
    for (const key of approvedAnimationAssetKeysForUnit("Peasant").filter((key) => /_(attack|walk)_/.test(key))) {
        expect(keys).not.toContain(key);
    }
    expect(new Set(keys).size).toBe(keys.length);
});

test("firepit changes load at the action that needs them, and other maps load neither variant", () => {
    const burning = { ...state(), gridType: GridVals.LAVA_CENTER, centerDried: false };
    const extinguished = { ...burning, centerDried: true };
    const opening = replayStateTextureKeys(burning);
    for (const key of lavaPitTextureKeys(false)) expect(opening).toContain(key);
    expect(opening).not.toContain(LAVA_PIT_ASSETS.extinguished);
    const complete = replayActionTextureKeys(burning, {
        action: { type: "wait_turn", unitId: "a" },
        events: [],
        stateAfter: extinguished,
    } as unknown as SandboxReplayActionRecord);
    for (const key of Object.values(LAVA_PIT_ASSETS)) expect(complete).toContain(key);
    expect(new Set(complete).size).toBe(complete.length);
    const normal = replayStateTextureKeys({ ...state(), gridType: GridVals.NORMAL });
    for (const key of Object.values(LAVA_PIT_ASSETS)) expect(normal).not.toContain(key);
});

test("a corpse does not add its idle or board artwork to the opening", () => {
    const previous = state("Wolf", "Orc");
    previous.units[1].dead = true;
    expect(replayStateTextureKeys(previous)).toEqual(replayStateTextureKeys(state("Wolf")));
});
