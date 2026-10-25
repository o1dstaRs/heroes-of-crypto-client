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
        getTeam: () => (id === "A" ? 1 : 2),
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

test.each([
    { active: true, missed: false, amount: 10, lethal: false, response: false, expected: true },
    { active: false, missed: false, amount: 10, lethal: false, response: false, expected: false },
    { active: true, missed: true, amount: 0, lethal: false, response: false, expected: false },
    { active: true, missed: false, amount: 0, lethal: false, response: false, expected: false },
    { active: true, missed: false, amount: 10, lethal: true, response: false, expected: false },
    { active: true, missed: false, amount: 10, lethal: false, response: true, expected: false },
])("Shadow Touch marks the surviving victim immediately after damage: %j", async (options) => {
    const { scene, a, b, events, finish } = setup();
    a.hasAbilityActive = (name?: string) => options.active && name === "Shadow Touch";
    scene.combatVisuals.prepareCommonFlagPop = () => undefined;
    scene.combatVisuals.spawnCommonFlagPop = (unit: typeof a, kind: string) => events.push(`${unit.getId()}:${kind}`);
    scene.showAttackMissedVfx = () => events.push("miss");
    const plan: CombatExchangeStrike[] = [
        { ...strike(false, 0, options.lethal), amount: options.amount, missed: options.missed },
    ];
    if (options.response) plan.push(strike(true));
    const pending = scene.playCombatExchange(a, b, { attackType: "melee" }, plan, () => {});
    await flush();
    const popIndex = events.indexOf("B:shadow_touch");
    expect(popIndex >= 0).toBe(options.expected);
    expect(events).not.toContain("A:shadow_touch");
    if (options.expected) {
        expect(events[popIndex - 1]).toBe("damage");
        expect(events).not.toContain("B:attack");
    }
    for (let i = 0; i < 5; i++) {
        finish.splice(0).forEach((resolve) => resolve());
        await flush();
    }
    await pending;
});

test.each(["melee", "range"])(
    "%s extra strikes pop above their source without delaying attacks",
    async (attackType) => {
        const { scene, a, b, events, finish } = setup();
        // An unresolved effect preload must never hold up either combatant or any later strike.
        scene.combatVisuals.prepareCommonFlagPop = () => new Promise(() => {});
        scene.combatVisuals.spawnCommonFlagPop = (unit: typeof a, kind: string) =>
            events.push(`${unit.getId()}:${kind}`);
        scene.playReplayProjectile = (unit: typeof a) => {
            events.push(`${unit.getId()}:projectile`);
            return new Promise<void>((resolve) => finish.push(resolve));
        };
        const pending = scene.playCombatExchange(
            a,
            b,
            { attackType },
            orderCombatExchange([strike(), strike(false, 1), strike(false, 2), strike(false, 3)], strike(true)),
            () => {},
        );
        await flush();
        expect(events.filter((event) => event.endsWith(":multi_attack"))).toHaveLength(0);
        for (let i = 0; i < 10; i++) {
            finish.splice(0).forEach((resolve) => resolve());
            await flush();
        }
        await pending;
        expect(events.filter((event) => event.endsWith(":multi_attack"))).toEqual(Array(3).fill("A:multi_attack"));
        for (const [i, event] of events.entries()) {
            if (event === "A:multi_attack")
                expect(events[i + 1]).toBe(attackType === "melee" ? "A:attack" : "A:projectile");
        }
    },
);

test.each(
    ["melee", "range"].flatMap((attackType) =>
        ["ember_covenant", "water_shield"].map((source) => ({ attackType, source })),
    ),
)(
    "$source appears at $attackType contact, before recovery, with no delayed duplicate",
    async ({ attackType, source }) => {
        const { scene, a, b, events, finish } = setup();
        const contacts: (() => void)[] = [];
        const landings: (() => void)[] = [];
        scene.combatVisuals.showFloatingAbsorbed = () => events.push("absorbed");
        scene.scheduleSceneTimeout = () => {
            throw new Error("Covenant must not schedule a delayed label");
        };
        scene.playReplayProjectile = (_a: unknown, _b: unknown, _pos: unknown, impact: () => void) => {
            contacts.push(impact);
            return new Promise<void>((resolve) => landings.push(resolve));
        };
        const damage = {
            secondary: [{ source, unitId: "B", position: { x: 100, y: 0 }, amount: 47, unitsDied: 0 }],
        };
        const pending = scene.playCombatExchange(a, b, { attackType, damage }, [{ ...strike(), amount: 0 }], () => {});
        await flush();
        if (attackType === "range") {
            expect(events).not.toContain("absorbed");
            contacts[0]();
            contacts[0]();
        }
        expect(events.filter((event) => event === "absorbed")).toHaveLength(1);
        landings.forEach((land) => land());
        finish.splice(0).forEach((done) => done());
        await pending;
        scene.showShieldAbsorbs(damage.secondary, { x: 0, y: 0 });
        expect(events.filter((event) => event === "absorbed")).toHaveLength(1);
    },
);

