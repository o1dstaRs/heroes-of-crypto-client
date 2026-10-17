import { describe, expect, mock, test } from "bun:test";

import type { Effect } from "@heroesofcrypto/common";

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
        hasStatusEffect: (name: string) => names.includes(name),
        applyEffect: mock((effect: Effect) => {
            names.push(effect.getName());
            return true;
        }),
        deleteEffect: mock((name: string) => {
            names = names.filter((entry) => entry !== name);
        }),
        flashDebuffDarken: mock(() => undefined),
    };
    const spawnParalysisPop = mock(() => undefined);
    const waitForTexture = mock(() => Promise.resolve(undefined));
    const scene = Object.assign(Object.create(ranked ? RankedPlayScene.prototype : Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map([["enemy", unit]]) },
        combatVisuals: { spawnParalysisPop },
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
        spawnParalysisPop,
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

describe("Paralysis recipient flag wiring", () => {
    test.each([false, true])(
        "fresh application waits for impact in ranked=%s and never duplicates the static icon",
        (ranked) => {
            const f = fixture(ranked);
            const reconcile = (seq: number) =>
                ranked ? f.scene.processDebuffPops(f.snapshot(seq)) : f.scene.reconcileEffectVisuals();
            reconcile(1); // Silent baseline.
            expect(f.spawnParalysisPop).not.toHaveBeenCalled();
            f.travelling(true);
            f.effects(["Paralysis"]);
            reconcile(2);
            expect(f.spawnParalysisPop).not.toHaveBeenCalled();
            expect(f.scene.pendingEffectPops).toHaveLength(1);
            f.scene.flushEffectPops();
            expect(f.spawnParalysisPop).toHaveBeenCalledTimes(1);
            expect(f.spawnParalysisPop).toHaveBeenCalledWith(f.unit);
            expect(f.unit.flashDebuffDarken).toHaveBeenCalledTimes(1);
            expect(f.waitForTexture).not.toHaveBeenCalled();
            reconcile(3);
            expect(f.spawnParalysisPop).toHaveBeenCalledTimes(1);
            f.effects([]);
            reconcile(4);
            f.effects(["Paralysis"]);
            reconcile(5);
            f.scene.flushEffectPops();
            expect(f.spawnParalysisPop).toHaveBeenCalledTimes(2);
        },
    );

    test.each([false, true])("existing, resisted and dead recipients stay silent in ranked=%s", (ranked) => {
        const f = fixture(ranked);
        const reconcile = (seq: number) =>
            ranked ? f.scene.processDebuffPops(f.snapshot(seq)) : f.scene.reconcileEffectVisuals();
        f.effects(["Paralysis"]);
        reconcile(1); // Reconnect with existing effect.
        expect(f.spawnParalysisPop).not.toHaveBeenCalled();
        f.effects([]);
        reconcile(2);
        reconcile(3); // Resisted application changes no effect data.
        expect(f.spawnParalysisPop).not.toHaveBeenCalled();
        f.travelling(true);
        f.effects(["Paralysis"]);
        reconcile(4);
        f.kill();
        f.scene.flushEffectPops();
        expect(f.spawnParalysisPop).not.toHaveBeenCalled();
    });

    test("lab toggles a lasting paralysis status without requiring another army", () => {
        const f = fixture();
        const caster = { ...f.unit, getId: () => "mantis", getName: () => "Mantis" };
        f.scene.moveAnimManager = { isMoving: () => false };
        f.scene.creatureAnimationLabPlacedUnit = () => ({ ok: true, unit: caster });
        for (const units of [
            new Map([["mantis", caster]]),
            new Map([
                ["mantis", caster],
                ["enemy", f.unit],
            ]),
        ]) {
            f.scene.unitsHolder = { getAllUnits: () => units };
            const result = f.scene.playCreatureAnimationLabState("paralysis");
            expect(result.ok).toBe(true);
            expect(result.message).toBe("Mantis: Паралич активен · повторное нажатие снимает эффект");
            expect(f.spawnParalysisPop).toHaveBeenLastCalledWith(caster);
            expect(caster.hasStatusEffect("Paralysis")).toBe(true);
            expect(f.scene.playCreatureAnimationLabState("paralysis").message).toBe("Mantis: Паралич снят");
            expect(caster.hasStatusEffect("Paralysis")).toBe(false);
        }
        expect(f.spawnParalysisPop).toHaveBeenCalledTimes(2);
    });
    test("leaving the lab removes only its own test paralysis", () => {
        const f = fixture();
        Object.assign(f.unit, { setCreatureAnimationLabPreviewEnabled: () => undefined });
        f.scene.moveAnimManager = { isMoving: () => false, forceFinish: () => undefined };
        f.scene.creatureAnimationLabPlacedUnit = () => ({ ok: true, unit: f.unit });
        f.scene.getCreatureAnimationLabUnit = () => undefined;
        f.scene.combatVisuals.syncAiTurnBrain = () => undefined;
        f.scene.creatureAnimationLabEnabled = true;
        f.scene.playCreatureAnimationLabState("paralysis");
        expect(f.unit.hasStatusEffect("Paralysis")).toBe(true);
        f.scene.setCreatureAnimationLabEnabled(false);
        expect(f.unit.hasStatusEffect("Paralysis")).toBe(false);
        f.effects(["Paralysis"]);
        f.scene.playCreatureAnimationLabState("paralysis");
        f.scene.setCreatureAnimationLabEnabled(false);
        expect(f.unit.hasStatusEffect("Paralysis")).toBe(true);
    });
});
