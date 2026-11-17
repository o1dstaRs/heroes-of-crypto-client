import { expect, mock, test } from "bun:test";
import { Sandbox } from "./Sandbox";
import { OneInTheFieldTriggers } from "./sandbox/OneInTheFieldTriggers";
import { orderCombatExchange, type CombatExchangeStrike } from "./sandbox/combat_exchange";
import { createCombatSoundPlayer, type ICombatSoundSource } from "../ui/audio/combatSounds";
import { PETRIFYING_GAZE_DURATION_MS } from "./sandbox/PetrifyingGazePops";

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
        presentDamageCasualties: (_loss: number) => {},
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
    { lethal: false, primaryLethal: false },
    { lethal: true, primaryLethal: false },
    { lethal: true, primaryLethal: true },
])(
    "gaze owns its delayed hit: lethal=$lethal, classified primary lethal=$primaryLethal",
    async ({ lethal, primaryLethal }) => {
        const { scene, a, b } = setup();
        const losses: number[] = [],
            amounts: number[] = [],
            deaths: string[] = [];
        const shown: string[] = [];
        b.presentDamageCasualties = (loss: number) => losses.push(loss);
        scene.combatVisuals.showFloatingDamage = (_pos: unknown, amount: number) => amounts.push(amount);
        scene.combatVisuals.spawnPetrifyingGazePop = (unit: typeof b) => {
            shown.push(unit.getId());
            // A cold cosmetic atlas may never complete. It cannot own the attack barrier.
            return new Promise(() => {});
        };
        scene.playReplayOneShot = async () => {};
        scene.waitForProjectileHitReaction = async () => {};
        let releaseGaze!: () => void;
        scene.delayReplay = (ms: number) =>
            ms === PETRIFYING_GAZE_DURATION_MS
                ? new Promise<void>((resolve) => {
                      releaseGaze = resolve;
                  })
                : Promise.resolve();
        let contact!: () => void, land!: () => void;
        scene.playReplayProjectile = (_a: unknown, _b: unknown, _pos: unknown, impact: () => void) => {
            contact = impact;
            return new Promise<void>((resolve) => {
                land = resolve;
            });
        };
        const gaze = { source: "petrifying_gaze", unitId: "B", position: { x: 100, y: 0 }, amount: 45, unitsDied: 1 };
        const damage = { secondary: [gaze] };
        const pending = scene.playCombatExchange(
            a,
            b,
            {
                attackType: "range",
                damage,
                unitIdsDied: lethal ? ["B"] : [],
            },
            [{ ...strike(), lethal: primaryLethal }],
            (unit: typeof b) => deaths.push(unit.getId()),
            undefined,
            undefined,
            undefined,
            {
                amountsBefore: new Map([["B", lethal ? 1 : 2]]),
                deadIds: new Set(lethal ? ["B"] : []),
            },
        );
        await flush();
        expect(shown).toEqual([]);
        expect(amounts).toEqual([]);
        contact();
        contact();
        expect(amounts).toEqual([10]);
        expect(losses).toEqual([0]);
        expect(shown).toEqual(["B"]);
        scene.showSecondaryDamageNumbers([gaze], { x: 0, y: 0 });
        expect(amounts).toEqual([10]);
        land();
        await flush();
        expect(deaths).toEqual([]);
        releaseGaze();
        await pending;
        expect(amounts).toEqual([10, 45]);
        expect(losses).toEqual([0, 1]);
        expect(deaths).toEqual(lethal ? ["B"] : []);
    },
);

