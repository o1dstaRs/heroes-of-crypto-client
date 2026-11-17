import { afterAll, beforeAll, expect, mock, spyOn, test } from "bun:test";
import { Container, DOMAdapter, Texture, TextureSource } from "pixi.js";
import { GridConstants, GridSettings, TeamVals, type GameEvent, type GameAction } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { CombatVisuals } from "./sandbox/CombatVisuals";
import { SpellFireParticles } from "./sandbox/SpellFireParticles";
import { spellFootprint } from "./sandbox/SpellFootprint";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";
import { FIRE_SPELL_PLAYBACK_SPEED, FIRE_STRIKE_RELEASE_MS } from "../settings/fireSpellTiming";
import { playMissingRankedSnapshotRecords } from "../ui/rankedSnapshotSync";
import type { PlaySnapshot } from "../api/play_protocol";

type ExposedScene = {
    renderSpellDamageVfx(
        events: GameEvent[],
        from?: { x: number; y: number },
        units?: ReadonlyMap<string, object>,
    ): void;
    cleanupAfterSpell(events?: GameEvent[], units?: ReadonlyMap<string, object>): void;
    playReplayCastSpellAction(record: unknown, deferTurnAdvance?: boolean): Promise<boolean>;
    playReplayActionRecord(record: unknown, deferTurnAdvance?: boolean): Promise<boolean>;
    playSandboxReplayRecord(record: unknown): Promise<boolean>;
    playAuthoritativeActionRecord(action: GameAction, events: GameEvent[], state: unknown): Promise<boolean>;
    isAiActionPresentationBusy(): boolean;
    shouldDeferNarrowingSnapshot(layers: number): boolean;
};
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
};

