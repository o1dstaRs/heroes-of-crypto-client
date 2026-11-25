import { expect, mock, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { RenderableUnit } from "./RenderableUnit";

// Owner report 2026-11-25: magic damage (Lightning Strike, Chain Lightning, reflections, burns) drew the number
// but the struck creature never played its hit reaction in replays (ranked, vs AI) or for spells.

const gs = {
    getCellSize: () => 64,
    getStep: () => 64,
    getHalfStep: () => 32,
    getGridSize: () => 16,
    getMinX: () => 0,
    getMaxX: () => 1024,
    getMinY: () => 0,
    getMaxY: () => 1024,
};

function creature(id: string, center: { x: number; y: number }, busy = false) {
    const applyHitReaction = mock((_dx: number, _dy: number) => undefined);
    const unit = Object.assign(Object.create(RenderableUnit.prototype), {
        getId: () => id,
        getTeam: () => 2,
        getVisualCenter: () => center,
        getDamagePredictionAnchor: () => undefined,
        hasAbilityActive: () => false,
        getSpells: () => [],
        getMagicResist: () => 0,
        captureDamageCasualties: () => undefined,
        isDead: () => false,
        hasUnfinishedCombatAnimation: () => busy,
        applyHitReaction,
    }) as RenderableUnit;
    return { unit, applyHitReaction };
}

function scene(units: Map<string, RenderableUnit>) {
    const visuals = {
        spawnLightningStrike: mock(() => undefined),
        spawnFireBurn: mock(() => undefined),
        spawnFireSweep: mock(() => undefined),
        spawnMagicMirrorRebound: mock(() => undefined),
        spawnCommonFlagPop: mock(() => undefined),
        showFloatingDamage: mock(() => undefined),
    };
    return Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => units },
        sc_sceneSettings: { getGridSettings: () => gs },
        combatVisuals: visuals,
        showFleshShieldAbsorbedDamage: () => undefined,
        showShieldAbsorbs: () => undefined,
        showDevourEssenceHeals: () => undefined,
        reboundMirrorPosition: () => ({ x: 350, y: 440 }),
        offsetReplayDamagePosition: (center: { x: number; y: number }) => center,
        scheduleSceneTimeout: (callback: () => void) => callback(),
        isSceneDestroyed: () => false,
    });
}

const lightningStrike = (): GameEvent => ({
    type: "spell_cast",
    casterId: "caster",
    targetId: "target",
    spellName: "Lightning Strike",
    unitIdsDied: [],
    animations: [],
    damaged: [
        { unitId: "target", position: { x: 300, y: 400 }, amount: 90, unitsDied: 0 },
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

test("a Lightning Strike victim and the caster its reflection burns both play the hit reaction", () => {
    const target = creature("target", { x: 350, y: 440 });
    const caster = creature("caster", { x: 100, y: 200 });
    const s = scene(
        new Map<string, RenderableUnit>([
            ["target", target.unit],
            ["caster", caster.unit],
        ]),
    );
    s.renderSpellDamageVfx([lightningStrike()], { x: 100, y: 200 });
    expect(target.applyHitReaction).toHaveBeenCalledTimes(1);
    // A strike from the sky has no caster point: the victim recoils straight down.
    const [dx, dy] = target.applyHitReaction.mock.calls[0];
    expect(dx).toBe(0);
    expect(dy).toBeLessThan(0);
    expect(caster.applyHitReaction).toHaveBeenCalledTimes(1);
});

test("a unit still playing a clip keeps it instead of flinching", () => {
    const target = creature("target", { x: 350, y: 440 }, true);
    const s = scene(new Map<string, RenderableUnit>([["target", target.unit]]));
    s.renderSpellDamageVfx([lightningStrike()], { x: 100, y: 200 });
    expect(target.applyHitReaction).not.toHaveBeenCalled();
});

test("Chain Lightning arcs flinch in a replay; sweep victims are left to the exchange's contact reaction", () => {
    const arc = creature("arc", { x: 500, y: 500 });
    const spun = creature("spun", { x: 600, y: 600 });
    const s = scene(
        new Map<string, RenderableUnit>([
            ["arc", arc.unit],
            ["spun", spun.unit],
        ]),
    );
    s.showSecondaryDamageNumbers(
        [
            { source: "chain_lightning", unitId: "arc", position: { x: 500, y: 500 }, amount: 40, unitsDied: 0 },
            { source: "lightning_spin", unitId: "spun", position: { x: 600, y: 600 }, amount: 30, unitsDied: 0 },
        ],
        { x: 300, y: 300 },
        1,
    );
    expect(arc.applyHitReaction).toHaveBeenCalledTimes(1);
    expect(spun.applyHitReaction).not.toHaveBeenCalled();
});