test("double-shot gaze waits per proc while the recorded counter still starts alongside the first shot", async () => {
    const { scene, a, b } = setup();
    const amounts: number[] = [],
        contacts: (() => void)[] = [],
        landings: (() => void)[] = [],
        gazes: (() => void)[] = [];
    scene.combatVisuals.showFloatingDamage = (_position: unknown, amount: number) => amounts.push(amount);
    scene.combatVisuals.spawnPetrifyingGazePop = async () => () => {};
    scene.playReplayOneShot = async () => {};
    scene.waitForProjectileHitReaction = async () => {};
    scene.delayReplay = (ms: number) =>
        ms === PETRIFYING_GAZE_DURATION_MS ? new Promise<void>((resolve) => gazes.push(resolve)) : Promise.resolve();
    scene.playReplayProjectile = (_source: unknown, _target: unknown, _position: unknown, contact: () => void) => {
        contacts.push(contact);
        return new Promise<void>((resolve) => landings.push(resolve));
    };
    const secondary = [32, 45].map((amount) => ({
        source: "petrifying_gaze",
        unitId: "B",
        amount,
        unitsDied: 1,
        position: { x: 100, y: 0 },
    }));
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "range", damage: { secondary }, unitIdsDied: [] },
        [strike(), strike(true), strike(false, 1)],
        () => {},
        undefined,
        undefined,
        undefined,
        {
            amountsBefore: new Map([
                ["B", 3],
                ["A", 3],
            ]),
            deadIds: new Set(),
        },
    );
    await flush();
    expect(contacts).toHaveLength(2);
    contacts[0]();
    contacts[1]();
    landings[0]();
    landings[1]();
    await flush();
    expect(amounts).toEqual([10, 10]);
    expect(contacts).toHaveLength(2);
    gazes.shift()!();
    await flush();
    expect(amounts).toEqual([10, 10, 32]);
    expect(contacts).toHaveLength(3);
    contacts[2]();
    landings[2]();
    await flush();
    expect(amounts).toEqual([10, 10, 32, 10]);
    gazes.shift()!();
    await pending;
    expect(amounts).toEqual([10, 10, 32, 10, 45]);
});

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
        scene.playSceneGameSound = (name: string) => {
            expect(name).not.toBe("miss");
        };
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

test("simultaneous melee uses attack poses; a later single-sided strike still flinches", async () => {
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
    expect(events).toHaveLength(4);
    finishB();
    await flush();
    expect(events.slice(4)).toEqual(["A:attack", "damage", "B:hit"]);
    expect(events.filter((event) => event === "A:hit")).toHaveLength(0);
    expect(events.filter((event) => event === "B:hit")).toHaveLength(1);
    finish.splice(0).forEach((done) => done());
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
        expect(events.slice(4)).toEqual(counterLethal ? ["A:death"] : []);
        finishB();
        await flush();
        expect(events.filter((event) => event.endsWith(":hit"))).toEqual([]);
        finish.splice(0).forEach((fn) => fn());
        const deaths = await pending;
        expect([...deaths].sort()).toEqual([...(counterLethal ? ["A"] : []), ...(primaryLethal ? ["B"] : [])]);
        expect(events.filter((event) => event.endsWith(":attack"))).toHaveLength(2);
    },
);
test("ranged actors never queue a late hit, even when the counter lands and recovers first", async () => {
    const { scene, a, b, events, finish } = setup();
    const flights: { contact(): void; land(): void }[] = [];
    scene.playReplayProjectile = (source: { getId(): string }, _b: unknown, _pos: unknown, contact: () => void) => {
        events.push(source.getId() + ":projectile");
        return new Promise<void>((land) => flights.push({ contact, land }));
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
    flights[1].contact();
    flights[1].land();
    await flush();
    expect(events).toEqual(["A:projectile", "B:projectile", "damage"]);
    flights[0].contact();
    flights[0].land();
    await flush();
    expect(events).toEqual(["A:projectile", "B:projectile", "damage", "damage", "A:projectile"]);
    expect(flights).toHaveLength(3);
    flights[2].contact();
    flights[2].land();
    await flush();
    expect(events.slice(-2)).toEqual(["damage", "B:hit"]);
    expect(events).not.toContain("A:hit");
    finish.splice(0).forEach((done) => done());
    await pending;
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
    expect(events.filter((entry) => entry.endsWith(":hit"))).toEqual(["screen:hit"]);
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
    scene.playSceneGameSound = (name: string) => sounds.push(name);
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "melee" },
        [{ ...strike(), amount: 0, missed: true }],
        () => {},
    );
    await flush();
    expect(sounds).toEqual(["A:attack", "miss"]);
    finish.splice(0).forEach((fn) => fn());
    await pending;
});

