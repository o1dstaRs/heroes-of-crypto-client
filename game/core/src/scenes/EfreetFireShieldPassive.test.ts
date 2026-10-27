import { expect, mock, test } from "bun:test";
import { OneInTheFieldTriggers } from "./sandbox/OneInTheFieldTriggers";
import type { IVisibleDamage } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { fireShieldCasterIds } from "./sandbox/fireShieldCasters";
import type { CombatExchangeStrike } from "./sandbox/combat_exchange";

const damage = (burned = "striker", overrides: Partial<IVisibleDamage> = {}): IVisibleDamage => ({
    amount: 10,
    render: true,
    unitId: "efreet",
    unitPosition: { x: 0, y: 0 },
    unitIsSmall: true,
    secondary: [{ source: "fire_shield", unitId: burned, amount: 4, unitsDied: 0, position: { x: 0, y: 0 } }],
    ...overrides,
});

function fixture() {
    const efreet = {
        getId: () => "efreet",
        getName: () => "Efreet",
        isDead: () => false,
        hasAbilityActive: (ability: string) => ability === "Fire Shield",
        isPlayingOneShotAnimation: () => false,
        getAnimationTextureKey: () => "efreet_lab_cast_atlas",
    };
    const play = mock(async (): Promise<void> => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map([["efreet", efreet]]) },
        waitForTexture: mock(async () => true),
        isSceneDestroyed: () => false,
        playReplayOneShot: play,
    });
    return { scene, efreet, play };
}

test("Fire Shield animates its owner, including reflection during a counterattack", () => {
    expect(fireShieldCasterIds("striker", "efreet", damage())).toEqual(["efreet"]);
    expect(fireShieldCasterIds("efreet", "striker", damage("striker", { unitId: "striker" }))).toEqual(["efreet"]);
    expect(fireShieldCasterIds("striker", "clicked", damage())).toEqual(["efreet"]);
});

test("misses, zero reflection and unrelated secondary damage cannot trigger the passive", () => {
    expect(fireShieldCasterIds("striker", "efreet", damage("striker", { missed: true }))).toEqual([]);
    expect(fireShieldCasterIds("striker", "efreet", damage("striker", { secondary: [] }))).toEqual([]);
    const zero = damage();
    zero.secondary![0].amount = 0;
    expect(fireShieldCasterIds("striker", "efreet", zero)).toEqual([]);
    zero.secondary![0].amount = 5;
    zero.secondary![0].source = "fire_breath";
    expect(fireShieldCasterIds("striker", "efreet", zero)).toEqual([]);
});

test("AOE owners are included and repeated reflections animate each owner only once", () => {
    const hit = damage();
    hit.secondary!.push({ ...hit.secondary![0] });
    hit.splash = [{ unitId: "other-efreet", amount: 8, unitsDied: 0, position: { x: 1, y: 1 } }];
    expect(fireShieldCasterIds("striker", "efreet", hit)).toEqual(["efreet", "other-efreet"]);
});

