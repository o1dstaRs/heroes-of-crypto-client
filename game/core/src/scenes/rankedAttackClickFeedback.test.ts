import { expect, test } from "bun:test";
import type { GameAction } from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";

const setup = (baseCell = { x: 0, y: 0 }) => {
    const events: string[] = [];
    const attacker = {
        getId: () => "attacker",
        getName: () => "Orc",
        getPosition: () => ({ x: 0, y: 0 }),
        getBaseCell: () => baseCell,
        getAmountAlive: () => 10,
        getCumulativeHp: () => 100,
        getMaxHp: () => 10,
        getVisualCenter: () => ({ x: 0, y: 0 }),
        getAnimationTextureKey: () => "orc_attack_atlas",
        playOneShotAnimation: (state: string) => {
            events.push(`animation:${state}`);
            return true;
        },
        isPlayingOneShotAnimation: () => true,
        returnToIdleAnimation: () => events.push("idle"),
    };
    const target = {
        getId: () => "target",
        getPosition: () => ({ x: 100, y: 0 }),
        getAmountAlive: () => 10,
        getCumulativeHp: () => 100,
        getMaxHp: () => 10,
        getVisualCenter: () => ({ x: 100, y: 0 }),
    };
    const units = new Map<string, unknown>([
        ["attacker", attacker],
        ["target", target],
    ]);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => units },
        sc_sceneSettings: { getGridSettings: () => ({}) },
        createActionEngine: () => ({
            apply: () => {
                events.push("submitted");
                return { completed: true, events: [] };
            },
        }),
        prepareDirectionalAttackState: (_attacker: unknown, _target: unknown, melee: boolean) =>
            melee ? "melee_attack" : "attack",
        isSceneDestroyed: () => false,
        scheduleSceneTimeout: () => undefined,
        clearSceneTimeout: () => {},
        hoverManager: {
            clearHoverSilhouette: () => {},
            clearAttackVisuals: () => {},
            hoverAttackFromCell: undefined,
        },
        dungeonVisuals: { clearScatteredMountainHighlight: () => {} },
    }) as unknown as {
        submitActionForAuthoritativeReplay(action: GameAction): boolean;
        consumeDeferredAttackVisual(action: GameAction): void;
    };

    return { events, scene };
};

test("a deferred ranked ranged attack starts its local pose in the submission tick", () => {
    const { events, scene } = setup();

    const action = {
        type: "range_attack",
        attackerId: "attacker",
        targetId: "target",
    } satisfies GameAction;
    expect(scene.submitActionForAuthoritativeReplay(action)).toBe(true);
    expect(events).toEqual(["submitted", "animation:attack"]);

    scene.consumeDeferredAttackVisual(action);
    expect(events).toEqual(["submitted", "animation:attack", "idle"]);
});

test("a stationary ranked melee attack starts its local pose despite carrying attackFrom", () => {
    const { events, scene } = setup({ x: 3, y: 4 });
    const action = {
        type: "melee_attack",
        attackerId: "attacker",
        targetId: "target",
        attackFrom: { x: 3, y: 4 },
    } satisfies GameAction;

    expect(scene.submitActionForAuthoritativeReplay(action)).toBe(true);
    expect(events).toEqual(["submitted", "animation:melee_attack"]);
});

test("a moving ranked melee attack waits for its authoritative approach before swinging", () => {
    const { events, scene } = setup({ x: 0, y: 0 });
    const action = {
        type: "melee_attack",
        attackerId: "attacker",
        targetId: "target",
        attackFrom: { x: 3, y: 4 },
        path: [
            { x: 0, y: 0 },
            { x: 3, y: 4 },
        ],
    } satisfies GameAction;

    expect(scene.submitActionForAuthoritativeReplay(action)).toBe(true);
    expect(events).toEqual(["submitted"]);
});
