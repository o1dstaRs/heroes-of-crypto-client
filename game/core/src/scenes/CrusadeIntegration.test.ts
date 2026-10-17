import { expect, test } from "bun:test";
import { FightStateManager } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { CrusadeTriggers } from "./sandbox/CrusadeTriggers";

test("resolved refresh and the Crusade lab button use the champion's flag layer", () => {
    const fight = FightStateManager.getInstance();
    fight.reset();
    let x = 100;
    let attack = 25;
    const unit = {
        getId: () => "champion",
        getName: () => "Champion",
        getPosition: () => ({ x, y: 100 }),
        getBaseAttack: () => attack,
        getBaseArmor: () => attack,
        getAbility: (name: string) => (name === "Crusade" ? {} : undefined),
        isDead: () => false,
    };
    const calls: unknown[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        crusadeTriggers: new CrusadeTriggers(),
        unitsHolder: { getAllUnits: () => new Map([["champion", unit]]) },
        combatVisuals: { spawnCrusadePop: (target: unknown) => calls.push(target) },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit }),
        moveAnimManager: { isMoving: () => false },
    });
    try {
        scene.refreshCrusadePops();
        fight.getFightProperties().startFight();
        x = 200;
        attack = 27;
        scene.refreshCrusadePops();
        scene.refreshCrusadePops();
        expect(calls).toEqual([unit]);
        expect(scene.playCreatureAnimationLabState("crusade").ok).toBe(true);
        expect(calls).toEqual([unit, unit]);
    } finally {
        fight.reset();
    }
});
