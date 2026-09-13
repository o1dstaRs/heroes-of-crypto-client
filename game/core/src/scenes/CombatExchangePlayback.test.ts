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
        getUnitProperties: () => ({ level: 1 }),
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

test("higher tiers retain their existing lunge and knockback within the serial exchange", async () => {
    const { scene, a, b, events, finish } = setup();
    a.getUnitProperties = () => ({ level: 3 });
    b.getUnitProperties = () => ({ level: 4 });
    scene.applyReplayLunge = () => events.push("lunge");
    scene.applyReplayHitKnockback = () => events.push("knockback");
    scene.delayReplay = async () => {};
    const pending = scene.playCombatExchange(a, b, { attackType: "melee" }, [strike()], () => {});
    await flush();
    expect(events).toEqual(["A:attack", "lunge", "damage", "B:hit", "knockback"]);
    finish.splice(0).forEach((fn) => fn());
    await pending;
});

test("snapshot reconciliation and full hydration preserve an in-flight authored death", () => {
    for (const fullHydration of [false, true]) {
        const { scene, a, events } = setup();
        const units = new Map([["A", a]]);
        Object.assign(a, {
            getAttackRange: () => 1,
            isSmallSize: () => true,
            destroyVisuals: () => events.push("destroy"),
        });
        Object.assign(scene, {
            dyingVisualUnits: new Set([a]),
            unitsHolder: {
                getAllUnits: () => units,
                deleteUnitById: (id: string) => units.delete(id),
                refreshStackPowerForAllUnits: () => {},
            },
            grid: { cleanupAll: () => {}, getMatrix: () => [], getMatrixNoUnits: () => [] },
            refreshUnits: () => {},
        });
        if (fullHydration) scene.destroySpecificUnits([a], true, false);
        else scene.reconcileGhostUnits(new Set());
        expect(units.size).toBe(0);
        expect(events).not.toContain("destroy");
        expect(scene.dyingVisualUnits.has(a)).toBe(true);
    }
});

test("Double Throw preserves both recorded projectile impacts", () => {
    const { scene, a, b } = setup();
    Object.assign(a, {
        getPosition: () => ({ x: 0, y: 0 }),
        hasAbilityActive: () => false,
        getAbility: (name: string) => (name === "Double Throw" ? {} : undefined),
    });
    const plan = scene.buildCombatExchange(
        a,
        b,
        {
            attackerId: "A",
            targetId: "B",
            attackType: "range",
            damage: {
                amount: 10,
                hits: [
                    { amount: 10, unitsDied: 1 },
                    { amount: 5, unitsDied: 1 },
                ],
            },
            animations: [0, 1].map(() => ({
                affectedUnitId: "B",
                fromPosition: { x: 0, y: 0 },
                toPosition: { x: 100, y: 0 },
            })),
        },
        new Map([["B", 10]]),
        new Set(),
    );
    expect(plan.map((hit: CombatExchangeStrike) => hit.amount)).toEqual([10, 5]);
});
