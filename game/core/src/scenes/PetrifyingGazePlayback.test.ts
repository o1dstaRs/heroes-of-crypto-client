import { expect, mock, test } from "bun:test";
import { Sandbox } from "./Sandbox";
import { PETRIFYING_GAZE_DURATION_MS } from "./sandbox/PetrifyingGazePops";
import { CombatVisuals } from "./sandbox/CombatVisuals";
const flush = async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
};
// INTENDED: actual secondary damage is not another attack/hit sequence. The archived head
// animation and its pause belong only to the explicit lab preview below.
test.each([false, true])("recorded gaze damage adds no attack, hit, or popup delay; lethal=%s", async (lethal) => {
    const numbers = mock((_position: unknown, _amount: number, ..._rest: unknown[]) => undefined);
    const extraHit = mock(() => {
        throw new Error("Gaze must not add a second hit animation");
    });
    const pop = mock(() => {
        throw new Error("A passive popup must not retime combat");
    });
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        isSceneDestroyed: () => false,
        sc_sceneSettings: { getGridSettings: () => ({}) },
        combatVisuals: { showFloatingDamage: numbers, spawnPetrifyingGazePop: pop },
        playReplayOneShot: extraHit,
        delayReplay: () => {
            throw new Error("Recorded damage cannot wait on a cosmetic timer");
        },
    });
    const casualties = mock((_n: number) => undefined),
        death = mock(() => undefined);
    const unit = {
        getVisualCenter: () => ({ x: 100, y: 0 }),
        getDamagePredictionAnchor: () => ({ x: 100, y: 100 }),
        presentDamageCasualties: casualties,
    };
    // An unresolved first reaction must not postpone an already-recorded damage result.
    const entry = {
        source: "petrifying_gaze",
        unitId: "B",
        position: { x: 100, y: 0 },
        amount: 45,
        unitsDied: lethal ? 1 : 0,
    };
    await scene.presentPetrifyingGaze(entry, { x: 0, y: 0 }, unit, new Promise(() => {}), lethal ? death : undefined);
    // Replaying the same recorded entry must not add a second number or another loss.
    await scene.presentPetrifyingGaze(entry, { x: 0, y: 0 }, unit);
    expect(numbers).toHaveBeenCalledTimes(1);
    expect(numbers.mock.calls[0]?.[1]).toBe(45);
    expect(casualties).toHaveBeenCalledWith(lethal ? 1 : 0);
    expect(death).toHaveBeenCalledTimes(lethal ? 1 : 0);
    expect(extraHit).not.toHaveBeenCalled();
    expect(pop).not.toHaveBeenCalled();
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