test.each([
    { attackType: "melee", missed: false },
    { attackType: "melee", missed: true },
    { attackType: "range", missed: false },
])(
    "an unassigned absorb appears at $attackType contact without recovery, initiating miss=$missed",
    async ({ attackType, missed }) => {
        const { scene, a, b, events, finish } = setup();
        let contact!: () => void;
        let land!: () => void;
        scene.combatVisuals.showFloatingAbsorbed = () => events.push("absorbed");
        scene.showAttackMissedVfx = () => {};
        scene.playReplayProjectile = (_a: unknown, _b: unknown, _pos: unknown, impact: () => void) => {
            contact = impact;
            return new Promise<void>((resolve) => {
                land = resolve;
            });
        };
        const damage = {
            secondary: [{ source: "ember_covenant", unitId: "A", position: { x: 0, y: 0 }, amount: 19, unitsDied: 0 }],
        };
        const pending = scene.playCombatExchange(
            a,
            b,
            { attackType, damage },
            [{ ...strike(), missed, amount: missed ? 0 : 10 }],
            () => {},
        );
        await flush();
        if (attackType === "range") {
            expect(events).not.toContain("absorbed");
            contact();
        }
        expect(events.filter((event) => event === "absorbed")).toHaveLength(1);
        land?.();
        finish.splice(0).forEach((done) => done());
        await pending;
        scene.showShieldAbsorbs(damage.secondary, { x: 100, y: 0 });
        expect(events.filter((event) => event === "absorbed")).toHaveLength(1);
    },
);

test.each([false, true])(
    "a fully absorbed counter owns its projectile contact, counter first=%s",
    async (counterFirst) => {
        const { scene, a, b, finish } = setup();
        const shown: number[] = [];
        const flights: { contact(): void; land(): void }[] = [];
        scene.combatVisuals.showFloatingAbsorbed = (_position: unknown, amount: number) => shown.push(amount);
        scene.playReplayProjectile = (_a: unknown, _b: unknown, _position: unknown, contact: () => void) =>
            new Promise<void>((land) => flights.push({ contact, land }));
        const damage = {
            secondary: [{ source: "ember_covenant", unitId: "A", position: { x: 0, y: 0 }, amount: 47, unitsDied: 0 }],
        };
        const pending = scene.playCombatExchange(
            a,
            b,
            { attackType: "range", damage },
            [strike(), { ...strike(true), amount: 0 }],
            () => {},
        );
        await flush();
        expect(flights).toHaveLength(2);
        expect(shown).toEqual([]);
        const first = counterFirst ? 1 : 0;
        flights[first].contact();
        expect(shown).toEqual(counterFirst ? [47] : []);
        flights[1 - first].contact();
        expect(shown).toEqual([47]);
        flights.forEach((flight) => flight.land());
        await flush();
        finish.splice(0).forEach((done) => done());
        await pending;
        scene.showShieldAbsorbs(damage.secondary, { x: 0, y: 0 });
        expect(shown).toEqual([47]);
    },
);

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

test.each([
    { attackType: "melee", missed: false, amount: 10, response: false, expected: "B" },
    { attackType: "melee", missed: false, amount: 10, response: true, expected: "A" },
    { attackType: "range", missed: false, amount: 10, response: false, expected: undefined },
    { attackType: "melee", missed: true, amount: 0, response: false, expected: "B" },
    { attackType: "melee", missed: false, amount: 0, response: false, expected: "B" },
])(
    "Penetrating Bite appears over the victim when the attack starts, including counters and misses: %j",
    async ({ attackType, missed, amount, response, expected }) => {
        const { scene, a, b, events, finish } = setup();
        (response ? b : a).hasAbilityActive = (name?: string) => name === "Penetrating Bite";
        const pops: string[] = [];
        scene.combatVisuals.spawnCommonFlagPop = (unit: typeof a, kind: string) => {
            pops.push(`${unit.getId()}:${kind}`);
            events.push(`${unit.getId()}:${kind}`);
        };
        scene.combatVisuals.prepareCommonFlagPop = () => undefined;
        scene.playReplayProjectile = () => Promise.resolve();
        scene.showAttackMissedVfx = () => undefined;
        const pending = scene.playCombatExchange(
            a,
            b,
            { attackType },
            [{ ...strike(response), missed, amount }],
            () => {},
        );
        await flush();
        for (let i = 0; i < 10; i++) {
            finish.splice(0).forEach((resolve) => resolve());
            await flush();
        }
        await pending;
        expect(pops).toEqual(expected ? [`${expected}:penetrating_bite`] : []);
        if (expected) {
            const start = events.indexOf(`${expected}:penetrating_bite`);
            expect(events[start + 1]).toBe(`${response ? "B" : "A"}:attack`);
        }
    },
);

