import { expect, mock, test } from "bun:test";
import { Container, Texture, TextureSource } from "pixi.js";
import { Sandbox } from "./Sandbox";
import {
    PetrifyingGazePops,
    PETRIFYING_GAZE_DURATION_MS,
    PETRIFYING_GAZE_IMPACT_MS,
} from "./sandbox/PetrifyingGazePops";
import { CombatVisuals } from "./sandbox/CombatVisuals";
import { PETRIFYING_GAZE_REACTION_TIMEOUT_MS } from "./sandbox/PetrifyingGazePops";
import type { GameEvent } from "@heroesofcrypto/common";
const flush = async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
};
const controlledClock = () => {
    let now = 0;
    const timers: { at: number; resolve: () => void }[] = [];
    return {
        get now() {
            return now;
        },
        delay: (ms: number) => new Promise<void>((resolve) => timers.push({ at: now + ms, resolve })),
        advance: async (ms: number) => {
            now += ms;
            for (const timer of timers.filter((timer) => timer.at <= now)) {
                timers.splice(timers.indexOf(timer), 1);
                timer.resolve();
            }
            await flush();
        },
    };
};

test.each([false, true])(
    "the actual painted gaze remains fully visible when its hit/death begins; lethal=%s",
    async (lethal) => {
        const time = controlledClock();
        const root = new Container();
        const atlas = new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) });
        const layer = new PetrifyingGazePops(
            (container) => root.addChild(container),
            () => time.now,
            async () => atlas,
        );
        const unit = {
            getId: () => "victim",
            getVisualCenter: () => ({ x: 100, y: 0 }),
            getDamagePredictionAnchor: () => ({ x: 100, y: 100 }),
            getFlagEffectAnchor: () => ({ x: 100, y: 150 }),
        };
        const impacts: string[] = [];
        const impact = (name: string) => {
            expect(layer.active).toBe(true);
            expect(root.children[0].alpha).toBe(1);
            impacts.push(name);
        };
        const visuals = Object.assign(Object.create(CombatVisuals.prototype), {
            context: { getGridSettings: () => ({ getCellSize: () => 64 }) },
            petrifyingGazePops: layer,
            floatingTexts: [],
            preparePetrifyingGazePop: () => {},
            showFloatingDamage: () => impact("number"),
        });
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            sc_sceneSettings: { getGridSettings: () => ({}) },
            isSceneDestroyed: () => false,
            combatVisuals: visuals,
            delayReplay: time.delay,
            playUnitCombatSound: () => {},
            playReplayOneShot: async () => impact("hit"),
        });
        try {
            const pending = scene.presentPetrifyingGaze(
                { source: "petrifying_gaze", amount: 45, unitsDied: lethal ? 1 : 0 },
                { x: 0, y: 0 },
                unit,
                Promise.resolve(),
                lethal ? () => impact("death") : undefined,
            );
            await flush();
            await time.advance(PETRIFYING_GAZE_IMPACT_MS - 1);
            layer.update();
            expect(impacts).toEqual([]);
            await time.advance(1);
            expect(impacts).toEqual(["number", lethal ? "death" : "hit"]);
            expect(layer.active).toBe(true);
            expect(scene.pendingAbilityPresentations.size).toBe(1);
            await time.advance(PETRIFYING_GAZE_DURATION_MS - PETRIFYING_GAZE_IMPACT_MS);
            await pending;
            expect(layer.active).toBe(false);
            expect(scene.pendingAbilityPresentations.size).toBe(0);
        } finally {
            layer.clear();
            root.destroy({ children: true });
            atlas.destroy(true);
        }
    },
);

// The ordinary blow finishes first. Gaze's numbers, casualties and body reaction share its visible stare.
test.each([false, true].flatMap((lethal) => [false, true].map((preview) => ({ lethal, preview }))))(
    "gaze impact overlaps its head and waits for both tail and reaction; lethal=$lethal, preview=$preview",
    async ({ lethal, preview }) => {
        const time = controlledClock();
        let headVisible = false;
        const numbers = mock((_position: unknown, _amount: number, ..._rest: unknown[]) => {
            expect(headVisible).toBe(true);
        });
        let finishHit!: () => void, finishPrimary!: () => void;
        const extraHit = mock(
            () =>
                new Promise<void>((resolve) => {
                    finishHit = resolve;
                }),
        );
        const finishHead = mock(() => {
            headVisible = false;
        });
        const pop = mock(async (_unit: unknown, _presentation?: string) => {
            headVisible = true;
            return finishHead;
        });
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            isSceneDestroyed: () => false,
            sc_sceneSettings: { getGridSettings: () => ({}) },
            combatVisuals: { showFloatingDamage: numbers, spawnPetrifyingGazePop: pop },
            playReplayOneShot: extraHit,
            playUnitCombatSound: () => {},
            delayReplay: time.delay,
        });
        const casualties = mock((_n: number) => undefined),
            death = mock(() => {
                expect(headVisible).toBe(true);
            });
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
        const pending = scene.presentPetrifyingGaze(
            entry,
            { x: 0, y: 0 },
            unit,
            primary,
            lethal ? death : undefined,
            preview,
        );
        // Replaying the same recorded entry must not add a second number or another loss.
        await scene.presentPetrifyingGaze(entry, { x: 0, y: 0 }, unit);
        expect(pop).not.toHaveBeenCalled();
        expect(scene.pendingAbilityPresentations.size).toBe(1);
        expect(numbers).not.toHaveBeenCalled();
        expect(casualties).not.toHaveBeenCalled();
        await time.advance(PETRIFYING_GAZE_DURATION_MS + 200);
        expect(numbers).not.toHaveBeenCalled();
        expect(pop).not.toHaveBeenCalled();
        finishPrimary();
        await flush();
        expect(pop).toHaveBeenCalledTimes(1);
        expect(pop.mock.calls[0]?.[0]).toBe(unit);
        expect(pop.mock.calls[0]?.[1]).toBe(preview ? "preview" : undefined);
        await time.advance(PETRIFYING_GAZE_IMPACT_MS - 1);
        expect(numbers).not.toHaveBeenCalled();
        await time.advance(1);
        expect(numbers).toHaveBeenCalledTimes(1);
        expect(numbers.mock.calls[0]?.[1]).toBe(45);
        expect(casualties).toHaveBeenCalledWith(lethal ? 1 : 0);
        expect(death).toHaveBeenCalledTimes(lethal ? 1 : 0);
        expect(extraHit).toHaveBeenCalledTimes(lethal ? 0 : 1);
        expect(finishHead).not.toHaveBeenCalled();
        expect(scene.pendingAbilityPresentations.size).toBe(1);
        await time.advance(PETRIFYING_GAZE_DURATION_MS - PETRIFYING_GAZE_IMPACT_MS);
        if (!lethal) {
            // A slow body clip still owns the barrier after the head's finite tail.
            expect(scene.pendingAbilityPresentations.size).toBe(1);
            finishHit();
        }
        await pending;
        expect(scene.pendingAbilityPresentations.size).toBe(0);
        expect(finishHead).toHaveBeenCalledTimes(1);
    },
);

