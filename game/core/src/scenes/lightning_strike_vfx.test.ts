import { expect, mock, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

function fixture(alive: boolean) {
    const visuals = {
        spawnLightningStrike: mock<(target: { x: number; y: number }, cellSize: number) => void>(() => undefined),
        spawnFireBurn: mock(() => undefined),
        spawnFireSweep: mock(() => undefined),
        showFloatingDamage: mock(() => undefined),
        spawnMagicMirrorRebound: mock(() => undefined),
    };
    const gs = { getCellSize: () => 64, getMinX: () => 0, getMaxX: () => 1024, getMinY: () => 0, getMaxY: () => 1024 };
    const target = {
        getVisualCenter: () => ({ x: 350, y: 440 }),
        getDamagePredictionAnchor: () => undefined,
        hasAbilityActive: () => false,
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map(alive ? [["target", target]] : []) },
        sc_sceneSettings: { getGridSettings: () => gs },
        combatVisuals: visuals,
        showFleshShieldAbsorbedDamage: () => undefined,
        showShieldAbsorbs: () => undefined,
        reboundMirrorPosition: () => ({ x: 350, y: 440 }),
    });
    return { scene, visuals, gs };
}

const cast = (amount = 90): GameEvent => ({
    type: "spell_cast",
    casterId: "caster",
    targetId: "target",
    spellName: "Lightning Strike",
    unitIdsDied: [],
    animations: [],
    damaged: [
        { unitId: "target", position: { x: 300, y: 400 }, amount, unitsDied: 0 },
        {
            unitId: "caster",
            position: { x: 100, y: 200 },
            amount: 20,
            unitsDied: 0,
            rebounded: true,
            reboundedFromUnitId: "target",
        },
    ],
});

test("Lightning Strike hits one visual target; reflection keeps its separate beam and no fire", () => {
    const { scene, visuals } = fixture(true);
    scene.renderSpellDamageVfx([cast()], { x: 100, y: 200 });
    expect(visuals.spawnLightningStrike.mock.calls).toEqual([[{ x: 350, y: 440 }, 64]]);
    expect(visuals.spawnFireBurn).not.toHaveBeenCalled();
    expect(visuals.spawnFireSweep).not.toHaveBeenCalled();
    expect(visuals.spawnMagicMirrorRebound).toHaveBeenCalledTimes(1);
    expect(visuals.showFloatingDamage).toHaveBeenCalledTimes(2);
});

test("a removed victim still receives lightning at its authoritative recorded position", () => {
    const { scene, visuals, gs } = fixture(false);
    scene.renderSpellDamageVfx([cast()]);
    expect(visuals.spawnLightningStrike.mock.calls).toEqual([
        [projectBattlefieldPoint({ x: 300, y: 400 }, gs as never), 64],
    ]);
});

test("a zero-damage strike still flashes; another spell retains its existing fire effect", () => {
    const { scene, visuals } = fixture(true);
    scene.renderSpellDamageVfx([cast(0)]);
    expect(visuals.spawnLightningStrike).toHaveBeenCalledTimes(1);
    scene.renderSpellDamageVfx([{ ...cast(), spellName: "Meteor Shower" }]);
    expect(visuals.spawnLightningStrike).toHaveBeenCalledTimes(1);
    expect(visuals.spawnFireBurn).toHaveBeenCalledTimes(1);
});