function fixture(spellName = "Fire Strike", amount = 7, unitsDied = 0) {
    let now = 1000,
        destroyed = false;
    const clock = spyOn(performance, "now").mockImplementation(() => now);
    const root = new Container();
    const unit = (id: string, x: number) => ({
        getId: () => id,
        getName: () => (id === "caster" ? "Battle Mage" : "Peasant"),
        hasAbilityActive: () => false,
        isDead: () => false,
        getSpells: () => [],
        getPosition: () => ({ x, y: 1024 }),
        getVisualCenter: () => ({ x, y: 100 }),
        getDamagePredictionAnchor: () => ({ x, y: 140 }),
        getProjectileImpactPoint: () => ({ x, y: 100 }),
        faceBoardTarget: mock(() => undefined),
        hasAnimationState: () => true,
        hasUnfinishedCombatAnimation: () => false,
        captureDamageCasualties: mock(() => mock(() => undefined)),
    });
    const caster = { ...unit("caster", 50), getSpellProjectileOrigin: () => ({ x: 50, y: 100 }) };
    const victim = unit("victim", 250),
        splash = unit("splash", 310);
    const units = new Map<string, ReturnType<typeof unit>>([
        ["caster", caster],
        ["victim", victim],
        ["splash", splash],
    ]);
    const holder = { getAllUnits: () => units, refreshStackPowerForAllUnits: mock(() => undefined) };
    const visuals = new CombatVisuals({
        getGridSettings: () => gs,
        attachToWorldRoot: (c: Container) => root.addChild(c),
        getUnitsHolder: () => holder,
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => undefined,
        setUnitPropertiesUpdateNeeded: () => undefined,
    } as unknown as ConstructorParameters<typeof CombatVisuals>[0]);
    const textures: Texture[] = [];
    const layer = new SpellFireParticles(
        (c, z) => {
            c.zIndex = z;
            root.addChild(c);
        },
        () => now,
        () => {
            const texture = () => {
                const t = new Texture({ source: new TextureSource({ width: 64, height: 64 }) });
                textures.push(t);
                return [t];
            };
            return { flame: texture(), smoke: texture(), glow: texture(), rock: texture(), tongue: texture() };
        },
    );
    Object.assign(visuals, { spellFireParticles: layer, fireSpellRenderMode: "particles" });
    const contacts: { time: number; amount: number }[] = [];
    const damage = spyOn(visuals, "showFloatingDamage").mockImplementation((...args) => {
        contacts.push({ time: now - 1000, amount: args[1] });
        args[9]?.();
    });
    const explosion = spyOn(visuals, "spawnFireball");
    const scene = Object.assign(Object.create(Sandbox.prototype) as ExposedScene, {
        sc_sceneSettings: { getGridSettings: () => gs },
        unitsHolder: holder,
        combatVisuals: visuals,
        sc_moveBlocked: false,
        sc_isAnimating: false,
        isActiveUnitMoving: false,
        replayPlaybackActive: false,
        rangedProjectiles: { hasActive: () => false },
        moveAnimManager: { isMoving: () => false, forceFinish: mock(() => undefined) },
        isSceneDestroyed: () => destroyed,
        snapshotRenderableUnits: () => new Map(units),
        playUnitCastSound: () => undefined,
        playReplayOneShot: mock(async (): Promise<void> => undefined),
        spawnAbilityTransferVfx: () => undefined,
        renderHealVfx: () => undefined,
        renderCastOutcomes: mock(() => undefined),
        onReplaySpellImpact: mock(() => undefined),
        onReplayHangRecovery: mock(() => undefined),
        renderReplayBuffApplications: () => undefined,
        renderSnareResistVfx: () => undefined,
        applyReplayEvents: mock<(_events: readonly GameEvent[], _state?: unknown) => void>(() => undefined),
        applyTurnEngineEvents: mock(() => undefined),
        createActionEngine: () => ({ apply: () => ({ completed: false }) }),
        showFleshShieldAbsorbedDamage: mock(() => undefined),
        showShieldAbsorbs: mock(() => undefined),
        destroySpecificUnits: mock(() => undefined),
        preparePyreDeaths: mock(() => undefined),
        hoverManager: { clearHoverSilhouette: () => undefined, clearAttackVisuals: () => undefined },
        sc_sceneLog: { updateLog: () => undefined },
        materializeReplaySummons: mock(() => undefined),
        delayReplay: async (ms: number) => {
            now += ms;
            visuals.update(ms / 1000);
        },
    });
    const event: Extract<GameEvent, { type: "spell_cast" }> = {
        type: "spell_cast",
        casterId: "caster",
        spellName,
        targetId: "victim",
        ...(spellName === "Fireball" ? { targetCell: { x: 4, y: 6 } } : {}),
        animations: [],
        unitIdsDied: unitsDied ? ["victim"] : [],
        damaged: [{ unitId: "victim", position: { x: 250, y: 1024 }, amount, unitsDied }],
    };
    const record = {
        action: { type: "cast_spell" as const, casterId: "caster", spellName, targetId: "victim" },
        events: [event] as GameEvent[],
        stateAfter: { units: [] },
    };
    return {
        scene,
        visuals,
        layer,
        caster,
        victim,
        splash,
        units,
        contacts,
        damage,
        explosion,
        event,
        record,
        at: (elapsed: number) => {
            now = 1000 + elapsed;
            visuals.update(0.016);
        },
        destroy: () => {
            destroyed = true;
            visuals.clear();
        },
        dispose: () => {
            visuals.clear();
            root.destroy({ children: true });
            clock.mockRestore();
        },
    };
}

for (const spell of ["Fire Strike", "Fireball"])
    test(`${spell} starts at the cast release and still waits for both contact and creature recovery`, async () => {
        const f = fixture(spell);
        try {
            let release!: () => void;
            let complete!: () => void;
            let returned = false;
            const cast = new Promise<void>((resolve) => {
                complete = resolve;
            });
            f.scene.playReplayOneShot.mockImplementation(() => cast);
            const register = mock((callback: () => void, _windupMs: number) => {
                release = callback;
                return true;
            });
            Object.assign(f.caster, { onCastProjectileRelease: register });
            const playback = f.scene.playReplayCastSpellAction(f.record).then((result) => {
                returned = true;
                return result;
            });
            await flush();
            expect(register.mock.calls[0][1]).toBe(
                spell === "Fire Strike" ? FIRE_STRIKE_RELEASE_MS / FIRE_SPELL_PLAYBACK_SPEED : 0,
            );
            expect(f.visuals.hasPendingSpellImpacts()).toBe(false);
            release();
            await flush();
            expect(f.visuals.hasPendingSpellImpacts()).toBe(true);
            expect(f.contacts).toEqual([]);
            f.at(1000);
            await flush();
            expect(f.contacts).toHaveLength(1);
            expect(returned).toBe(false);
            expect(f.scene.applyReplayEvents).not.toHaveBeenCalled();
            complete();
            expect(await playback).toBe(true);
            expect(f.scene.applyReplayEvents).toHaveBeenCalledTimes(1);
            expect(f.contacts).toHaveLength(1);
        } finally {
            f.dispose();
        }
    });

