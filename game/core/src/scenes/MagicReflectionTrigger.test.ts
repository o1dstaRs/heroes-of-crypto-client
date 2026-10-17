import { expect, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";

function fixture(passive = true) {
    const holder = {
        getId: () => "dragon",
        getName: () => "Magic Dragon",
        hasAbilityActive: (name: string) => passive && name === "Magic Reflection",
        getDamagePredictionAnchor: () => ({ x: 100, y: 100 }),
    };
    const pops: unknown[] = [];
    let beams = 0;
    const gs = { getCellSize: () => 64, getMinX: () => 0, getMaxX: () => 1024, getMinY: () => 0, getMaxY: () => 1024 };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map([["dragon", holder]]) },
        sc_sceneSettings: { getGridSettings: () => gs },
        combatVisuals: {
            spawnMagicReflectionPop: (unit: unknown) => pops.push(unit),
            spawnMagicMirrorRebound: () => beams++,
            showFloatingDamage: () => undefined,
            spawnFireBurn: () => undefined,
            spawnLightningStrike: () => undefined,
        },
        showFleshShieldAbsorbedDamage: () => undefined,
        showWaterShieldAbsorbs: () => undefined,
        reboundMirrorPosition: () => ({ x: 100, y: 100 }),
        moveAnimManager: { isMoving: () => false },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit: holder }),
    });
    return { scene, holder, pops, beams: () => beams };
}

const cast = (rebounded: boolean): GameEvent => ({
    type: "spell_cast",
    casterId: "caster",
    spellName: "Lightning Strike",
    unitIdsDied: [],
    animations: [],
    damaged: [
        {
            unitId: "caster",
            position: { x: 200, y: 200 },
            amount: 30,
            unitsDied: 0,
            rebounded,
            reboundedFromUnitId: "dragon",
        },
    ],
});

test("shared sandbox/replay damage renderer shows reflection over the holder only on a confirmed rebound", () => {
    const f = fixture();
    f.scene.renderSpellDamageVfx([cast(false)]);
    expect(f.pops).toHaveLength(0);
    f.scene.renderSpellDamageVfx([cast(true)]);
    expect(f.pops).toEqual([f.holder]);
    expect(f.beams()).toBe(1);
    const buffOnly = fixture(false);
    buffOnly.scene.renderSpellDamageVfx([cast(true)]);
    expect(buffOnly.pops).toHaveLength(0);
    expect(buffOnly.beams()).toBe(1);
});

test("lab reflection button previews the same flag effect", () => {
    const f = fixture();
    expect(f.scene.playCreatureAnimationLabState("magic_reflection").ok).toBe(true);
    expect(f.pops).toEqual([f.holder]);
});
