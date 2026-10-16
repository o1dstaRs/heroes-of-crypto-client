import { expect, test } from "bun:test";
import { orderCombatExchange, type CombatExchangeStrike } from "./combat_exchange";
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
test("ordinary and double blows interleave the response", () => {
    expect(labels(orderCombatExchange([hit("A", "B")], hit("B", "A")))).toEqual(["A>B:0", "B>A:0"]);
    expect(labels(orderCombatExchange([hit("A", "B"), hit("A", "B", 1)], hit("B", "A")))).toEqual([
        "A>B:0",
        "B>A:0",
        "A>B:1",
    ]);
});
test("a first-blow lethal response is shown first, without hitting the corpse again", () => {
    expect(labels(orderCombatExchange([hit("A", "B", 0, true), hit("A", "B", 1)], hit("B", "A")))).toEqual([
        "B>A:0",
        "A>B:0†",
    ]);
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