for (const spell of ["Fire Strike", "Fireball"])
    test(`${spell} cannot launch after the scene is destroyed during cast wind-up`, async () => {
        const f = fixture(spell);
        try {
            let release!: () => void;
            let complete!: () => void;
            const cast = new Promise<void>((resolve) => {
                complete = resolve;
            });
            f.scene.playReplayOneShot.mockImplementation(() => cast);
            Object.assign(f.caster, {
                onCastProjectileRelease: (callback: () => void) => {
                    release = callback;
                    return true;
                },
            });
            const launch = spyOn(f.scene, "renderSpellDamageVfx");
            const playback = f.scene.playReplayCastSpellAction(f.record);
            await flush();
            f.destroy();
            release();
            complete();
            expect(await playback).toBe(false);
            expect(launch).not.toHaveBeenCalled();
            expect(f.scene.applyReplayEvents).not.toHaveBeenCalled();
            f.at(2000);
            expect(f.contacts).toEqual([]);
        } finally {
            f.dispose();
        }
    });

// R1: a cast clip finishing (and a rejected authoritative re-apply) is not projectile contact.
for (const spell of ["Fire Strike", "Fireball"])
    test(`${spell} replay, AI and narrowing wait for real contact, not the cast clip`, async () => {
        const f = fixture(spell);
        try {
            let returned = false;
            const playback = f.scene.playReplayCastSpellAction(f.record).then((ok: boolean) => {
                returned = true;
                return ok;
            });
            await flush();
            f.at(150);
            await flush();
            expect(returned).toBe(false);
            expect(f.contacts).toEqual([]);
            expect(f.scene.isAiActionPresentationBusy()).toBe(true);
            expect(f.scene.shouldDeferNarrowingSnapshot(1)).toBe(true);
            expect(f.scene.applyReplayEvents).not.toHaveBeenCalled();
            expect(f.scene.onReplaySpellImpact).not.toHaveBeenCalled();
            f.at(600);
            expect(await playback).toBe(true);
            expect(f.contacts).toHaveLength(1);
            expect(f.scene.applyReplayEvents).toHaveBeenCalledTimes(1);
            expect(f.scene.onReplaySpellImpact).toHaveBeenCalledTimes(1);
            expect(f.visuals.hasPendingSpellImpacts()).toBe(false);
            expect(f.scene.isAiActionPresentationBusy()).toBe(false);
            expect(f.scene.shouldDeferNarrowingSnapshot(1)).toBe(false);
            if (spell === "Fireball") expect(f.explosion).toHaveBeenCalledTimes(1);
            // An ambient tail is allowed to overlap the next action; damage is not.
            expect(f.layer.active).toBe(true);
        } finally {
            f.dispose();
        }
    });

for (const spell of ["Fire Strike", "Fireball"])
    test(`${spell} live lethal cleanup and turn handoff occur once after damage`, async () => {
        const f = fixture(spell, 70, 10);
        try {
            f.victim.isDead = () => true;
            const snapshot = new Map(f.units);
            f.scene.renderSpellDamageVfx([f.event], f.caster.getPosition(), snapshot);
            f.scene.cleanupAfterSpell([f.event], snapshot);
            f.scene.cleanupAfterSpell([f.event], snapshot);
            expect(f.scene.sc_moveBlocked).toBe(true);
            expect(f.scene.destroySpecificUnits).not.toHaveBeenCalled();
            expect(f.scene.applyTurnEngineEvents).not.toHaveBeenCalled();
            const present = f.victim.captureDamageCasualties.mock.results[0].value;
            expect(present).not.toHaveBeenCalled();
            f.at(1000);
            await flush();
            expect(present).toHaveBeenCalledTimes(1);
            expect(f.scene.destroySpecificUnits).toHaveBeenCalledTimes(1);
            expect(f.scene.applyTurnEngineEvents).toHaveBeenCalledTimes(1);
            expect(f.scene.sc_moveBlocked).toBe(false);
            f.at(3000);
            await flush();
            expect(f.contacts).toHaveLength(1);
            expect(f.scene.applyTurnEngineEvents).toHaveBeenCalledTimes(1);
        } finally {
            f.dispose();
        }
    });

