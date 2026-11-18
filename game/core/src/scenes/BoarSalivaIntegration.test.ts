import { describe, expect, mock, test } from "bun:test";

import { Sandbox } from "./Sandbox";
import { RankedPlayScene } from "./RankedPlayScene";

function fixture(ranked = false) {
    let names: string[] = [];
    let dead = false;
    let travelling = false;
    const unit = {
        getId: () => "enemy",
        getName: () => "Wolf",
        getTeam: () => 2,
        getPosition: () => ({ x: 20, y: 0 }),
        isDead: () => dead,
        getDebuffs: () => [],
        getEffects: () => names.map((name) => ({ getName: () => name })),
        getBuffs: () => [],
        flashDebuffDarken: mock(() => undefined),
    };
    const spawnBoarSalivaPop = mock(() => undefined);
    const waitForTexture = mock(() => Promise.resolve(undefined));
    const scene = Object.assign(Object.create(ranked ? RankedPlayScene.prototype : Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map([["enemy", unit]]) },
        combatVisuals: { spawnBoarSalivaPop },
        shownDebuffsByUnit: new Map(),
        shownBuffsByUnit: new Map(),
        unitDebuffs: new Map(),
        unitBuffs: new Map(),
        pendingEffectPops: [],
        effectPopsSequence: -1,
        effectPopsGameId: "",
        isStrikeInFlight: () => travelling,
        waitForTexture,
    });
    const snapshot = (sequence: number) => ({
        gameId: "test",
        latestSequence: sequence,
        fightStarted: true,
        fightFinished: false,
        units: [{ id: "enemy", debuffs: names, buffs: [], dead }],
    });
    return {
        scene,
        unit,
        spawnBoarSalivaPop,
        waitForTexture,
        snapshot,
        effects: (value: string[]) => {
            names = value;
        },
        kill: () => {
            dead = true;
        },
        travelling: (value: boolean) => {
            travelling = value;
        },
    };
}

describe("Boar Saliva recipient flag wiring", () => {
    test.each([false, true])(
        "fresh application waits for impact in ranked=%s and never duplicates the static icon",
        (ranked) => {
            const f = fixture(ranked);
            const reconcile = (seq: number) =>
                ranked ? f.scene.processDebuffPops(f.snapshot(seq)) : f.scene.reconcileEffectVisuals();
            reconcile(1); // Silent baseline.
            expect(f.spawnBoarSalivaPop).not.toHaveBeenCalled();
            f.travelling(true);
            f.effects(["Boar Saliva"]);
            reconcile(2);
            expect(f.spawnBoarSalivaPop).not.toHaveBeenCalled();
            expect(f.scene.pendingEffectPops).toHaveLength(1);
            f.scene.flushEffectPops();
            expect(f.spawnBoarSalivaPop).toHaveBeenCalledTimes(1);
            expect(f.spawnBoarSalivaPop).toHaveBeenCalledWith(f.unit);
            expect(f.unit.flashDebuffDarken).toHaveBeenCalledTimes(1);
            expect(f.waitForTexture).not.toHaveBeenCalled();
            reconcile(3);
            expect(f.spawnBoarSalivaPop).toHaveBeenCalledTimes(1);
            f.effects([]);
            reconcile(4);
            f.effects(["Boar Saliva"]);
            reconcile(5);
            f.scene.flushEffectPops();
            expect(f.spawnBoarSalivaPop).toHaveBeenCalledTimes(2);
        },
    );

    test.each([false, true])("existing, resisted and dead recipients stay silent in ranked=%s", (ranked) => {
        const f = fixture(ranked);
        const reconcile = (seq: number) =>
            ranked ? f.scene.processDebuffPops(f.snapshot(seq)) : f.scene.reconcileEffectVisuals();
        f.effects(["Boar Saliva"]);
        reconcile(1); // Reconnect with existing effect.
        expect(f.spawnBoarSalivaPop).not.toHaveBeenCalled();
        f.effects([]);
        reconcile(2);
        reconcile(3); // Resisted application changes no effect data.
        expect(f.spawnBoarSalivaPop).not.toHaveBeenCalled();
        f.travelling(true);
        f.effects(["Boar Saliva"]);
        reconcile(4);
        f.kill();
        f.scene.flushEffectPops();
        expect(f.spawnBoarSalivaPop).not.toHaveBeenCalled();
    });

    test("lab preview appears on the selected boar without requiring another army", () => {
        const f = fixture();
        const caster = { ...f.unit, getId: () => "boar", getName: () => "Frenzied Boar" };
        f.scene.moveAnimManager = { isMoving: () => false };
        f.scene.creatureAnimationLabPlacedUnit = () => ({ ok: true, unit: caster });
        for (const units of [
            new Map([["boar", caster]]),
            new Map([
                ["boar", caster],
                ["enemy", f.unit],
            ]),
        ]) {
            f.scene.unitsHolder = { getAllUnits: () => units };
            const result = f.scene.playCreatureAnimationLabState("boar_saliva");
            expect(result.ok).toBe(true);
            expect(result.message).toBe("Frenzied Boar: Boar Saliva · 0,65 с");
            expect(f.spawnBoarSalivaPop).toHaveBeenLastCalledWith(caster);
        }
        expect(f.spawnBoarSalivaPop).toHaveBeenCalledTimes(2);
    });
});
