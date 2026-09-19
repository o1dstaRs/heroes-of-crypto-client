import { describe, expect, test } from "bun:test";

import { Sandbox } from "./Sandbox";

/**
 * A melee counter is INFERRED here, from the hit points the attacker lost during the action — the engine
 * conveys a response only as damage. That is not evidence on its own: an attacker also loses hit points to
 * a Fire Wall on its approach, to an aura it stood in, or to a reflect. A Fairy carries Shadow Touch
 * ("the unit's attacks are not responded"), so the Wolf it struck lunged back on screen having never
 * retaliated (owner report 2026-09-19). The gate refuses the counters the rules never allowed.
 */
const unit = (id: string, options: { shadowTouch?: boolean; noMelee?: boolean; forcedTargetId?: string } = {}) => ({
    getId: () => id,
    getName: () => id,
    getPosition: () => ({ x: 0, y: 0 }),
    canSkipResponse: () => !!options.shadowTouch,
    hasAbilityActive: (name: string) => name === "No Melee" && !!options.noMelee,
    getTarget: () => options.forcedTargetId ?? "",
    cannotAttackUnitId: () => false,
    getAmountAlive: () => 10,
    // 10 creatures at 10 hp each, all healthy: 100 before, 70 after — a 30-point loss, 3 creatures.
    getCumulativeHp: () => 100,
    getMaxHp: () => 10,
});

/** The attacker lost 30 hit points across the action — by HP alone this reads as a counter. */
const recordWithAttackerLoss = (attackerId: string) => ({
    stateAfter: {
        units: [{ properties: { id: attackerId, amount_alive: 7, hp: 10, max_hp: 10 } }],
    },
});

const sceneWith = (attacker: ReturnType<typeof unit>) =>
    Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map([[attacker.getId(), attacker]]) },
        preDeferredActionUnitHp: undefined,
    });

const meleeEvent = { attackType: "melee", damage: { secondary: [] } };

describe("a replayed melee counter is only shown when the rules allow one", () => {
    test("a plain attacker's hit-point loss is still read as the defender's counter", () => {
        const attacker = unit("attacker");
        const scene = sceneWith(attacker);
        const retaliation = scene.getReplayRetaliationDamage(
            attacker,
            unit("defender"),
            meleeEvent,
            recordWithAttackerLoss("attacker"),
        );
        expect(retaliation).toEqual({ amount: 30, unitsDied: 3 });
    });

    test("a Shadow Touch attacker gets no counter, whatever it lost", () => {
        const attacker = unit("attacker", { shadowTouch: true });
        const scene = sceneWith(attacker);
        expect(
            scene.getReplayRetaliationDamage(
                attacker,
                unit("defender"),
                meleeEvent,
                recordWithAttackerLoss("attacker"),
            ),
        ).toBeUndefined();
    });

    test("a defender that cannot fight in melee never counters either", () => {
        const attacker = unit("attacker");
        const scene = sceneWith(attacker);
        expect(
            scene.getReplayRetaliationDamage(
                attacker,
                unit("defender", { noMelee: true }),
                meleeEvent,
                recordWithAttackerLoss("attacker"),
            ),
        ).toBeUndefined();
    });

    test("an Aggr lock on someone else denies the counter; one pointing at this attacker keeps it", () => {
        const attacker = unit("attacker");
        const scene = sceneWith(attacker);
        expect(
            scene.getReplayRetaliationDamage(
                attacker,
                unit("defender", { forcedTargetId: "someone-else" }),
                meleeEvent,
                recordWithAttackerLoss("attacker"),
            ),
        ).toBeUndefined();
        expect(
            scene.getReplayRetaliationDamage(
                attacker,
                unit("defender", { forcedTargetId: "attacker" }),
                meleeEvent,
                recordWithAttackerLoss("attacker"),
            ),
        ).toEqual({ amount: 30, unitsDied: 3 });
    });
});