test("Fireball has one flight and one filled explosion for its complete recorded area, including reflection", async () => {
    const f = fixture("Fireball");
    try {
        const launch = spyOn(f.visuals, "spawnFireballFlight");
        const mirror = spyOn(f.visuals, "spawnMagicMirrorRebound").mockImplementation(() => undefined);
        f.event.damaged!.push(
            { unitId: "splash", position: { x: 310, y: 1024 }, amount: 12, unitsDied: 2 },
            {
                unitId: "caster",
                position: { x: 50, y: 1024 },
                amount: 3,
                unitsDied: 0,
                rebounded: true,
                reboundedFromUnitId: "victim",
            },
        );
        f.event.secondary = [
            { unitId: "splash", position: { x: 310, y: 1024 }, amount: 4, unitsDied: 0, source: "flesh_shield" },
        ];
        f.scene.renderSpellDamageVfx([f.event]);
        expect(launch).toHaveBeenCalledTimes(1);
        expect(launch.mock.calls[0][1]).toEqual(spellFootprint([f.event.targetCell!], gs).center);
        expect(f.explosion).not.toHaveBeenCalled();
        expect(mirror).not.toHaveBeenCalled();
        expect(f.scene.showFleshShieldAbsorbedDamage).not.toHaveBeenCalled();
        f.at(1000);
        await flush();
        expect(f.explosion).toHaveBeenCalledTimes(1);
        expect(f.contacts.map((hit) => hit.amount)).toEqual([7, 12, 3]);
        expect(new Set(f.contacts.map((hit) => hit.time)).size).toBe(1);
        expect(mirror).toHaveBeenCalledTimes(1);
        expect(f.scene.showFleshShieldAbsorbedDamage).toHaveBeenCalledTimes(1);
        for (const unit of [f.victim, f.splash, f.caster])
            expect(unit.captureDamageCasualties.mock.results[0].value).toHaveBeenCalledTimes(1);
    } finally {
        f.dispose();
    }
});

for (const amount of [0, 8])
    test(`Fire Strike holds all shield feedback with ${amount} damage until its only contact`, async () => {
        const f = fixture("Fire Strike", amount);
        try {
            f.event.secondary = [
                { unitId: "victim", position: { x: 250, y: 1024 }, amount: 20, unitsDied: 0, source: "water_shield" },
            ];
            f.scene.renderSpellDamageVfx([f.event]);
            const waiting = f.visuals.waitForSpellImpacts();
            expect(f.scene.showShieldAbsorbs).not.toHaveBeenCalled();
            expect(f.contacts).toEqual([]);
            f.at(1000);
            expect(await waiting).toBe(true);
            expect(f.scene.showShieldAbsorbs).toHaveBeenCalledTimes(1);
            expect(f.contacts).toHaveLength(amount ? 1 : 0);
            expect(f.victim.captureDamageCasualties.mock.results[0].value).toHaveBeenCalledTimes(1);
        } finally {
            f.dispose();
        }
    });

test("a recorded fire kill cannot materialize its authoritative summon before impact", async () => {
    const f = fixture();
    try {
        f.record.events.push({
            type: "unit_summoned",
            casterId: "caster",
            unitId: "hatch",
            unitName: "Peasant",
            amount: 1,
            team: TeamVals.LEFT,
            position: { x: 0, y: 1024 },
            cells: [{ x: 1, y: 1 }],
            merged: false,
        });
        const playback = f.scene.playReplayCastSpellAction(f.record);
        await flush();
        expect(f.scene.materializeReplaySummons).not.toHaveBeenCalled();
        f.at(1000);
        expect(await playback).toBe(true);
        expect(f.contacts).toHaveLength(1);
        expect(f.scene.materializeReplaySummons).toHaveBeenCalledTimes(1);
    } finally {
        f.dispose();
    }
});

test("recorded origin and impact still deliver after a victim has left the holder", async () => {
    const f = fixture();
    try {
        const snapshot = new Map(f.units);
        f.units.delete("victim");
        f.event.animations.push({
            fromPosition: { x: 50, y: 1024 },
            toPosition: { x: 250, y: 1024 },
            affectedUnitId: "victim",
        });
        const launch = spyOn(f.visuals, "spawnFireStrikeArrow");
        f.scene.renderSpellDamageVfx([f.event], undefined, snapshot);
        expect(launch.mock.calls[0][1]).toEqual(projectBattlefieldPoint({ x: 250, y: 1024 }, gs));
        f.at(1000);
        await flush();
        expect(f.contacts).toHaveLength(1);
        expect(f.victim.captureDamageCasualties.mock.results[0].value).toHaveBeenCalledTimes(1);
    } finally {
        f.dispose();
    }
});