test.each(["melee", "range"])("recorded %s counter misses survive a zero-damage exchange", (attackType) => {
    const { scene, a, b } = setup();
    Object.assign(a, { getPosition: () => ({ x: 0, y: 0 }), getAbility: () => undefined });
    const event = {
        attackType,
        animations: [],
        damage: { amount: 10, missedResponse: { unitId: "A", position: { x: 0, y: 0 } } },
    };
    const plan = scene.buildCombatExchange(a, b, event, new Map(), new Set());
    expect(plan).toHaveLength(2);
    expect(plan[1]).toMatchObject({ attackerId: "B", targetId: "A", response: true, missed: true, amount: 0 });
    expect(scene.buildCombatExchange(a, b, { ...event, damage: { amount: 0 } }, new Map(), new Set())).toHaveLength(1);
    if (attackType === "range") {
        const splashCounter = {
            attackType,
            damage: { amount: 10, splash: [{ unitId: "A", amount: 0, unitsDied: 0, missed: true }] },
            animations: [
                { fromPosition: { x: 0, y: 0 }, toPosition: { x: 100, y: 0 }, affectedUnitId: "B" },
                { fromPosition: { x: 100, y: 0 }, toPosition: { x: 0, y: 0 }, affectedUnitId: "A" },
            ],
        };
        expect(scene.buildCombatExchange(a, b, splashCounter, new Map(), new Set())[1]).toMatchObject({
            attackerId: "B",
            targetId: "A",
            response: true,
            missed: true,
            amount: 0,
        });
    }
});

test.each(["melee", "range"])(
    "%s misses sound once per strike, including simultaneous counters and second blows",
    async (attackType) => {
        const { scene, a, b, finish } = setup();
        const misses: string[] = [];
        const hurts: string[] = [];
        const flights: { contact(): void; land(): void }[] = [];
        scene.showAttackMissedVfx = () => {};
        scene.playSceneGameSound = (name: string, _alive: unknown, identity: string) => {
            expect(name).toBe("miss");
            misses.push(identity);
        };
        scene.playUnitCombatSound = (unit: typeof a, role: string) => {
            if (role === "hurt") hurts.push(unit.getId());
        };
        scene.playReplayProjectile = (_a: unknown, _b: unknown, _position: unknown, contact: () => void) =>
            new Promise<void>((land) => flights.push({ contact, land }));
        const plan = [strike(), strike(true), strike(false, 1)].map((hit) => ({ ...hit, missed: true, amount: 0 }));
        const pending = scene.playCombatExchange(a, b, { attackType }, plan, () => {});
        await flush();
        expect(misses).toHaveLength(attackType === "range" ? 0 : 2);
        for (let phase = 0; phase < 4; phase++) {
            flights.splice(0).forEach(({ contact, land }) => {
                contact();
                contact();
                land();
            });
            finish.splice(0).forEach((done) => done());
            await flush();
        }
        await pending;
        expect(misses).toHaveLength(3);
        expect(new Set(misses).size).toBe(3);
        expect(hurts).toEqual([]);
    },
);

