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

test("a poison tick plays the poisoned creature's hit reaction", () => {
    const poisoned = creature("poisoned", { x: 400, y: 400 });
    const s = scene(new Map<string, RenderableUnit>([["poisoned", poisoned.unit]]));
    s.combatVisuals.spawnPoisonCloud = mock(() => undefined);
    s.renderPoisonTickVfx(poisoned.unit, 12, 0);
    expect(poisoned.applyHitReaction).toHaveBeenCalledTimes(1);
});

test("a Fire Shield burn makes the burned striker react", () => {
    const striker = creature("striker", { x: 420, y: 300 });
    const s = scene(new Map<string, RenderableUnit>([["striker", striker.unit]]));
    s.combatVisuals.spawnFireBurn = mock(() => undefined);
    s.showFireShieldDamageAtImpact(
        [{ source: "fire_shield", unitId: "striker", position: { x: 420, y: 300 }, amount: 31, unitsDied: 0 }],
        { x: 300, y: 300 },
        new Map([["striker", striker.unit]]),
    );
    expect(striker.applyHitReaction).toHaveBeenCalledTimes(1);
    // Pushed away from the shield owner, along +x.
    expect(striker.applyHitReaction.mock.calls[0][0]).toBeGreaterThan(0);
});

test("Last Fuse victims react when their delayed number lands", () => {
    const victim = creature("victim", { x: 500, y: 500 });
    const s = scene(new Map<string, RenderableUnit>([["victim", victim.unit]]));
    const scheduled: number[] = [];
    s.scheduleSceneTimeout = (callback: () => void, ms: number) => {
        scheduled.push(ms);
        callback();
    };
    s.triggerScreenShake = () => undefined;
    Object.assign(s.combatVisuals, {
        spawnPyreExplosion: mock(() => undefined),
        spawnPyreHit: mock(() => undefined),
        showFloatingDamageDelayed: mock(() => undefined),
    });
    s.renderPyreExplosion(
        {
            type: "pyre_exploded",
            unitId: "dead",
            position: { x: 450, y: 450 },
            hits: [{ unitId: "victim", position: { x: 500, y: 500 }, amount: 25, unitsDied: 0 }],
        },
        0.36,
    );
    expect(scheduled).toEqual([360]);
    expect(victim.applyHitReaction).toHaveBeenCalledTimes(1);
});

test("ranked Armageddon waves make every struck creature react", async () => {
    const { RankedPlayScene } = await import("./RankedPlayScene");
    const burned = creature("burned", { x: 600, y: 600 });
    const units = new Map<string, RenderableUnit>([["burned", burned.unit]]);
    const visuals = { showFloatingDamage: mock(() => undefined) };
    const ranked = Object.assign(Object.create(RankedPlayScene.prototype), {
        unitsHolder: { getAllUnits: () => units },
        sc_sceneSettings: { getGridSettings: () => gs },
        combatVisuals: visuals,
        armageddonVfxGameId: "game",
        armageddonVfxSequence: 1,
        parseJournalEvents: () => [{ type: "armageddon_applied", unitId: "burned", damage: 40, unitsDied: 0, wave: 1 }],
        triggerScreenShake: () => undefined,
        isSceneDestroyed: () => false,
    });
    ranked.renderNewlyAppliedArmageddon({ gameId: "game", journalTail: [{ sequence: 2 }] });
    expect(visuals.showFloatingDamage).toHaveBeenCalledTimes(1);
    expect(burned.applyHitReaction).toHaveBeenCalledTimes(1);
});
