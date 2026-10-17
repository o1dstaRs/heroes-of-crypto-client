import { expect, test } from "bun:test";
import { Sandbox } from "./Sandbox";
import { OneInTheFieldTriggers } from "./sandbox/OneInTheFieldTriggers";
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
        hasAbilityActive: () => false,
        isDead: () => false,
        isPlayingOneShotAnimation: () => false,
        getAnimationTextureKey: (_state: string): string | undefined => undefined,
        getVisualCenter: () => ({ x: id === "A" ? 0 : 100, y: 0 }),
        getDamagePredictionAnchor: () => ({ x: 0, y: 100 }),
    });
    const a = unit("A"),
        b = unit("B");
    const events: string[] = [],
        finish: (() => void)[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        oneInTheFieldTriggers: new OneInTheFieldTriggers(),
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
    for (let i = 0; i < 20; i++) await Promise.resolve();
};

test("melee attacks and counters start together; double strike waits for both attacks and reactions", async () => {
    const { scene, a, b, events, finish } = setup();
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "melee" },
        orderCombatExchange([strike(), strike(false, 1)], strike(true)),
        () => {},
    );
    await flush();
    expect(events).toEqual(["A:attack", "damage", "B:attack", "damage"]);
    const [finishA, finishB] = finish.splice(0);
    finishA();
    await flush();
    expect(events.slice(4)).toEqual(["A:hit"]);
    finishB();
    await flush();
    expect(events.slice(4)).toEqual(["A:hit", "B:hit"]);
    const [finishAHit, finishBHit] = finish.splice(0);
    finishBHit();
    await flush();
    expect(events).toHaveLength(6);
    finishAHit();
    await flush();
    expect(events.slice(6)).toEqual(["A:attack", "damage", "B:hit"]);
    finish.splice(0).forEach((fn) => fn());
    await pending;
});
test.each([
    { primaryLethal: true, counterLethal: false },
    { primaryLethal: false, counterLethal: true },
    { primaryLethal: true, counterLethal: true },
])(
    "lethal melee remains simultaneous: primary=$primaryLethal counter=$counterLethal",
    async ({ primaryLethal, counterLethal }) => {
        const { scene, a, b, events, finish } = setup();
        const pending = scene.playCombatExchange(
            a,
            b,
            { attackType: "melee" },
            orderCombatExchange([strike(false, 0, primaryLethal), strike(false, 1)], strike(true, 0, counterLethal)),
            (unit: { getId(): string }) => events.push(unit.getId() + ":death"),
        );
        await flush();
        expect(events).toEqual(["A:attack", "damage", "B:attack", "damage"]);
        const [finishA, finishB] = finish.splice(0);
        finishA();
        await flush();
        expect(events.slice(4)).toEqual([counterLethal ? "A:death" : "A:hit"]);
        finishB();
        await flush();
        expect(events.slice(5)).toEqual([primaryLethal ? "B:death" : "B:hit"]);
        finish.splice(0).forEach((fn) => fn());
        const deaths = await pending;
        expect([...deaths].sort()).toEqual([...(counterLethal ? ["A"] : []), ...(primaryLethal ? ["B"] : [])]);
        expect(events.filter((event) => event.endsWith(":attack"))).toHaveLength(2);
    },
);
test("ranged attack and counter fly together; contacts own damage and double shot waits for the exchange", async () => {
    const { scene, a, b, events, finish } = setup();
    const flights: { contact: () => void; land: () => void }[] = [];
    scene.playReplayProjectile = (source: { getId(): string }, _b: unknown, _pos: unknown, onImpact: () => void) => {
        events.push(source.getId() + ":projectile");
        return new Promise<void>((resolve) => flights.push({ contact: onImpact, land: resolve }));
    };
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "range" },
        orderCombatExchange([strike(), strike(false, 1)], strike(true)),
        () => {},
    );
    await flush();
    expect(events).toEqual(["A:projectile", "B:projectile"]);
    // The counter may arrive first because it has a different release frame or travel distance.
    flights[1].contact();
    flights[1].land();
    await flush();
    expect(events).toEqual(["A:projectile", "B:projectile", "damage"]);
    flights[0].contact();
    await flush();
    expect(events.slice(3)).toEqual(["damage", "B:hit"]);
    flights[0].land();
    await flush();
    expect(events.at(-1)).toBe("A:hit");
    expect(flights).toHaveLength(2);
    finish.splice(0).forEach((fn) => fn());
    await flush();
    expect(events.at(-1)).toBe("A:projectile");
    expect(flights).toHaveLength(3);
    flights[2].contact();
    flights[2].land();
    await flush();
    finish.splice(0).forEach((fn) => fn());
    await pending;
    expect(events.slice(-2)).toEqual(["damage", "B:hit"]);
});