test.each([false, true])(
    "Berserker's two recorded strikes both reach the audio player, first missed=%s",
    async (missed) => {
        const { scene, a, b, finish } = setup();
        a.getName = () => "Berserker";
        b.getName = () => "Squire";
        scene.showAttackMissedVfx = () => {};
        let now = 100;
        const audible: { key: string; at: number }[] = [];
        const loads: string[] = [];
        const requests: Promise<boolean>[] = [];
        const player = createCombatSoundPlayer({
            now: () => now,
            gain: () => 1,
            available: () => true,
            load: async (source) => {
                loads.push(source.key);
                return source;
            },
            start: (buffer) => {
                audible.push({ key: (buffer as ICombatSoundSource).key, at: now });
            },
        });
        scene.playUnitCombatSound = (unit: typeof a, role: "attack" | "hurt", melee = false) => {
            requests.push(player.play(unit.getName(), role, unit.getId(), melee));
        };
        const event = {
            attackType: "melee",
            damage: {
                amount: missed ? 10 : 20,
                hits: [
                    { amount: missed ? 0 : 10, unitsDied: 0, missed },
                    { amount: 10, unitsDied: 0 },
                ],
            },
        };
        const plan = scene.buildCombatExchange(a, b, event, new Map(), new Set(), { amount: 5, unitsDied: 0 });
        expect(plan.map((hit: CombatExchangeStrike) => [hit.attackerId, hit.hitIndex])).toEqual([
            ["A", 0],
            ["B", 0],
            ["A", 1],
        ]);
        const pending = scene.playCombatExchange(a, b, event, plan, () => {});
        await flush();
        const berserkerAttacks = () => audible.filter((sound) => sound.key.includes("/berserker_attack:"));
        expect(berserkerAttacks()).toHaveLength(1);
        for (let phase = 0; phase < 4; phase++) {
            now += 250;
            finish.splice(0).forEach((done) => done());
            await flush();
        }
        await pending;
        expect((await Promise.all(requests)).every(Boolean)).toBe(true);
        expect(berserkerAttacks()).toHaveLength(2);
        expect(berserkerAttacks()[1].at).toBeGreaterThan(berserkerAttacks()[0].at);
        expect(loads.filter((key) => key.includes("/berserker_attack:"))).toHaveLength(1);
        expect(audible.filter((sound) => sound.key.includes("/squire_attack:"))).toHaveLength(1);
        expect(audible.filter((sound) => sound.key.includes("/squire_hurt:"))).toHaveLength(missed ? 1 : 2);
    },
);

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

// Preserve approved PR popup-policy coverage alongside main’s intentional combat timing.
test.each([
    { active: true, missed: false, amount: 10, lethal: false, response: false },
    { active: false, missed: false, amount: 10, lethal: false, response: false },
    { active: true, missed: true, amount: 0, lethal: false, response: false },
    { active: true, missed: false, amount: 0, lethal: false, response: false },
    { active: true, missed: false, amount: 10, lethal: true, response: false },
    { active: true, missed: false, amount: 10, lethal: false, response: true },
])("Shadow Touch stays passive without an above-unit popup: %j", async (options) => {
    const { scene, a, b, events, finish } = setup();
    a.hasAbilityActive = (name?: string) => options.active && name === "Shadow Touch";
    const preparePop = mock((_kind: string) => undefined);
    scene.combatVisuals.prepareCommonFlagPop = preparePop;
    scene.combatVisuals.spawnCommonFlagPop = (unit: typeof a, kind: string) => events.push(`${unit.getId()}:${kind}`);
    scene.showAttackMissedVfx = () => events.push("miss");
    const plan: CombatExchangeStrike[] = [
        { ...strike(false, 0, options.lethal), amount: options.amount, missed: options.missed },
    ];
    if (options.response) plan.push(strike(true));
    const pending = scene.playCombatExchange(a, b, { attackType: "melee" }, plan, () => {});
    await flush();
    finish.splice(0).forEach((done) => done());
    await flush();
    for (let i = 0; i < 5; i++) {
        finish.splice(0).forEach((resolve) => resolve());
        await flush();
    }
    await pending;
    expect(events).not.toContain("A:shadow_touch");
    expect(events).not.toContain("B:shadow_touch");
    expect(preparePop).not.toHaveBeenCalledWith("shadow_touch");
    expect(events.includes("B:attack")).toBe(options.response);
    expect(events.filter((event) => event === "damage")).toHaveLength(
        (options.missed || options.amount <= 0 ? 0 : 1) + (options.response ? 1 : 0),
    );
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

test("each strike reports actual playback progress without advancing while a reaction is held", async () => {
    const { scene, a, b, finish } = setup();
    let progress = 0;
    scene.aiController = {
        noteActionPresentationProgress: () => {
            progress++;
        },
    };
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "melee" },
        orderCombatExchange([strike()], strike(true)),
        () => {},
    );
    await flush();
    // The group plus both simultaneous contacts report real progress; waiting for either
    // outgoing attack or hit reaction must not manufacture additional progress notifications.
    expect(progress).toBe(3);
    for (let i = 0; i < 4; i++) {
        finish.splice(0).forEach((resolve) => resolve());
        await flush();
        expect(progress).toBe(3);
    }
    await pending;
    expect(progress).toBe(3);
});

