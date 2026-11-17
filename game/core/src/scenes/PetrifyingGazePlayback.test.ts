import { expect, mock, spyOn, test } from "bun:test";
import { Sandbox } from "./Sandbox";
import { PETRIFYING_GAZE_DURATION_MS } from "./sandbox/PetrifyingGazePops";
import { CombatVisuals } from "./sandbox/CombatVisuals";
import { PETRIFYING_GAZE_REACTION_TIMEOUT_MS } from "./sandbox/PetrifyingGazePops";
import type { GameEvent } from "@heroesofcrypto/common";
const flush = async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
};
// The ordinary hit owns contact; Gaze owns its delayed number, casualties and reaction.
test.each([false, true])("recorded gaze damage waits for the head and primary reaction; lethal=%s", async (lethal) => {
    let now = 0;
    const clock = spyOn(performance, "now").mockImplementation(() => now);
    const numbers = mock((_position: unknown, _amount: number, ..._rest: unknown[]) => undefined);
    let finishHit!: () => void, finishDelay!: () => void, finishPrimary!: () => void;
    const extraHit = mock(
        () =>
            new Promise<void>((resolve) => {
                finishHit = resolve;
            }),
    );
    const pop = mock((_unit: unknown) => new Promise<() => void>(() => {}));
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        isSceneDestroyed: () => false,
        sc_sceneSettings: { getGridSettings: () => ({}) },
        combatVisuals: { showFloatingDamage: numbers, spawnPetrifyingGazePop: pop },
        playReplayOneShot: extraHit,
        playUnitCombatSound: () => {},
        delayReplay: (ms: number) =>
            new Promise<void>((resolve) => {
                expect(ms).toBe(PETRIFYING_GAZE_DURATION_MS);
                finishDelay = resolve;
            }),
    });
    const casualties = mock((_n: number) => undefined),
        death = mock(() => undefined);
    const unit = {
        getVisualCenter: () => ({ x: 100, y: 0 }),
        getDamagePredictionAnchor: () => ({ x: 100, y: 100 }),
        presentDamageCasualties: casualties,
    };
    const entry = {
        source: "petrifying_gaze",
        unitId: "B",
        position: { x: 100, y: 0 },
        amount: 45,
        unitsDied: lethal ? 1 : 0,
    };
    const primary = new Promise<void>((resolve) => {
        finishPrimary = resolve;
    });
    const pending = scene.presentPetrifyingGaze(entry, { x: 0, y: 0 }, unit, primary, lethal ? death : undefined);
    // Replaying the same recorded entry must not add a second number or another loss.
    await scene.presentPetrifyingGaze(entry, { x: 0, y: 0 }, unit);
    expect(pop).toHaveBeenCalledTimes(1);
    expect(scene.pendingAbilityPresentations.size).toBe(1);
    expect(numbers).not.toHaveBeenCalled();
    expect(casualties).not.toHaveBeenCalled();
    now = PETRIFYING_GAZE_DURATION_MS;
    finishDelay();
    await flush();
    expect(numbers).not.toHaveBeenCalled();
    finishPrimary();
    await flush();
    expect(numbers).toHaveBeenCalledTimes(1);
    expect(numbers.mock.calls[0]?.[1]).toBe(45);
    expect(casualties).toHaveBeenCalledWith(lethal ? 1 : 0);
    expect(death).toHaveBeenCalledTimes(lethal ? 1 : 0);
    expect(extraHit).toHaveBeenCalledTimes(lethal ? 0 : 1);
    expect(pop).toHaveBeenCalledTimes(1);
    expect(pop.mock.calls[0]?.[0]).toBe(unit);
    if (!lethal) {
        expect(scene.pendingAbilityPresentations.size).toBe(1);
        finishHit();
    }
    await pending;
    expect(scene.pendingAbilityPresentations.size).toBe(0);
    clock.mockRestore();
});

