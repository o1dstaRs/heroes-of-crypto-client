import { expect, test } from "bun:test";
import { groupCombatExchange, orderCombatExchange, type CombatExchangeStrike } from "./combat_exchange";
const hit = (attackerId: string, targetId: string, hitIndex = 0, lethal = false): CombatExchangeStrike => ({
    attackerId,
    targetId,
    hitIndex,
    lethal,
    amount: 10,
    unitsDied: lethal ? 1 : 0,
    response: attackerId === "B",
});
const labels = (plan: CombatExchangeStrike[]) =>
    plan.map((strike) => `${strike.attackerId}>${strike.targetId}:${strike.hitIndex}${strike.lethal ? "†" : ""}`);
test("ordinary and double blows pair the response with the first strike", () => {
    expect(labels(orderCombatExchange([hit("A", "B")], hit("B", "A")))).toEqual(["A>B:0", "B>A:0"]);
    expect(labels(orderCombatExchange([hit("A", "B"), hit("A", "B", 1)], hit("B", "A")))).toEqual([
        "A>B:0",
        "B>A:0",
        "A>B:1",
    ]);
});
test("a first-blow kill keeps the simultaneous response without hitting the corpse again", () => {
    expect(labels(orderCombatExchange([hit("A", "B", 0, true), hit("A", "B", 1)], hit("B", "A")))).toEqual([
        "A>B:0†",
        "B>A:0",
    ]);
});
test("mutually lethal first strikes both survive the plan, with no second blow", () => {
    expect(labels(orderCombatExchange([hit("A", "B", 0, true), hit("A", "B", 1)], hit("B", "A", 0, true)))).toEqual([
        "A>B:0†",
        "B>A:0†",
    ]);
});
test("each strike has its own presentation group", () => {
    expect(
        groupCombatExchange(orderCombatExchange([hit("A", "B"), hit("A", "B", 1)], hit("B", "A"))).map(labels),
    ).toEqual([["A>B:0"], ["B>A:0"], ["A>B:1"]]);
    expect(groupCombatExchange(orderCombatExchange([hit("A", "B"), hit("A", "B", 1)])).map(labels)).toEqual([
        ["A>B:0"],
        ["A>B:1"],
    ]);
    expect(groupCombatExchange([])).toEqual([]);
    expect(orderCombatExchange([], hit("B", "A"))).toEqual([]);
});
test("a second-blow kill stays after the response; a killed attacker cannot strike twice", () => {
    expect(labels(orderCombatExchange([hit("A", "B"), hit("A", "B", 1, true)], hit("B", "A")))).toEqual([
        "A>B:0",
        "B>A:0",
        "A>B:1†",
    ]);
    expect(labels(orderCombatExchange([hit("A", "B"), hit("A", "B", 1)], hit("B", "A", 0, true)))).toEqual([
        "A>B:0",
        "B>A:0†",
    ]);
});
test("no response is invented and a second projectile may hit another living interceptor", () => {
    expect(labels(orderCombatExchange([hit("A", "B"), hit("A", "B", 1)]))).toEqual(["A>B:0", "A>B:1"]);
    expect(labels(orderCombatExchange([hit("A", "screen", 0, true), hit("A", "B", 1)], hit("B", "A")))).toEqual([
        "A>screen:0†",
        "B>A:0",
        "A>B:1",
    ]);
});

test("a doomed defender presents its recorded blow before the lethal answer", () => {
    expect(groupCombatExchange(orderCombatExchange([hit("A", "B", 0, true)], hit("B", "A"))).map(labels)).toEqual([
        ["B>A:0"],
        ["A>B:0†"],
    ]);
});
