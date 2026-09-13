import { expect, test } from "bun:test";
import { Sandbox } from "./Sandbox";
import { orderCombatExchange, type CombatExchangeStrike } from "./sandbox/combat_exchange";

const strike = (response = false, hitIndex = 0, lethal = false): CombatExchangeStrike => ({
    attackerId: response ? "B" : "A",
    targetId: response ? "A" : "B",
    response,
    hitIndex,
    lethal,
    amount: 10,
    unitsDied: lethal ? 1 : 0,
});
const setup = () => {
    const unit = (id: string) => ({
        getId: () => id,
        getName: () => "Orc",
        getAnimationTextureKey: () => undefined,
        getVisualCenter: () => ({ x: id === "A" ? 0 : 100, y: 0 }),
        getDamagePredictionAnchor: () => ({ x: 0, y: 100 }),
    });
    const a = unit("A"),
        b = unit("B");
    const events: string[] = [],
        finish: (() => void)[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => ({}) },
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    ["A", a],
                    ["B", b],
                ]),
        },
        isSceneDestroyed: () => false,
        prepareDirectionalAttackState: () => "attack",
        waitForProjectileHitReaction: async () => true,
        offsetReplayDamagePosition: (to: unknown) => to,
        combatVisuals: { showFloatingDamage: () => events.push("damage") },
        playReplayOneShot: (unit: { getId(): string }, state: string) => {
            events.push(unit.getId() + ":" + state);
            return new Promise<void>((resolve) => finish.push(resolve));
        },
    });
    return { scene, a, b, events, finish };
};
const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

test("melee pairs start together; counter and double strike wait for both animations", async () => {
    const { scene, a, b, events, finish } = setup();
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "melee" },
        orderCombatExchange([strike(), strike(false, 1)], strike(true)),
        () => {},
    );
    await flush();
    expect(events).toEqual(["A:attack", "damage", "B:hit"]);
    finish.shift()!();
    await flush();
    expect(events).toHaveLength(3);
    finish.shift()!();
    await flush();
    expect(events.slice(3)).toEqual(["B:attack", "damage", "A:hit"]);
    finish.splice(0).forEach((fn) => fn());
    await flush();
    expect(events.slice(6)).toEqual(["A:attack", "damage", "B:hit"]);
    finish.splice(0).forEach((fn) => fn());
    await pending;
});
test("dying defender responds first and death starts with the lethal melee blow", async () => {
    const { scene, a, b, events, finish } = setup();
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "melee" },
        orderCombatExchange([strike(false, 0, true)], strike(true)),
        (unit: { getId(): string }) => events.push(unit.getId() + ":death"),
    );
    await flush();
    expect(events).toEqual(["B:attack", "damage", "A:hit"]);
    finish.splice(0).forEach((fn) => fn());
    await flush();
    expect(events.slice(3)).toEqual(["A:attack", "damage", "B:death"]);
    finish.splice(0).forEach((fn) => fn());
    await pending;
    expect(events).not.toContain("B:hit");
});
test("a ranged hit waits for projectile contact, and the next throw waits for the reaction", async () => {
    const { scene, a, b, events, finish } = setup();
    let contact!: () => void;
    let land!: () => void;
    scene.playReplayProjectile = (_a: unknown, _b: unknown, _pos: unknown, onImpact: () => void) => {
        events.push("projectile");
        contact = onImpact;
        return new Promise<void>((resolve) => (land = resolve));
    };
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "range" },
        orderCombatExchange([strike()], strike(true)),
        () => {},
    );
    await flush();
    expect(events).toEqual(["projectile"]);
    contact();
    land();
    await flush();
    expect(events).toEqual(["projectile", "damage", "B:hit"]);
    finish.shift()!();
    await flush();
    expect(events.at(-1)).toBe("projectile");
    contact();
    land();
    await flush();
    finish.shift()!();
    await pending;
    expect(events.slice(-2)).toEqual(["damage", "A:hit"]);
});

test("a removed replay victim uses its captured impact point without hitting a different figure", async () => {
    const { scene, a, b, events } = setup();
    const point = { x: 240, y: 180 };
    scene.preDeferredActionUnitHp = new Map([["removed", { visualCenter: point }]]);
    scene.playReplayProjectile = async (_a: unknown, _b: unknown, position: unknown, onImpact: () => void) => {
        expect(position).toEqual(point);
        onImpact();
    };
    await scene.playCombatExchange(a, b, { attackType: "range" }, [{ ...strike(), targetId: "removed" }], () =>
        events.push("death"),
    );
    expect(events).toEqual(["damage"]);
});

test("mutually lethal strikes complete before either figure can interrupt its own death", async () => {
    const { scene, a, b, events, finish } = setup();
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "melee" },
        orderCombatExchange([strike(false, 0, true)], strike(true, 0, true)),
        (unit: { getId(): string }) => events.push(unit.getId() + ":death"),
    );
    await flush();
    expect(events).toEqual(["B:attack", "damage"]);
    finish.shift()!();
    await flush();
    expect(events).toEqual(["B:attack", "damage", "A:attack", "damage", "B:death"]);
    finish.shift()!();
    await pending;
    expect(events.at(-1)).toBe("A:death");
    expect(events.filter((event) => event.endsWith(":death"))).toHaveLength(2);
});

test("an authored shooter's recovery must finish before the counter starts", async () => {
    const { scene, a, b, events, finish } = setup();
    let recover!: () => void;
    scene.waitForProjectileHitReaction = () =>
        new Promise<boolean>((resolve) => {
            recover = () => resolve(true);
        });
    scene.playReplayProjectile = async (_a: unknown, _b: unknown, _position: unknown, onImpact: () => void) => {
        events.push("projectile");
        onImpact();
    };
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "range" },
        orderCombatExchange([strike()], strike(true)),
        () => {},
    );
    await flush();
    finish.shift()!();
    await flush();
    expect(events.filter((event) => event === "projectile")).toHaveLength(1);
    recover();
    await flush();
    expect(events.filter((event) => event === "projectile")).toHaveLength(2);
    finish.shift()!();
    await flush();
    recover();
    await pending;
});
