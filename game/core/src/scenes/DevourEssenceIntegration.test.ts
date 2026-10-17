import { describe, expect, mock, test } from "bun:test";

import { Sandbox } from "./Sandbox";
import { RankedPlayScene } from "./RankedPlayScene";

describe("Devour Essence healing and flag cue", () => {
    test.each([false, true])("positive healing triggers the cue in ranked=%s", (ranked) => {
        const unit = {
            getVisualCenter: () => ({ x: 10, y: 20 }),
            flashBuffApplied: mock(() => undefined),
        };
        const spawnDevourEssencePop = mock(() => undefined);
        const showHealPop = mock(() => undefined);
        const scene = Object.assign(Object.create(ranked ? RankedPlayScene.prototype : Sandbox.prototype), {
            unitsHolder: { getAllUnits: () => new Map([["hydra", unit]]) },
            sc_sceneSettings: { getGridSettings: () => ({}) },
            combatVisuals: { spawnDevourEssencePop, showHealPop },
        });
        scene.showDevourEssenceHeals([
            { source: "devour_essence", unitId: "hydra", amount: 12 },
            { source: "devour_essence", unitId: "hydra", amount: 0 },
            { source: "flesh_shield", unitId: "hydra", amount: 20 },
        ]);
        expect(spawnDevourEssencePop).toHaveBeenCalledTimes(1);
        expect(spawnDevourEssencePop).toHaveBeenCalledWith(unit);
        expect(showHealPop).toHaveBeenCalledWith({ x: 10, y: 20 }, 12, unit);
        expect(unit.flashBuffApplied).toHaveBeenCalledTimes(1);
    });

    test("lab button previews the cue without changing health or starting an attack", () => {
        const unit = { getName: () => "Hydra" };
        const spawnDevourEssencePop = mock(() => undefined);
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            moveAnimManager: { isMoving: () => false },
            creatureAnimationLabPlacedUnit: () => ({ ok: true, unit }),
            combatVisuals: { spawnDevourEssencePop },
        }) as Sandbox;
        expect(scene.playCreatureAnimationLabState("devour_essence").ok).toBe(true);
        expect(spawnDevourEssencePop).toHaveBeenCalledWith(unit);
    });
});
