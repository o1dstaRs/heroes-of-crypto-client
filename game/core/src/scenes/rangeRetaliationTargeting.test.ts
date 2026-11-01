import { expect, test } from "bun:test";
import { Sandbox } from "./Sandbox";

test.each(["ember_covenant", "water_shield"])(
    "%s keeps a recorded zero-damage counter in the replay impact plan",
    (source) => {
        const attacker = { getId: () => "A", getPosition: () => ({ x: 0, y: 0 }) };
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            getReplayUnitDamage: () => ({ amount: 0, unitsDied: 0 }),
            takeFireWallBurn: () => ({}),
        });
        const event = {
            attackType: "range",
            damage: {
                secondary: [{ source, unitId: "screen", position: { x: 100, y: 0 }, amount: 47, unitsDied: 0 }],
            },
            animations: [
                { fromPosition: { x: 0, y: 0 }, toPosition: { x: 500, y: 0 }, affectedUnitId: "B" },
                { fromPosition: { x: 500, y: 0 }, toPosition: { x: 100, y: 0 }, affectedUnitId: "screen" },
            ],
        };
        expect(scene.getReplayRetaliationDamage(attacker, {}, event, { events: [] })).toEqual({
            amount: 0,
            unitsDied: 0,
        });
        scene.getReplayUnitDamage = () => ({ amount: 5, unitsDied: 0 });
        expect(scene.getReplayRetaliationDamage(attacker, {}, event, { events: [] })).toEqual({
            amount: 5,
            unitsDied: 0,
        });
        event.animations.pop();
        expect(scene.getReplayRetaliationDamage(attacker, {}, event, { events: [] })).toBeUndefined();
    },
);

test("the shared exchange targets the counter's actual screening victim by its origin", () => {
    const attacker = {
        getId: () => "A",
        getPosition: () => ({ x: 0, y: 0 }),
        hasAbilityActive: () => false,
        getAbility: () => undefined,
    };
    const defender = { getId: () => "B" };
    const event = {
        attackerId: "A",
        targetId: "B",
        attackType: "range",
        unitIdsDied: [],
        damage: { amount: 20, unitId: "B", hits: [{ amount: 20, unitsDied: 0 }] },
        animations: [
            { fromPosition: { x: 0, y: 0 }, toPosition: { x: 500, y: 0 }, affectedUnitId: "B" },
            { fromPosition: { x: 500, y: 0 }, toPosition: { x: 100, y: 0 }, affectedUnitId: "screen" },
        ],
    };
    const scene = Object.create(Sandbox.prototype);
    const plan = scene.buildCombatExchange(
        attacker,
        defender,
        event,
        new Map([
            ["A", 100],
            ["B", 100],
            ["screen", 100],
        ]),
        new Set(),
        { amount: 12, unitsDied: 0 },
    );
    expect(
        plan.map((strike: { attackerId: string; targetId: string }) => [strike.attackerId, strike.targetId]),
    ).toEqual([
        ["A", "B"],
        ["B", "screen"],
    ]);
    expect(plan[1].amount).toBe(12);
});

test("a defender killed by the first hit retains its simultaneous response", () => {
    const attacker = {
        getId: () => "A",
        getPosition: () => ({ x: 0, y: 0 }),
        hasAbilityActive: () => false,
        getAbility: () => undefined,
    };
    const defender = { getId: () => "B" };
    const scene = Object.create(Sandbox.prototype);
    const plan = scene.buildCombatExchange(
        attacker,
        defender,
        {
            attackerId: "A",
            targetId: "B",
            attackType: "melee",
            damage: { amount: 100, hits: [{ amount: 100, unitsDied: 10 }] },
            animations: [],
        },
        new Map([
            ["A", 100],
            ["B", 10],
        ]),
        new Set(["B"]),
        { amount: 4, unitsDied: 0 },
    );
    expect(plan.map((strike: { response: boolean; lethal: boolean }) => [strike.response, strike.lethal])).toEqual([
        [false, true],
        [true, false],
    ]);
});