test.each(["destroy", "recovery"].flatMap((mode) => [false, true].map((duringPrimary) => ({ mode, duringPrimary }))))(
    "$mode during gaze presentation cancels delivery; primary=$duringPrimary",
    async ({ mode, duringPrimary }) => {
        let destroyed = false,
            finishPrimary!: () => void;
        const time = controlledClock();
        const numbers = mock(() => undefined),
            casualties = mock(() => undefined),
            death = mock(() => undefined);
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            isSceneDestroyed: () => destroyed,
            combatVisuals: { showFloatingDamage: numbers },
            delayReplay: time.delay,
        });
        const pending = scene.presentPetrifyingGaze(
            { source: "petrifying_gaze", amount: 45, unitsDied: 1 },
            { x: 0, y: 0 },
            { presentDamageCasualties: casualties },
            new Promise<void>((resolve) => {
                finishPrimary = resolve;
            }),
            death,
        );
        if (!duringPrimary) {
            finishPrimary();
            await flush();
        }
        if (mode === "destroy") destroyed = true;
        else scene.abilityPresentationEpoch = 1;
        if (duringPrimary) finishPrimary();
        else await time.advance(PETRIFYING_GAZE_IMPACT_MS);
        await pending;
        expect(numbers).not.toHaveBeenCalled();
        expect(casualties).not.toHaveBeenCalled();
        expect(death).not.toHaveBeenCalled();
        expect(scene.pendingAbilityPresentations.size).toBe(0);
    },
);

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
test("lab gaze preview follows the luck flag anchor and exposes explicit phase cleanup", async () => {
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

test("a missing cosmetic atlas cannot stall recorded gaze delivery or its finite tail", async () => {
    const calls: string[] = [];
    const time = controlledClock();
    let loaded!: (finish: () => void) => void;
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => ({}) },
        combatVisuals: {
            spawnPetrifyingGazePop: () =>
                new Promise<() => void>((resolve) => {
                    loaded = resolve;
                }),
            showFloatingDamage: () => calls.push("damage"),
        },
        delayReplay: time.delay,
        isSceneDestroyed: () => false,
        playReplayOneShot: async () => undefined,
    });
    const pending = scene.presentPetrifyingGaze(
        { source: "petrifying_gaze", amount: 12, unitsDied: 0, position: { x: 0, y: 0 } },
        { x: 0, y: 0 },
        { getVisualCenter: () => ({ x: 0, y: 0 }), getDamagePredictionAnchor: () => ({ x: 0, y: 0 }) },
        Promise.resolve(),
        undefined,
        false,
    );
    await flush();
    expect(calls).toEqual([]);
    await time.advance(PETRIFYING_GAZE_IMPACT_MS);
    expect(calls).toEqual(["damage"]);
    expect(scene.pendingAbilityPresentations.size).toBe(1);
    await time.advance(PETRIFYING_GAZE_DURATION_MS - PETRIFYING_GAZE_IMPACT_MS);
    await pending;
    expect(scene.pendingAbilityPresentations.size).toBe(0);
    // Even a callback resolving after scene delivery is cleaned up instead of resurrecting the head.
    loaded(() => calls.push("finish"));
    await flush();
    expect(calls).toEqual(["damage", "finish"]);
});

test("the replay watchdog budgets both barrel-bound releases before a unit volley", async () => {
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
    const events = [50, 80].map((x) => ({
        type: "obstacle_attacked",
        attackerId: "A",
        targetPosition: { x, y: 0 },
        hitsBefore: 8,
        hitsAfter: 8,
        animations: [],
    })) as GameEvent[];
    expect(
        await scene.playAuthoritativeActionRecord({ type: "range_attack", attackerId: "A", targetId: "B" }, events, {
            units: [],
        }),
    ).toBe(true);
    expect(timeouts).toEqual([15000]);
});