test("a legal caster without an authored cast clip and an empty Fireball still finish at contact", async () => {
    const f = fixture("Fireball");
    try {
        f.caster.hasAnimationState = () => false;
        f.event.damaged = [];
        const playback = f.scene.playReplayCastSpellAction(f.record);
        await flush();
        expect(f.scene.playReplayOneShot).not.toHaveBeenCalled();
        expect(f.visuals.hasPendingSpellImpacts()).toBe(true);
        expect(f.explosion).not.toHaveBeenCalled();
        f.at(1000);
        expect(await playback).toBe(true);
        expect(f.explosion).toHaveBeenCalledTimes(1);
        expect(f.contacts).toEqual([]);
    } finally {
        f.dispose();
    }
});

for (const cancel of ["clear", "watchdog", "destroy"] as const)
    test(`${cancel} cancels replay delivery without late damage or events`, async () => {
        const f = fixture();
        try {
            const playback = f.scene.playReplayCastSpellAction(f.record);
            await flush();
            if (cancel === "destroy") f.destroy();
            else if (cancel === "clear") f.visuals.clear();
            else f.visuals.cancelPendingSpellImpacts();
            expect(await playback).toBe(false);
            expect(f.scene.applyReplayEvents).not.toHaveBeenCalled();
            f.at(2000);
            await flush();
            expect(f.contacts).toEqual([]);
            expect(f.visuals.hasPendingSpellImpacts()).toBe(false);
        } finally {
            f.dispose();
        }
    });

test("live cancellation releases its already accepted turn without stranding the scene", async () => {
    const f = fixture();
    try {
        f.scene.renderSpellDamageVfx([f.event]);
        f.scene.cleanupAfterSpell([f.event]);
        f.visuals.cancelPendingSpellImpacts();
        await flush();
        expect(f.scene.sc_moveBlocked).toBe(false);
        expect(f.scene.applyTurnEngineEvents).toHaveBeenCalledTimes(1);
        expect(f.contacts).toEqual([]);
    } finally {
        f.dispose();
    }
});

test("unavailable projectile resources fall back to the authoritative impact without hanging replay", async () => {
    const f = fixture();
    const warning = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
        spyOn(f.visuals, "spawnFireStrikeArrow").mockImplementation(() => {
            throw new Error("GPU material unavailable");
        });
        expect(await f.scene.playReplayCastSpellAction(f.record)).toBe(true);
        expect(f.contacts).toHaveLength(1);
        expect(f.visuals.hasPendingSpellImpacts()).toBe(false);
        expect(warning).toHaveBeenCalledTimes(1);
    } finally {
        warning.mockRestore();
        f.dispose();
    }
});

for (const spell of ["Fire Strike", "Fireball"])
    test(`a lap-ending ${spell} never re-runs completeTurn while its delivery is pending`, async () => {
        const f = fixture(spell);
        try {
            const apply = mock(() => {
                throw new Error("Local completeTurn would narrow before delivery");
            });
            f.scene.createActionEngine = () => ({ apply });
            f.scene.playReplayActionRecord = (record: unknown, deferTurnAdvance?: boolean) =>
                f.scene.playReplayCastSpellAction(record, deferTurnAdvance);
            f.record.events.push({ type: "narrowing_applied", layers: 1 } as unknown as GameEvent);
            const playback = f.scene.playSandboxReplayRecord(f.record);
            await flush();
            expect(apply).not.toHaveBeenCalled();
            expect(f.visuals.hasPendingSpellImpacts()).toBe(true);
            expect(f.scene.applyReplayEvents).not.toHaveBeenCalled();
            f.at(600);
            expect(await playback).toBe(true);
            expect(apply).not.toHaveBeenCalled();
            expect(f.contacts).toHaveLength(1);
            expect(f.scene.applyReplayEvents.mock.calls[1][0][0].type).toBe("narrowing_applied");
        } finally {
            f.dispose();
        }
    });

