import { expect, test } from "bun:test";
import { Sandbox } from "./Sandbox";

const unit = (id: string, team: number, name: string, suppressResponse = false) => ({
    getId: () => id,
    getTeam: () => team,
    getName: () => name,
    getPosition: () => ({ x: team === 1 ? 0 : 100, y: 0 }),
    canSkipResponse: () => suppressResponse,
    hasAbilityActive: (ability: string) => name === "Hydra" && ability === "Lightning Spin",
    getTarget: () => "",
    cannotAttackUnitId: () => false,
    getAmountAlive: () => 10,
    getCumulativeHp: () => 100,
    getMaxHp: () => 10,
});

test.each(["Hydra", "Arachna Queen"])(
    "%s's recorded spin supplies the missing response pose without adding a second physical hit",
    (name) => {
        const attacker = unit("attacker", 1, "Orc"),
            defender = unit("defender", 2, name);
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            unitsHolder: {
                getAllUnits: () =>
                    new Map([
                        [attacker.getId(), attacker],
                        [defender.getId(), defender],
                    ]),
            },
        });
        const event = {
            attackType: "melee",
            targetId: defender.getId(),
            damage: {
                amount: 10,
                hits: [{ amount: 10, unitsDied: 1 }],
                secondary: [
                    {
                        source: "lightning_spin",
                        unitId: attacker.getId(),
                        position: { x: 0, y: 0 },
                        amount: 30,
                        unitsDied: 3,
                    },
                ],
            },
        };
        const record = {
            events: [],
            stateAfter: { units: [{ properties: { id: attacker.getId(), amount_alive: 7, hp: 10, max_hp: 10 } }] },
        };
        // All HP loss belongs to the radial sweep. Inferring a second ordinary hit would double it.
        const response = scene.getReplayRetaliationDamage(attacker, defender, event, record);
        expect(response).toBeUndefined();
        for (const supplied of [undefined, { amount: 0, unitsDied: 0 }]) {
            // Both the live engine path and replay use this builder, with optional HP-diff evidence.
            const plan = scene.buildCombatExchange(
                attacker,
                defender,
                event,
                new Map([
                    ["attacker", 10],
                    ["defender", 10],
                ]),
                new Set(),
                supplied,
            );
            expect(plan).toHaveLength(2);
            expect(plan[1]).toMatchObject({
                attackerId: "defender",
                targetId: "attacker",
                response: true,
                amount: 0,
                unitsDied: 0,
            });
        }
    },
);

test.each([
    { source: "lightning_spin", victim: "attacker", attackType: "melee", suppress: false, counter: true, amount: 0 },
    { source: "lightning_spin", victim: "defender", attackType: "melee", suppress: false, counter: false, amount: 30 },
    { source: "lightning_spin", victim: "attacker", attackType: "melee", suppress: true, counter: false, amount: 30 },
    { source: "fire_shield", victim: "attacker", attackType: "melee", suppress: false, counter: false, amount: 30 },
    { source: "flesh_shield", victim: "attacker", attackType: "melee", suppress: false, counter: false, amount: 30 },
])(
    "spin counter evidence respects contact and retaliation rules: $source/$victim/suppressed=$suppress",
    ({ source, victim, attackType, suppress, counter, amount }) => {
        const attacker = unit("attacker", 1, "Orc", suppress),
            defender = unit("defender", 2, "Hydra");
        const scene = Object.create(Sandbox.prototype);
        const event = {
            attackType,
            targetId: "defender",
            damage: {
                amount: 10,
                hits: [{ amount: 10, unitsDied: 0 }],
                secondary: [{ source, unitId: victim, position: { x: 0, y: 0 }, amount, unitsDied: 0 }],
            },
        };
        const plan = scene.buildCombatExchange(attacker, defender, event, new Map(), new Set());
        expect(plan.filter((hit: { response: boolean }) => hit.response)).toHaveLength(counter ? 1 : 0);
    },
);