test("combat uses the lab cast atlas and waits for the authored animation to finish", async () => {
    const { scene, efreet, play } = fixture();
    let finish!: () => void;
    const completed = new Promise<void>((resolve) => {
        finish = resolve;
    });
    play.mockImplementation(() => completed);
    let settled = false;
    const playback = scene.playFireShieldPassives("striker", "efreet", damage()).then(() => {
        settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(scene.waitForTexture).toHaveBeenCalledWith("efreet_lab_cast_atlas");
    expect(play).toHaveBeenCalledWith(efreet, "cast", 3000);
    expect(settled).toBe(false);
    finish();
    await playback;
    expect(settled).toBe(true);
});

test("dead, already casting and non-Efreet units are not restarted", async () => {
    for (const overrides of [
        { isDead: () => true },
        { getName: () => "Peasant" },
        { hasAbilityActive: () => false },
        { isPlayingOneShotAnimation: (state: string) => state === "cast" },
        { isPlayingOneShotAnimation: (state: string) => state === "death" },
    ]) {
        const { scene, efreet, play } = fixture();
        Object.assign(efreet, overrides);
        await scene.playFireShieldPassives("striker", "efreet", damage());
        expect(play).not.toHaveBeenCalled();
    }
});

const flush = async () => {
    for (let index = 0; index < 20; index++) await Promise.resolve();
};

function exchangeFixture({ counter = false, shieldOnAttacker = false, double = false } = {}) {
    const events: string[] = [];
    const finishes = new Map<string, () => void>();
    const states = new Map<string, string>();
    const unit = (id: string) => ({
        getId: () => id,
        getName: () => (id === "efreet" ? "Efreet" : "Peasant"),
        isDead: () => false,
        hasAbilityActive: (ability: string) => id === "efreet" && ability === "Fire Shield",
        isPlayingOneShotAnimation: (state: string) => states.get(id) === state,
        getAnimationTextureKey: (state: string) =>
            id === "efreet" && state === "cast" ? "efreet_lab_cast_atlas" : undefined,
        getUnitProperties: () => ({ level: 2 }),
        getVisualCenter: () => ({ x: id === "efreet" ? 100 : 0, y: 0 }),
        getDamagePredictionAnchor: () => ({ x: 0, y: 100 }),
    });
    const efreet = unit("efreet");
    const striker = unit("striker");
    const units = new Map([
        ["striker", striker],
        ["efreet", efreet],
    ]);
    const attacker = shieldOnAttacker ? efreet : striker;
    const target = shieldOnAttacker ? striker : efreet;
    const hit = damage("striker", { unitId: target.getId() });
    if (double) hit.secondary!.push({ ...hit.secondary![0], amount: 7 });
    const strike = (response = false, hitIndex = 0): CombatExchangeStrike => ({
        attackerId: response ? target.getId() : attacker.getId(),
        targetId: response ? attacker.getId() : target.getId(),
        amount: 10,
        unitsDied: 0,
        lethal: false,
        response,
        hitIndex,
    });
    const plan = [strike(), ...(counter ? [strike(true)] : []), ...(double ? [strike(false, 1)] : [])];
    const showFloatingDamage = mock((_position, amount: number, _direction, _deaths, fill?: string) => {
        events.push(`${fill ? "reflection" : "physical"}:${amount}`);
    });
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        oneInTheFieldTriggers: new OneInTheFieldTriggers(),
        sc_sceneSettings: { getGridSettings: () => ({ getCellSize: () => 100 }) },
        unitsHolder: { getAllUnits: () => units },
        dyingVisualUnits: new Set(),
        waitForTexture: mock(async () => true),
        isSceneDestroyed: () => false,
        prepareDirectionalAttackState: () => "melee_attack",
        offsetReplayDamagePosition: (position: unknown) => position,
        combatVisuals: {
            showFloatingDamage,
            spawnFireBurn: mock(() => events.push("burn")),
        },
        playReplayOneShot: (owner: typeof efreet, state: string) => {
            const key = `${owner.getId()}:${state}`;
            states.set(owner.getId(), state);
            events.push(key);
            return new Promise<void>((resolve) =>
                finishes.set(key, () => {
                    states.delete(owner.getId());
                    finishes.delete(key);
                    resolve();
                }),
            );
        },
    });
    const run = (
        onDeath = (_unit: typeof efreet) => {},
        deathState?: { amountsBefore: ReadonlyMap<string, number>; deadIds: ReadonlySet<string> },
    ) =>
        scene.playCombatExchange(
            attacker,
            target,
            { attackType: "melee", damage: hit },
            plan,
            onDeath,
            undefined,
            undefined,
            undefined,
            deathState,
        );
    const finish = async (id: string, state: string) => {
        const callback = finishes.get(`${id}:${state}`);
        expect(callback).toBeDefined();
        callback!();
        await flush();
    };
    return { scene, efreet, striker, units, hit, plan, events, run, finish };
}

test("live/replay reflection damage, flames and shield cast start at contact without a counter", async () => {
    const h = exchangeFixture();
    let settled = false;
    const pending = h.run().then(() => {
        settled = true;
    });
    await flush();
    expect(h.events).toEqual(["striker:melee_attack"]);
    expect(settled).toBe(false);
    await h.finish("striker", "melee_attack");
    expect(h.events).toEqual(["striker:melee_attack", "physical:10", "burn", "reflection:4", "efreet:cast"]);
    expect(settled).toBe(false);
    await h.finish("efreet", "cast");
    await pending;
    expect(settled).toBe(true);
    expect(h.events.filter((event) => event === "reflection:4")).toHaveLength(1);
    expect(h.events).not.toContain("efreet:hit");
});