test("a poll-first last-turn Fire Arrow keeps its real flight ahead of narrowing and hydration", async () => {
    const f = fixture();
    try {
        f.scene.playReplayActionRecord = (record: unknown, deferTurnAdvance?: boolean) =>
            f.scene.playReplayCastSpellAction(record, deferTurnAdvance);
        f.record.events.push({ type: "narrowing_applied", layers: 1 } as unknown as GameEvent);
        const next = {
            gameId: "last-turn-cast",
            latestSequence: 42,
            serverTimeMs: 1000,
            journalTail: [{ sequence: 42 }],
        } as PlaySnapshot;
        let hydrated = false;
        const poll = playMissingRankedSnapshotRecords(next, { ...next, latestSequence: 41 }, async () =>
            f.scene.playSandboxReplayRecord(f.record),
        ).then(() => {
            hydrated = true;
        });
        await flush();
        expect(f.visuals.hasPendingSpellImpacts()).toBe(true);
        f.at(150);
        await flush();
        expect(hydrated).toBe(false);
        expect(f.scene.applyReplayEvents).not.toHaveBeenCalled();
        expect(f.contacts).toEqual([]);
        f.at(600);
        await poll;
        expect(f.contacts).toHaveLength(1);
        expect(f.scene.applyReplayEvents.mock.calls[1][0][0].type).toBe("narrowing_applied");
        expect(hydrated).toBe(true);
    } finally {
        f.dispose();
    }
});

test("a lap-ending replay cannot apply narrowing until the spell impact was presented", async () => {
    const f = fixture();
    try {
        f.scene.playReplayActionRecord = (record: unknown, deferTurnAdvance?: boolean) =>
            f.scene.playReplayCastSpellAction(record, deferTurnAdvance);
        f.record.events.push({ type: "narrowing_applied", layers: 1 } as unknown as GameEvent);
        const playback = f.scene.playSandboxReplayRecord(f.record);
        await flush();
        expect(f.scene.applyReplayEvents).not.toHaveBeenCalled();
        f.at(600);
        expect(await playback).toBe(true);
        expect(f.contacts).toHaveLength(1);
        expect(f.scene.applyReplayEvents.mock.calls).toHaveLength(2);
        expect(f.scene.applyReplayEvents.mock.calls[1][0][0].type).toBe("narrowing_applied");
    } finally {
        f.dispose();
    }
});

test("the authoritative watchdog cancels the actual pending replay and suppresses its late continuation", async () => {
    const f = fixture();
    const warning = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
        let watchdog!: () => void;
        Object.assign(f.scene, {
            scheduleSceneTimeout: (callback: () => void) => {
                watchdog = callback;
                return 1;
            },
            clearSceneTimeout: mock(() => undefined),
            playSandboxReplayRecord: (record: unknown) => f.scene.playReplayCastSpellAction(record),
            onReplayHangRecovery: mock(() => undefined),
        });
        const playback = f.scene.playAuthoritativeActionRecord(f.record.action, f.record.events, f.record.stateAfter);
        await flush();
        expect(f.visuals.hasPendingSpellImpacts()).toBe(true);
        expect(f.scene.replayPlaybackActive).toBe(true);
        watchdog();
        expect(await playback).toBe(false);
        expect(f.scene.replayPlaybackActive).toBe(false);
        expect(f.scene.onReplayHangRecovery).toHaveBeenCalledTimes(1);
        expect(f.visuals.hasPendingSpellImpacts()).toBe(false);
        f.at(3000);
        await flush();
        expect(f.contacts).toEqual([]);
        expect(f.scene.applyReplayEvents).not.toHaveBeenCalled();
        expect(f.scene.onReplaySpellImpact).not.toHaveBeenCalled();
    } finally {
        warning.mockRestore();
        f.dispose();
    }
});

test("snapshot overlay retention keeps a pending spell alive until its real impact", async () => {
    const f = fixture();
    try {
        f.scene.renderSpellDamageVfx([f.event]);
        const epoch = f.visuals.spellImpactEpoch;
        const waiting = f.visuals.waitForSpellImpacts();
        f.visuals.clear({ keepDetachedOverlays: true });
        expect(f.visuals.spellImpactEpoch).toBe(epoch);
        expect(f.visuals.hasPendingSpellImpacts()).toBe(true);
        f.at(600);
        expect(await waiting).toBe(true);
        expect(f.contacts).toHaveLength(1);
    } finally {
        f.dispose();
    }
});