test("INTENDED: cold status art cannot delay the opening exchange or move melee damage past attack completion", async () => {
    const { scene, a, b, events, finish } = setup();
    scene.pendingEffectPops = [{ unit: b, debuffs: ["Curse"], buffs: [] }];
    scene.waitForTexture = () => new Promise(() => {});
    const pending = scene.playCombatExchange(a, b, { attackType: "melee" }, [strike(), strike(true)], () => {});
    await flush();
    expect(events.filter((event: string) => event.endsWith(":attack"))).toEqual(["A:attack", "B:attack"]);
    expect(events.filter((event: string) => event === "damage")).toHaveLength(2);
    expect(events.some((event: string) => event.endsWith(":hit"))).toBe(false);
    // The outgoing attack owns the body for this simultaneous exchange. Damage is already
    // visible at contact; no generic hit pose is queued behind either attack.
    finish[0]();
    await flush();
    expect(events).not.toContain("A:hit");
    expect(events).not.toContain("B:hit");
    finish[1]();
    await flush();
    expect(events).not.toContain("B:hit");
    for (let i = 0; i < 4; i++) {
        finish.splice(0).forEach((done) => done());
        await flush();
    }
    await pending;
});

test("a barrel consumes the first projectile before the remaining unit hit, without stealing its damage", async () => {
    const { scene, a, b, events } = setup();
    const barrel = {
        type: "obstacle_attacked",
        attackerId: "A",
        targetPosition: { x: 50, y: 0 },
        hitsBefore: 8,
        hitsAfter: 8,
        animations: [],
    };
    const order: string[] = [],
        flags: number[] = [];
    const units = new Map([
        ["A", a],
        ["B", b],
    ]);
    Object.assign(a, { getRangedProjectileOrigin: () => ({ x: 0, y: 0 }) });
    scene.snapshotRenderableUnits = () => units;
    scene.dungeonVisuals = { getObstacleProjectileImpactPoint: () => ({ x: 50, y: 20 }) };
    scene.showRepeatedAttackFlag = (_unit: unknown, index: number) => flags.push(index);
    scene.playReplayOneShot = async () => {};
    scene.presentRangedObstacleAtContact = (applied: unknown) => {
        expect(applied).toBe(barrel);
        (scene.presentedRangedSplashObstacles ??= new WeakSet()).add(barrel);
        order.push("barrel contact");
    };
    let releaseBarrel!: () => void;
    scene.fireUnitProjectile = (_unit: unknown, options: { to: unknown; onImpact(): void }) => {
        expect(options.to).toEqual({ x: 50, y: 20 });
        order.push("barrel projectile");
        return new Promise<void>((resolve) => {
            releaseBarrel = () => {
                options.onImpact();
                resolve();
            };
        });
    };
    scene.playReplayProjectile = async (_a: unknown, _b: unknown, _pos: unknown, contact: () => void) => {
        order.push("unit projectile");
        contact();
    };
    const pending = scene.playCombatExchange(a, b, { attackType: "range" }, [strike()], () => {}, units, [barrel]);
    await flush();
    expect(order).toEqual(["barrel projectile"]);
    expect(events).not.toContain("damage");
    releaseBarrel();
    await pending;
    expect(order).toEqual(["barrel projectile", "barrel contact", "unit projectile"]);
    expect(flags).toEqual([0, 1]);
    expect(events.filter((entry) => entry === "damage")).toHaveLength(1);
    expect(scene.presentedRangedSplashObstacles.has(barrel)).toBe(true);
});