test("both combatants' textures are ready before either attack starts", async () => {
    const { scene, a, b, events, finish } = setup();
    a.getAnimationTextureKey = (state: string) => (state === "attack" ? "A:atlas" : undefined);
    b.getAnimationTextureKey = (state: string) => (state === "attack" ? "B:atlas" : undefined);
    let loadB!: () => void;
    scene.waitForTexture = (key: string) =>
        key === "A:atlas"
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                  loadB = resolve;
              });
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "melee" },
        orderCombatExchange([strike()], strike(true)),
        () => {},
    );
    await flush();
    expect(events).toEqual([]);
    loadB();
    await flush();
    expect(events).toEqual(["A:attack", "damage", "B:attack", "damage"]);
    finish.splice(0).forEach((fn) => fn());
    await flush();
    finish.splice(0).forEach((fn) => fn());
    await pending;
});

test.each([false, true])("scene teardown discards deferred hit/death reactions, lethal=%s", async (lethal) => {
    const { scene, a, b, events, finish } = setup();
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "melee" },
        orderCombatExchange([strike(false, 0, lethal)], strike(true, 0, lethal)),
        (unit: { getId(): string }) => events.push(unit.getId() + ":death"),
    );
    await flush();
    expect(events).toEqual(["A:attack", "damage", "B:attack", "damage"]);
    scene.isSceneDestroyed = () => true;
    finish.splice(0).forEach((resolve) => resolve());
    await pending;
    expect(events).toEqual(["A:attack", "damage", "B:attack", "damage"]);
});

test("an intercepted counter starts alongside the attack and reacts on the screening unit", async () => {
    const { scene, a, b, events, finish } = setup();
    const screen = { ...a, getId: () => "screen" };
    const units = new Map([
        ["A", a],
        ["B", b],
        ["screen", screen],
    ]);
    scene.unitsHolder.getAllUnits = () => units;
    const flights: { contact: () => void; land: () => void }[] = [];
    scene.playReplayProjectile = (
        source: { getId(): string },
        victim: { getId(): string },
        _position: unknown,
        onImpact: () => void,
    ) => {
        events.push(`${source.getId()}>${victim.getId()}`);
        return new Promise<void>((resolve) => flights.push({ contact: onImpact, land: resolve }));
    };
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "range" },
        orderCombatExchange([strike()], { ...strike(true), targetId: "screen" }),
        () => {},
    );
    await flush();
    expect(events).toEqual(["A>B", "B>screen"]);
    flights[1].contact();
    expect(events.slice(2)).toEqual(["damage", "screen:hit"]);
    flights[1].land();
    flights[0].contact();
    flights[0].land();
    await flush();
    finish.splice(0).forEach((resolve) => resolve());
    await pending;
    expect(events).not.toContain("A:hit");
    expect(events.filter((entry) => entry.endsWith(":hit"))).toEqual(["screen:hit", "B:hit"]);
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

test("each melee blow sounds once, with a hurt reaction on actual contact including lethal blows", async () => {
    const { scene, a, b, finish } = setup();
    const sounds: string[] = [];
    scene.playUnitCombatSound = (unit: { getId(): string }, role: string) => sounds.push(unit.getId() + ":" + role);
    const pending = scene.playCombatExchange(a, b, { attackType: "melee" }, [strike(false, 0, true)], () => {});
    await flush();
    expect(sounds).toEqual(["A:attack", "B:hurt"]);
    finish.splice(0).forEach((fn) => fn());
    await pending;
});

test("a miss has an attack sound but no hurt reaction", async () => {
    const { scene, a, b, finish } = setup();
    scene.showAttackMissedVfx = () => {};
    const sounds: string[] = [];
    scene.playUnitCombatSound = (unit: { getId(): string }, role: string) => sounds.push(unit.getId() + ":" + role);
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "melee" },
        [{ ...strike(), amount: 0, missed: true }],
        () => {},
    );
    await flush();
    expect(sounds).toEqual(["A:attack"]);
    finish.splice(0).forEach((fn) => fn());
    await pending;
});

test("ranged hurt audio waits for projectile contact", async () => {
    const { scene, a, b, finish } = setup();
    const sounds: string[] = [];
    let contact!: () => void;
    let land!: () => void;
    scene.playUnitCombatSound = (unit: { getId(): string }, role: string) => sounds.push(unit.getId() + ":" + role);
    scene.playReplayProjectile = (_a: unknown, _b: unknown, _pos: unknown, onImpact: () => void) => {
        contact = onImpact;
        return new Promise<void>((resolve) => {
            land = resolve;
        });
    };
    const pending = scene.playCombatExchange(a, b, { attackType: "range" }, [strike()], () => {});
    await flush();
    expect(sounds).toEqual([]);
    contact();
    land();
    await flush();
    expect(sounds).toEqual(["B:hurt"]);
    finish.splice(0).forEach((fn) => fn());
    await pending;
});