test.each([
    { landed: true, resisted: false, missed: false, lethal: false, response: false, active: true, expected: true },
    { landed: false, resisted: false, missed: false, lethal: false, response: false, active: true, expected: false },
    { landed: true, resisted: true, missed: false, lethal: false, response: false, active: true, expected: false },
    { landed: true, resisted: false, missed: true, lethal: false, response: false, active: true, expected: false },
    { landed: true, resisted: false, missed: false, lethal: true, response: false, active: true, expected: false },
    { landed: true, resisted: false, missed: false, lethal: false, response: true, active: true, expected: true },
    { landed: true, resisted: false, missed: false, lethal: false, response: false, active: false, expected: false },
])("Terrifying Gaze appears on its confirmed victim during the attack, never after recovery: %j", async (options) => {
    const { scene, a, b, events, finish } = setup();
    const source = options.response ? b : a;
    const victim = options.response ? a : b;
    source.hasAbilityActive = (name?: string) => options.active && name === "Terrifying Gaze";
    scene.combatVisuals.prepareTerrifyingGazePop = async () => {
        events.push("gaze:ready");
    };
    scene.combatVisuals.spawnTerrifyingGazePop = (unit: typeof a) => events.push(`${unit.getId()}:gaze`);
    scene.showAttackMissedVfx = () => {};
    const applications = options.landed
        ? [
              {
                  type: "effects_applied",
                  applications: [
                      { unitId: victim.getId(), name: "Terrifying Gaze", kind: "effect", resisted: options.resisted },
                      { unitId: "unrelated", name: "Terrifying Gaze", kind: "effect", resisted: false },
                  ],
              },
          ]
        : [];
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "melee" },
        [
            {
                ...strike(options.response, 0, options.lethal),
                missed: options.missed,
            },
        ],
        () => {},
        undefined,
        applications,
    );
    await flush();
    const cue = `${victim.getId()}:gaze`;
    expect(events.includes(cue)).toBe(options.expected);
    if (options.expected) {
        expect(events.indexOf("gaze:ready")).toBeLessThan(events.indexOf(`${source.getId()}:attack`));
        expect(events.indexOf(cue)).toBe(events.indexOf(`${source.getId()}:attack`) + 1);
        expect(finish.length).toBeGreaterThan(0);
    }
    for (let i = 0; i < 3; i++) {
        finish.splice(0).forEach((fn) => fn());
        await flush();
    }
    await pending;
    expect(events.filter((event) => event === cue)).toHaveLength(options.expected ? 1 : 0);
});

test.each([false, true])("Covenant absorbs wait for their own contact, first shot missed=%s", async (firstMissed) => {
    const { scene, a, b } = setup();
    const shown: number[] = [];
    const flights: { contact(): void; land(): void }[] = [];
    scene.combatVisuals.showFloatingAbsorbed = (_pos: unknown, amount: number) => shown.push(amount);
    scene.showAttackMissedVfx = () => {};
    scene.playReplayProjectile = (_a: unknown, _b: unknown, _pos: unknown, contact: () => void) =>
        new Promise<void>((land) => flights.push({ contact, land }));
    const damage = {
        secondary: (firstMissed ? [53] : [47, 53]).map((amount) => ({
            source: "ember_covenant",
            unitId: "B",
            position: { x: 100, y: 0 },
            amount,
            unitsDied: 0,
        })),
    };
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "range", damage },
        [strike(), strike(false, 1)].map((hit) => ({ ...hit, amount: 0, missed: firstMissed && hit.hitIndex === 0 })),
        () => {},
    );
    await flush();
    expect(shown).toEqual([]);
    flights[0].contact();
    expect(shown).toEqual(firstMissed ? [] : [47]);
    flights[0].land();
    await flush();
    expect(flights).toHaveLength(2);
    expect(shown).toEqual(firstMissed ? [] : [47]);
    flights[1].contact();
    expect(shown).toEqual(firstMissed ? [53] : [47, 53]);
    flights[1].land();
    await pending;
});