test("a rematch cannot inherit the cancelled spell cleanup or lose its own next spell", async () => {
    const f = fixture();
    try {
        f.scene.renderSpellDamageVfx([f.event]);
        f.scene.cleanupAfterSpell([f.event]);
        f.visuals.clear();
        f.scene.sc_moveBlocked = false;
        // Start the new fight's action before the old cancellation microtask has run.
        f.scene.renderSpellDamageVfx([f.event]);
        f.scene.cleanupAfterSpell([f.event]);
        await flush();
        expect(f.scene.applyTurnEngineEvents).not.toHaveBeenCalled();
        f.at(600);
        await flush();
        expect(f.contacts).toHaveLength(1);
        expect(f.scene.applyTurnEngineEvents).toHaveBeenCalledTimes(1);
        expect(f.scene.sc_moveBlocked).toBe(false);
    } finally {
        f.dispose();
    }
});

for (const spell of ["Fire Strike", "Fireball"])
    test(`a final saved-replay ${spell} cannot hydrate or show results before contact`, async () => {
        const f = fixture(spell);
        try {
            const timeline: string[] = [];
            const initialState = { units: [], gridType: 0, currentLap: 1, fightStarted: true, fightFinished: false };
            const finalState = { ...initialState, fightFinished: true };
            Object.assign(f.scene, {
                sc_visibleState: {},
                sc_sceneLog: { clear: () => undefined },
                preloadTextureKeys: async () => undefined,
                prepareMapTextures: async () => undefined,
                onSupplementaryTexturesLoaded: () => undefined,
                resetStatusApplicationOrder: () => undefined,
                rememberStatusApplications: () => undefined,
                hydrateSceneState: (state: { fightFinished: boolean }) => {
                    if (state.fightFinished) timeline.push("hydrate final");
                },
                playSandboxReplayRecord: (record: unknown) => f.scene.playReplayCastSpellAction(record),
                onReplayRecordPresented: () => timeline.push("present"),
                onReplayRecordSettling: () => timeline.push("settle"),
                finishFight: () => timeline.push("finish"),
                onReplayCompleted: () => timeline.push("results"),
            });
            const finalRecord = {
                ...f.record,
                sequence: 1,
                clientTimeMs: 0,
                stateAfter: finalState,
                events: [...f.record.events, { type: "fight_finished", winningTeam: TeamVals.LEFT }],
            };
            const replay = {
                version: 1,
                kind: "sandbox",
                id: "final-fire",
                createdAtMs: 0,
                updatedAtMs: 0,
                initialState,
                actions: [finalRecord],
            };
            const playback = Sandbox.prototype.playSandboxReplay.call(
                f.scene as unknown as Sandbox,
                replay as Parameters<Sandbox["playSandboxReplay"]>[0],
            );
            await flush();
            await flush();
            expect(f.visuals.hasPendingSpellImpacts()).toBe(true);
            expect(timeline).toEqual([]);
            expect(f.contacts).toEqual([]);
            f.at(600);
            expect(await playback).toBe(true);
            expect(f.contacts).toHaveLength(1);
            expect(timeline).toEqual(["settle", "hydrate final", "present", "hydrate final", "finish", "results"]);
        } finally {
            f.dispose();
        }
    });

test("the animation lab previews a full Fireball flight without a creature or damage recipients", async () => {
    const f = fixture("Fireball");
    try {
        Object.assign(f.scene, {
            creatureAnimationLabEnabled: true,
            creatureAnimationLabSpell: "Fireball",
            creatureAnimationLabSpellCell: { x: 4, y: 6 },
            grid: { getOccupantUnitId: () => undefined },
        });
        const launch = spyOn(f.visuals, "spawnFireballFlight");
        expect(Sandbox.prototype.castCreatureAnimationLabSpell.call(f.scene as unknown as Sandbox).ok).toBe(true);
        expect(launch).toHaveBeenCalledTimes(1);
        expect(f.explosion).not.toHaveBeenCalled();
        expect(f.visuals.hasPendingSpellImpacts()).toBe(true);
        f.at(1000);
        await flush();
        expect(f.explosion).toHaveBeenCalledTimes(1);
        expect(f.contacts).toEqual([]);
        expect(f.visuals.hasPendingSpellImpacts()).toBe(false);
    } finally {
        f.dispose();
    }
});
