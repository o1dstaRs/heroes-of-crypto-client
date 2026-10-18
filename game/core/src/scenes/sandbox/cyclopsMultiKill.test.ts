import { expect, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";
import { cyclopsMultiKillTargets } from "./cyclopsMultiKill";

const units = new Map([
    ["a", { getTeam: () => TeamVals.RIGHT }],
    ["b", { getTeam: () => TeamVals.RIGHT }],
    ["ally", { getTeam: () => TeamVals.LEFT }],
]);
const attacker = { getName: () => "Cyclops", getTeam: () => TeamVals.LEFT };
const hit = (unitId: string, unitsDied: number, extra = {}) => ({ unitId, unitsDied, amount: 100, ...extra });
const amounts = new Map([
    ["a", 10],
    ["b", 2],
    ["ally", 1],
]);
const dead = new Set(units.keys());

test("many dead creatures in one stack are not a multi-stack kill", () => {
    expect(cyclopsMultiKillTargets(attacker, [[hit("a", 10)]], amounts, dead, units).size).toBe(0);
});
test("both destroyed stacks qualify, while wounded stacks and allies do not", () => {
    expect(
        cyclopsMultiKillTargets(attacker, [[hit("a", 10), hit("b", 2), hit("ally", 1)]], amounts, dead, units),
    ).toEqual(new Set(["a", "b"]));
    expect(cyclopsMultiKillTargets(attacker, [[hit("a", 10), hit("b", 1)]], amounts, dead, units).size).toBe(0);
    expect(cyclopsMultiKillTargets(attacker, [[hit("a", 10), hit("ally", 1)]], amounts, dead, units).size).toBe(0);
});
test("multiple throws count separate stacks once and preserve each killing impact", () => {
    expect(
        cyclopsMultiKillTargets(attacker, [[hit("a", 4)], [hit("a", 6), hit("b", 2)]], amounts, dead, units),
    ).toEqual(new Set(["a", "b"]));
    expect(cyclopsMultiKillTargets(attacker, [[hit("a", 10)], [hit("a", 10)]], amounts, dead, units).size).toBe(0);
});
test.each([
    { label: "resurrection", hits: [hit("a", 10), hit("b", 2)], dead: new Set(["a"]) },
    { label: "later artifact explosion", hits: [hit("a", 10), hit("b", 1)], dead },
    { label: "miss", hits: [hit("a", 10), hit("b", 2, { missed: true })], dead },
    { label: "absorbed damage", hits: [hit("a", 10), hit("b", 2, { amount: 0 })], dead },
])("$label cannot supply the second direct kill", ({ hits, dead: deadIds }) => {
    expect(cyclopsMultiKillTargets(attacker, [hits], amounts, deadIds, units).size).toBe(0);
});
test("other ranged creatures and missing pre-hit amounts cannot claim the effect", () => {
    const waves = [[hit("a", 10), hit("b", 2)]];
    expect(
        cyclopsMultiKillTargets({ ...attacker, getName: () => "Gargantuan" }, waves, amounts, dead, units).size,
    ).toBe(0);
    expect(cyclopsMultiKillTargets(attacker, waves, new Map(), dead, units).size).toBe(0);
});