test.each([false, true])(
    "reflection remains on its own hit in a sequential exchange, attacking=%s",
    async (shieldOnAttacker) => {
        const h = exchangeFixture({ counter: true, shieldOnAttacker });
        const pending = h.run();
        await flush();
        if (shieldOnAttacker) {
            expect(h.events).toEqual(["efreet:melee_attack"]);
            await h.finish("efreet", "melee_attack");
            expect(h.events).toContain("striker:hit");
            expect(h.events).not.toContain("striker:melee_attack");
            await h.finish("striker", "hit");
            await h.finish("striker", "melee_attack");
            expect(h.events).toContain("reflection:4");
            await h.finish("efreet", "cast");
        } else {
            expect(h.events).toEqual(["striker:melee_attack"]);
            await h.finish("striker", "melee_attack");
            expect(h.events).toContain("reflection:4");
            expect(h.events).not.toContain("efreet:melee_attack");
            await h.finish("efreet", "cast");
            await h.finish("efreet", "melee_attack");
            await h.finish("striker", "hit");
        }
        await pending;
        expect(h.events.filter((event) => event === "reflection:4")).toHaveLength(1);
        expect(h.events).not.toContain("efreet:hit");
    },
);

test("each double strike presents its own reflection at its own contact", async () => {
    const h = exchangeFixture({ double: true });
    const pending = h.run();
    await flush();
    expect(h.events).not.toContain("reflection:4");
    await h.finish("striker", "melee_attack");
    expect(h.events).toContain("reflection:4");
    expect(h.events).not.toContain("reflection:7");
    await h.finish("efreet", "cast");
    expect(h.events).not.toContain("reflection:7");
    await h.finish("striker", "melee_attack");
    expect(h.events).toContain("reflection:7");
    await h.finish("efreet", "cast");
    await pending;
    expect(h.events.filter((event) => event.startsWith("reflection:"))).toEqual(["reflection:4", "reflection:7"]);
    expect(h.events.filter((event) => event === "efreet:cast")).toHaveLength(2);
});

test("the shield atlas is ready before the physical exchange begins", async () => {
    const h = exchangeFixture();
    let ready!: () => void;
    const texture = new Promise<boolean>((resolve) => {
        ready = () => resolve(true);
    });
    h.scene.waitForTexture = mock(() => texture);
    const pending = h.run();
    await flush();
    expect(h.scene.waitForTexture).toHaveBeenCalledWith("efreet_lab_cast_atlas");
    expect(h.events).toEqual([]);
    ready();
    await flush();
    expect(h.events).toEqual(["striker:melee_attack"]);
    await h.finish("striker", "melee_attack");
    expect(h.events).toContain("reflection:4");
    expect(h.events).toContain("efreet:cast");
    await h.finish("efreet", "cast");
    await pending;
});

test("a lethal reflection shows on the captured attacker and defers its death until its swing finishes", async () => {
    const h = exchangeFixture();
    h.hit.secondary![0].unitsDied = 1;
    h.units.delete("striker");
    const onDeath = mock(() => {});
    const pending = h.run(onDeath, {
        amountsBefore: new Map([
            ["striker", 1],
            ["efreet", 2],
        ]),
        deadIds: new Set(["striker"]),
    });
    await flush();
    expect(h.events).not.toContain("reflection:4");
    await h.finish("striker", "melee_attack");
    expect(h.events).toContain("reflection:4");
    expect(h.scene.combatVisuals.showFloatingDamage.mock.calls.at(-1)[7]).toBe(h.striker);
    expect(onDeath).not.toHaveBeenCalled();
    await h.finish("efreet", "cast");
    expect(onDeath).toHaveBeenCalledTimes(1);
    expect(onDeath).toHaveBeenCalledWith(h.striker);
    expect([...(await pending)]).toEqual(["striker"]);
});

test("teardown discards a shield cast waiting for its owner's counter", async () => {
    const h = exchangeFixture({ counter: true });
    const pending = h.run();
    await flush();
    h.scene.isSceneDestroyed = () => true;
    await h.finish("striker", "melee_attack");
    await pending;
    expect(h.events).not.toContain("efreet:cast");
    expect(h.events).not.toContain("striker:hit");
});

test("replay damage keeps an impact-time reflection out of its later secondary pass", () => {
    const h = exchangeFixture();
    const other = { ...h.hit.secondary![0], source: "fireforged_sword" as const };
    h.hit.secondary!.push(other);
    h.scene.showSecondaryDamageNumbers = mock(() => {});
    h.scene.spawnDeepWoundsClaws = () => {};
    h.scene.flushEffectPops = () => {};
    h.scene.showReplayAttackDamage(
        h.striker,
        h.efreet,
        { attackType: "range", damage: h.hit },
        {},
        new Set(["efreet"]),
        true,
    );
    expect(h.scene.showSecondaryDamageNumbers.mock.calls[0][0]).toEqual([other]);
    expect(h.hit.secondary).toHaveLength(2);
});