test("ranked/replay renders both barrel-bound shots even when the record has no unit attack", async () => {
    const { scene, a, b } = setup();
    const barrels = [50, 80].map((x) => ({
        type: "obstacle_attacked",
        attackerId: "A",
        targetPosition: { x, y: 0 },
        hitsBefore: 8,
        hitsAfter: 8,
        animations: [],
    }));
    const record = {
        action: { type: "range_attack", attackerId: "A", targetId: "B" },
        events: [...barrels, { type: "turn_completed", unitId: "A" }],
        stateAfter: {},
    };
    const order: string[] = [],
        releases: (() => void)[] = [];
    Object.assign(a, {
        setActiveTurn: () => {},
        syncVisual: () => {},
        getRangedProjectileOrigin: () => ({ x: 0, y: 0 }),
    });
    Object.assign(scene, {
        drawer: { getUnitsContainer: () => ({}) },
        beginDullingDefensePresentation: () => {},
        snapshotRenderableUnits: () =>
            new Map([
                ["A", a],
                ["B", b],
            ]),
        dungeonVisuals: { getObstacleProjectileImpactPoint: (position: unknown) => position },
        showRepeatedAttackFlag: () => {},
        presentRangedObstacleAtContact: (event: { targetPosition: { x: number } }) =>
            order.push(`contact:${event.targetPosition.x}`),
        applyReplayEvents: () => order.push("turn complete"),
        fireUnitProjectile: (_source: unknown, options: { to: { x: number }; onImpact(): void }) => {
            order.push(`shot:${options.to.x}`);
            return new Promise<void>((resolve) =>
                releases.push(() => {
                    options.onImpact();
                    resolve();
                }),
            );
        },
    });
    const pending = scene.playReplayAttackRecord(record);
    await flush();
    expect(order).toEqual(["shot:50"]);
    releases.shift()!();
    await flush();
    expect(order).toEqual(["shot:50", "contact:50", "shot:80"]);
    expect(scene.sc_moveBlocked).toBe(true);
    releases.shift()!();
    expect(await pending).toBe(true);
    expect(order).toEqual(["shot:50", "contact:50", "shot:80", "contact:80", "turn complete"]);
    expect(scene.sc_moveBlocked).toBe(false);
});

test("mortally wounded melee actors shorten recovery only after their own attack starts", async () => {
    const { scene, a, b, finish, events } = setup();
    const started = new Set<string>(),
        shortened = new Set<string>();
    for (const unit of [a, b])
        Object.assign(unit, {
            hastenLethalMeleeRecovery: () => {
                if (started.has(unit.getId())) shortened.add(unit.getId());
            },
        });
    const play = scene.playReplayOneShot;
    scene.playReplayOneShot = (unit: typeof a, state: string) => {
        if (state === "attack") started.add(unit.getId());
        return play(unit, state);
    };
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "melee" },
        orderCombatExchange([strike(false, 0, true)], strike(true, 0, true)),
        (unit: typeof a) => events.push(`${unit.getId()}:death`),
    );
    await flush();
    expect(events).toEqual(["A:attack", "damage", "B:attack", "damage"]);
    expect([...shortened].sort()).toEqual(["A", "B"]);
    expect(events.some((event) => event.endsWith(":death"))).toBe(false);
    finish.splice(0).forEach((done) => done());
    await pending;
    expect(events.filter((event) => event.endsWith(":death")).sort()).toEqual(["A:death", "B:death"]);
});

test.each(["melee", "range"])(
    "%s simultaneous actors skip both the hit pose and knockback, passive recipients keep them",
    async (attackType) => {
        const { scene, a, b } = setup();
        const hits: string[] = [],
            knockbacks: string[] = [];
        for (const unit of [a, b])
            Object.assign(unit, { getName: () => "Fixture actor", getUnitProperties: () => ({ level: 3 }) });
        scene.applyReplayLunge = () => {};
        scene.delayReplay = async () => {};
        scene.playReplayOneShot = async (unit: typeof a, state: string) => {
            if (state === "hit") hits.push(unit.getId());
        };
        scene.applyReplayHitKnockback = (unit: typeof a) => knockbacks.push(unit.getId());
        scene.playReplayProjectile = async (_a: unknown, _b: unknown, _position: unknown, contact: () => void) =>
            contact();
        await scene.playCombatExchange(a, b, { attackType }, orderCombatExchange([strike()], strike(true)), () => {});
        expect(hits).toEqual([]);
        expect(knockbacks).toEqual([]);
        await scene.playCombatExchange(a, b, { attackType }, [strike()], () => {});
        expect(hits).toEqual(["B"]);
        expect(knockbacks).toEqual(["B"]);
    },
);
