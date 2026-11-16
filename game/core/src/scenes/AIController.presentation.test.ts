import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";

import { AIController, type IAIContext } from "./AIController";
import type { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";

const cleanup: (() => void)[] = [];
afterEach(() => {
    for (const dispose of cleanup.splice(0).reverse()) dispose();
});

function clock() {
    let now = 0;
    let nextId = 0;
    const timers = new Map<number, { at: number; callback: () => void }>();
    const set = spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, delay = 0) => {
        const id = ++nextId;
        timers.set(id, { at: now + delay, callback });
        return id;
    }) as typeof setTimeout);
    const clear = spyOn(globalThis, "clearTimeout").mockImplementation(((id: number) =>
        timers.delete(id)) as typeof clearTimeout);
    cleanup.push(() => {
        clear.mockRestore();
        set.mockRestore();
    });
    return {
        timers,
        async advance(ms: number) {
            const until = now + ms;
            for (;;) {
                const due = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                now = due[1].at;
                timers.delete(due[0]);
                due[1].callback();
                for (let i = 0; i < 5; i++) await Promise.resolve();
            }
            now = until;
        },
    };
}

function fixture() {
    const time = clock();
    let busy = false;
    let activation = "first-turn";
    const unit = {
        getId: () => "elf",
        getTeam: () => TeamVals.RIGHT,
        hasAbilityActive: () => false,
    } as unknown as RenderableUnit;
    const controller = new AIController({
        getCurrentActiveUnit: () => unit,
        getTurnActivationKey: () => activation,
        isActionPresentationBusy: () => busy,
        getButtonManager: () => ({ refreshButtons: () => {} }),
    } as unknown as IAIContext);
    controller.isAIActive = true;
    const perform = spyOn(controller, "performAction").mockImplementation(async () => {});
    cleanup.push(() => {
        controller.destroy();
        perform.mockRestore();
    });
    return {
        time,
        controller,
        perform,
        setBusy: (value: boolean) => {
            busy = value;
        },
        nextTurn: () => {
            activation = "second-turn";
        },
    };
}

test("AI cannot queue an action while the previous presentation remains busy", () => {
    const f = fixture();
    f.setBusy(true);
    expect(f.controller.shouldTriggerAI()).toBe(false);
    f.controller.triggerAIAction(100);
    expect(f.time.timers.size).toBe(0);
    f.setBusy(false);
    expect(f.controller.shouldTriggerAI()).toBe(true);
});

test("a queued AI delay rechecks presentation before acting and releases its guard for a later retry", async () => {
    const f = fixture();
    f.controller.triggerAIAction(100);
    f.setBusy(true);
    await f.time.advance(100);
    expect(f.perform).not.toHaveBeenCalled();
    f.setBusy(false);
    expect(f.controller.shouldTriggerAI()).toBe(true);
    f.controller.triggerAIAction(0);
    await f.time.advance(0);
    expect(f.perform).toHaveBeenCalledTimes(1);
});

test("a delayed action cannot spill into a later activation of the same stack", async () => {
    const f = fixture();
    f.controller.triggerAIAction(100);
    f.nextTurn();
    await f.time.advance(100);
    expect(f.perform).not.toHaveBeenCalled();
    expect(f.controller.shouldTriggerAI()).toBe(true);
});

test("timer throttling cannot make the watchdog queue a duplicate AI action", async () => {
    const f = fixture();
    f.controller.triggerAIAction(100);
    Object.assign(f.controller, { performingActionSinceMs: 1 });
    expect(f.controller.shouldTriggerAI()).toBe(false);
    expect(f.time.timers.size).toBe(1);
    await f.time.advance(100);
    expect(f.perform).toHaveBeenCalledTimes(1);
});

test("timeout takeover waits for visual completion without skipping the turn", async () => {
    const f = fixture();
    f.setBusy(true);
    const complete = mock(() => {});
    expect(f.controller.forceCurrentTurn(0, complete)).toBe(true);
    await f.time.advance(96);
    expect(f.perform).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    Object.assign(f.controller, { performingActionSinceMs: 1 });
    f.setBusy(false);
    expect(f.controller.shouldTriggerAI()).toBe(false);
    await f.time.advance(16);
    expect(f.perform).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
});

test("destroying the scene cancels a timeout takeover waiting on animations", async () => {
    const f = fixture();
    f.setBusy(true);
    f.controller.forceCurrentTurn(0);
    await f.time.advance(16);
    f.controller.destroy();
    f.setBusy(false);
    await f.time.advance(100);
    expect(f.perform).not.toHaveBeenCalled();
    expect(f.time.timers.size).toBe(0);
});

test("the Sandbox AI barrier includes projectiles, living reactions and removed-unit death animations", () => {
    let projectile = false;
    let reaction = false;
    let death = false;
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_moveBlocked: false,
        replayPlaybackActive: false,
        sc_isAnimating: false,
        isActiveUnitMoving: false,
        moveAnimManager: { isMoving: () => false },
        rangedProjectiles: { hasActive: () => projectile },
        unitsHolder: { getAllUnits: () => new Map([["victim", { isPlayingOneShotAnimation: () => reaction }]]) },
        dyingVisualUnits: new Set([{ isPlayingOneShotAnimation: () => death }]),
    }) as { isAiActionPresentationBusy(): boolean; sc_moveBlocked: boolean };
    expect(scene.isAiActionPresentationBusy()).toBe(false);
    projectile = true;
    expect(scene.isAiActionPresentationBusy()).toBe(true);
    projectile = false;
    reaction = true;
    expect(scene.isAiActionPresentationBusy()).toBe(true);
    reaction = false;
    death = true;
    expect(scene.isAiActionPresentationBusy()).toBe(true);
    death = false;
    scene.sc_moveBlocked = true;
    expect(scene.isAiActionPresentationBusy()).toBe(true);
    scene.sc_moveBlocked = false;
    expect(scene.isAiActionPresentationBusy()).toBe(false);
});