test.each(["destroy", "recovery"])("%s during the gaze delay cancels damage, casualties and death", async (mode) => {
    let destroyed = false,
        release!: () => void;
    const numbers = mock(() => undefined),
        casualties = mock(() => undefined),
        death = mock(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        isSceneDestroyed: () => destroyed,
        combatVisuals: { showFloatingDamage: numbers },
        delayReplay: () =>
            new Promise<void>((resolve) => {
                release = resolve;
            }),
    });
    const pending = scene.presentPetrifyingGaze(
        { source: "petrifying_gaze", amount: 45, unitsDied: 1 },
        { x: 0, y: 0 },
        { presentDamageCasualties: casualties },
        Promise.resolve(),
        death,
    );
    if (mode === "destroy") destroyed = true;
    else scene.abilityPresentationEpoch = 1;
    release();
    await pending;
    expect(numbers).not.toHaveBeenCalled();
    expect(casualties).not.toHaveBeenCalled();
    expect(death).not.toHaveBeenCalled();
    expect(scene.pendingAbilityPresentations.size).toBe(0);
});

test.each([0, 2])("the replay watchdog budgets %s recorded gaze phases", async (count) => {
    const timeouts: number[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        isSceneDestroyed: () => false,
        scheduleSceneTimeout: (_callback: () => void, ms: number) => {
            timeouts.push(ms);
            return 1;
        },
        clearSceneTimeout: () => {},
        playSandboxReplayRecord: async () => true,
    });
    const events = [
        {
            type: "unit_attacked",
            damage: {
                secondary: Array.from({ length: count }, () => ({
                    source: "petrifying_gaze",
                    amount: 45,
                    unitsDied: 1,
                })),
            },
        },
    ] as unknown as GameEvent[];
    expect(await scene.playAuthoritativeActionRecord({ type: "end_turn", unitId: "A" }, events, { units: [] })).toBe(
        true,
    );
    expect(timeouts).toEqual([5000 + count * (PETRIFYING_GAZE_DURATION_MS + PETRIFYING_GAZE_REACTION_TIMEOUT_MS)]);
});
test("retired scenes cannot emit a new gaze result", async () => {
    const numbers = mock(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        isSceneDestroyed: () => true,
        combatVisuals: { showFloatingDamage: numbers },
    });
    await scene.presentPetrifyingGaze({ source: "petrifying_gaze", amount: 45, unitsDied: 1 }, { x: 0, y: 0 });
    expect(numbers).not.toHaveBeenCalled();
});
test("lab gaze preview uses the luck flag anchor and removes its head before secondary damage", async () => {
    const flag = { x: 120, y: 230 };
    let follow!: () => { x: number; y: number; unitId?: string };
    const finished: string[] = [];
    const visuals = Object.assign(Object.create(CombatVisuals.prototype), {
        context: { getGridSettings: () => ({ getCellSize: () => 128 }) },
        floatingTexts: [],
        petrifyingGazePops: {
            spawn: async (_id: string, _cell: number, getAnchor: typeof follow) => {
                follow = getAnchor;
            },
            finish: (id: string) => finished.push(id),
        },
    });
    const finish = await visuals.spawnPetrifyingGazePop(
        {
            getId: () => "victim",
            getFlagEffectAnchor: () => flag,
            getDamagePredictionAnchor: () => ({ x: 130, y: 900 }),
        },
        "preview",
    );
    expect(follow()).toEqual({ ...flag, unitId: "victim" });
    flag.y = 260;
    expect(follow()).toEqual({ x: 120, y: 260, unitId: "victim" });
    expect(finished).toEqual([]);
    finish();
    expect(finished).toEqual(["victim"]);
});

test("explicit gaze lab preview retains its badge and controlled authored delay", async () => {
    const calls: string[] = [];
    let finish!: () => void;
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => ({}) },
        combatVisuals: {
            spawnPetrifyingGazePop: async (_unit: unknown, presentation: string) => {
                calls.push(presentation);
                return () => calls.push("finish");
            },
            showFloatingDamage: () => calls.push("damage"),
        },
        delayReplay: (ms: number) =>
            new Promise<void>((resolve) => {
                expect(ms).toBe(PETRIFYING_GAZE_DURATION_MS);
                finish = resolve;
            }),
        isSceneDestroyed: () => false,
        playReplayOneShot: async () => undefined,
    });
    const pending = scene.presentPetrifyingGaze(
        { source: "petrifying_gaze", amount: 12, unitsDied: 0, position: { x: 0, y: 0 } },
        { x: 0, y: 0 },
        { getVisualCenter: () => ({ x: 0, y: 0 }), getDamagePredictionAnchor: () => ({ x: 0, y: 0 }) },
        Promise.resolve(),
        undefined,
        true,
    );
    await flush();
    expect(calls).toEqual(["preview"]);
    finish();
    await pending;
    expect(calls).toEqual(["preview", "finish", "damage"]);
});
