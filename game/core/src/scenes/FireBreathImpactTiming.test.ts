import { expect, test } from "bun:test";
import { GridConstants, GridSettings, type HoCMath, type IVisibleDamage } from "@heroesofcrypto/common";

import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import type { CombatExchangeStrike } from "./sandbox/combat_exchange";
import { fireBreathHitsForStrike } from "./sandbox/fireBreathImpact";

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const flush = async () => {
    for (let index = 0; index < 30; index++) await Promise.resolve();
};
const fixture = () => {
    const events: string[] = [];
    const finish: (() => void)[] = [];
    const timers: (() => void)[] = [];
    const makeUnit = (id: string, x: number, team = 2) => {
        const unit = Object.assign(Object.create(RenderableUnit.prototype), {
            logicalAmount: 3,
            displayedAmount: 3,
            getId: () => id,
            getName: () => (id === "dragon" ? "Black Dragon" : "Squire"),
            getPosition: () => ({ x, y: 0 }),
            getVisualCenter: () => ({ x, y: 0 }),
            getDamagePredictionAnchor: () => ({ x, y: 100 }),
            getTeam: () => team,
            getUnitProperties: () => ({ level: 1 }),
            getAmountAlive: () => unit.logicalAmount,
            isDead: () => unit.logicalAmount <= 0,
            getAnimationTextureKey: (_state: string): string | undefined => undefined,
            hasAnimationState: () => false,
            // Recorded breath must survive final-state Break/ability theft.
            hasAbilityActive: () => false,
            getAbility: () => undefined,
            continueDamagePresentation: (amount: number) => (unit.displayedAmount = amount),
            presentDamageCasualties: (loss: number) => (unit.displayedAmount -= loss),
            captureDamageCasualties: (loss: number) => {
                let presented = false;
                return () => {
                    if (!presented) unit.displayedAmount -= loss;
                    presented = true;
                };
            },
        });
        return unit;
    };
    const dragon = makeUnit("dragon", 100, 1);
    const primary = makeUnit("primary", 200);
    const rear = makeUnit("rear", 300);
    const friendly = makeUnit("friendly", 400, 1);
    const counterRear = makeUnit("counter-rear", 0, 1);
    const captured = new Map([dragon, primary, rear, friendly, counterRear].map((unit) => [unit.getId(), unit]));
    const units = new Map(captured);
    const secondary: NonNullable<IVisibleDamage["secondary"]> = [
        { source: "fire_breath", unitId: "rear", position: rear.getPosition(), amount: 21, unitsDied: 1 },
        { source: "fire_breath", unitId: "friendly", position: friendly.getPosition(), amount: 30, unitsDied: 3 },
    ];
    const event = {
        type: "unit_attacked",
        attackType: "melee",
        attackerId: "dragon",
        targetId: "primary",
        damage: { amount: 10, hits: [{ amount: 10, unitsDied: 1 }], secondary },
        unitIdsDied: ["friendly"],
        animations: [],
    };
    const amountsBefore = new Map([...captured].map(([id]) => [id, 3]));
    // The local engine has already killed and removed this friendly victim before playback starts.
    friendly.logicalAmount = 0;
    units.delete("friendly");
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => gs },
        unitsHolder: { getAllUnits: () => units },
        dyingVisualUnits: new Set(),
        isSceneDestroyed: () => false,
        preparePyreDeaths: () => {},
        prepareDirectionalAttackState: () => "attack",
        spawnBorrowedGraceVfx: () => {},
        popRecordedDullingDefense: () => {},
        popRecordedResistances: () => {},
        showAttackMissedVfx: () => events.push("miss"),
        playUnitCombatSound: () => {},
        waitForTexture: () => Promise.resolve(true),
        offsetReplayDamagePosition: (position: HoCMath.XY) => position,
        playReplayOneShot: (unit: typeof dragon, state: string) => {
            events.push(`${unit.getId()}:${state}`);
            return new Promise<void>((resolve) => finish.push(resolve));
        },
        scheduleSceneTimeout: (callback: () => void) => timers.push(callback),
        showFleshShieldAbsorbedDamage: () => new Map(),
        showDevourEssenceHeals: () => {},
        combatVisuals: {
            spawnFireBurn: (position: HoCMath.XY) => events.push(`burn:${position.x}`),
            showFloatingDamage: (
                _position: HoCMath.XY,
                amount: number,
                _direction: HoCMath.XY,
                _loss: number,
                _fill: string,
                _stroke: string,
                _anchor: HoCMath.XY,
                _audioUnit: RenderableUnit,
                _zIndex: number,
                presentCasualties?: () => void,
            ) => {
                presentCasualties?.();
                events.push(`damage:${amount}`);
            },
        },
    });
    const plan: CombatExchangeStrike[] = [
        {
            attackerId: "dragon",
            targetId: "primary",
            amount: 10,
            unitsDied: 1,
            response: false,
            hitIndex: 0,
            lethal: false,
        },
    ];
    const play = () =>
        scene.playCombatExchange(
            dragon,
            primary,
            event,
            plan,
            (unit: typeof dragon) => events.push(`${unit.getId()}:death`),
            captured,
            [],
            false,
            { amountsBefore, deadIds: new Set(event.unitIdsDied) },
        );
    const settle = async () => {
        for (let index = 0; index < 8; index++) {
            finish.splice(0).forEach((resolve) => resolve());
            await flush();
        }
    };
    return {
        scene,
        dragon,
        primary,
        rear,
        friendly,
        counterRear,
        captured,
        units,
        event,
        plan,
        events,
        finish,
        timers,
        play,
        settle,
    };
};

test("breath damage, casualties, burn and lethal reaction share the primary contact, before recovery", async () => {
    const f = fixture();
    const pending = f.play();
    await flush();
    expect(f.events).toContain("damage:10");
    expect(f.events).toContain("damage:21");
    expect(f.events).toContain("damage:30");
    expect(f.events).toContain("rear:hit");
    expect(f.events).toContain("friendly:death");
    expect(f.rear.displayedAmount).toBe(2);
    expect(f.friendly.displayedAmount).toBe(0);
    expect(f.scene.dyingVisualUnits.has(f.friendly)).toBe(true);
    expect(f.rear.logicalAmount).toBe(3);
    expect(f.friendly.logicalAmount).toBe(0);
    expect(f.timers).toHaveLength(0);
    await f.settle();
    expect(await pending).toEqual(new Set(["friendly"]));
    const beforeFallback = [...f.events];
    f.scene.showSecondaryDamageNumbers(f.event.damage.secondary, f.dragon.getPosition());
    f.scene.spawnFireDamageVfx(f.dragon, f.primary, f.event.damage);
    f.scene.applyReplayAttackRecoil(
        f.dragon,
        { ...f.event, animations: [{ affectedUnitId: "rear", toPosition: f.rear.getPosition() }] },
        new Set(),
        {},
    );
    f.timers.splice(0).forEach((callback) => callback());
    expect(f.events).toEqual(beforeFallback);
    expect(f.rear.displayedAmount).toBe(2);
});

test("a missed physical hit still presents recorded breath; a second physical blow cannot repeat it", async () => {
    const f = fixture();
    Object.assign(f.plan[0], { amount: 0, unitsDied: 0, missed: true });
    f.plan.push({ ...f.plan[0], hitIndex: 1, missed: false, amount: 7 });
    const pending = f.play();
    await flush();
    expect(f.events).toContain("miss");
    expect(f.events).toContain("damage:21");
    await f.settle();
    await pending;
    expect(f.events.filter((entry) => entry === "damage:21")).toHaveLength(1);
    expect(f.events.filter((entry) => entry === "burn:300")).toHaveLength(1);
    expect(f.events.filter((entry) => entry === "damage:7")).toHaveLength(1);
});

test("cold breath reaction textures gate the opening strike, including a removed lethal victim", async () => {
    const f = fixture();
    let ready!: () => void;
    const texture = new Promise<boolean>((resolve) => (ready = () => resolve(true)));
    f.friendly.getAnimationTextureKey = (state: string) => (state === "death" ? "cold-breath-death" : undefined);
    const requested: string[] = [];
    f.scene.waitForTexture = (key: string) => {
        requested.push(key);
        return texture;
    };
    const pending = f.play();
    await flush();
    expect(requested).toContain("cold-breath-death");
    expect(f.events).toEqual([]);
    ready();
    await flush();
    expect(f.events).toContain("damage:10");
    expect(f.events).toContain("friendly:death");
    await f.settle();
    await pending;
});

test("a counter with no primary HP loss still breathes at the simultaneous contact", async () => {
    const f = fixture();
    f.event.damage.secondary.push({
        source: "fire_breath",
        unitId: "counter-rear",
        position: f.counterRear.getPosition(),
        amount: 17,
        unitsDied: 1,
    });
    const amounts = new Map([...f.captured].map(([id]) => [id, 3]));
    const plan = f.scene.buildCombatExchange(f.dragon, f.primary, f.event, amounts, new Set(["friendly"]));
    expect(plan).toHaveLength(2);
    expect(plan[1]).toMatchObject({ attackerId: "primary", targetId: "dragon", response: true, amount: 0 });
    f.plan.splice(0, f.plan.length, ...plan);
    const pending = f.play();
    await flush();
    expect(f.events).toContain("dragon:attack");
    expect(f.events).toContain("primary:attack");
    expect(f.events).toContain("damage:17");
    expect(f.events).toContain("counter-rear:hit");
    expect(f.counterRear.displayedAmount).toBe(2);
    // The primary victim's own outgoing counter must finish before its incoming hit reaction.
    expect(f.events).not.toContain("primary:hit");
    await f.settle();
    await pending;
    expect(f.events.filter((entry) => entry === "damage:17")).toHaveLength(1);
    expect(f.events.filter((entry) => entry === "primary:hit")).toHaveLength(1);
});

test("zero breath payloads cannot invent damage, burns, casualties or hit reactions", async () => {
    const f = fixture();
    f.event.damage.secondary.splice(0, 2, {
        source: "fire_breath",
        unitId: "rear",
        position: f.rear.getPosition(),
        amount: 0,
        unitsDied: 0,
    });
    const pending = f.play();
    await flush();
    expect(f.events.filter((entry) => entry.startsWith("damage:"))).toEqual(["damage:10"]);
    expect(f.events).not.toContain("rear:hit");
    expect(f.events).not.toContain("burn:300");
    expect(f.rear.displayedAmount).toBe(3);
    await f.settle();
    await pending;
});

test("a recorded victim missing even from captured figures still gets its number at contact", async () => {
    const f = fixture();
    f.units.delete("rear");
    f.captured.delete("rear");
    const pending = f.play();
    await flush();
    expect(f.events).toContain("damage:21");
    expect(f.events).not.toContain("rear:hit");
    await f.settle();
    await pending;
    const beforeFallback = [...f.events];
    f.scene.showSecondaryDamageNumbers(f.event.damage.secondary, f.dragon.getPosition());
    f.timers.splice(0).forEach((callback) => callback());
    expect(f.events).toEqual(beforeFallback);
});

test("a stack revived after a lethal breath keeps its final living count and does not die visually", async () => {
    const f = fixture();
    f.event.unitIdsDied = ["friendly"];
    f.friendly.logicalAmount = 1;
    f.units.set("friendly", f.friendly);
    f.friendly.clearDamagePresentation = () => (f.friendly.displayedAmount = f.friendly.logicalAmount);
    const pending = f.scene.playCombatExchange(
        f.dragon,
        f.primary,
        f.event,
        f.plan,
        (unit: RenderableUnit) => f.events.push(`${unit.getId()}:death`),
        f.captured,
        [],
        false,
        { amountsBefore: new Map([...f.captured].map(([id]) => [id, 3])), deadIds: new Set() },
    );
    await f.settle();
    expect(await pending).toEqual(new Set());
    expect(f.events).toContain("damage:30");
    expect(f.events).not.toContain("friendly:death");
    expect(f.friendly.displayedAmount).toBe(1);
});

test("replaying the same event again presents its breath again, without retaining stale deduplication", async () => {
    const f = fixture();
    for (let index = 0; index < 2; index++) {
        const pending = f.play();
        await f.settle();
        await pending;
    }
    expect(f.events.filter((entry) => entry === "damage:21")).toHaveLength(2);
    expect(f.events.filter((entry) => entry === "friendly:death")).toHaveLength(2);
});

test("teardown while loading breath textures discards the whole pending impact", async () => {
    const f = fixture();
    let ready!: () => void;
    f.rear.getAnimationTextureKey = () => "cold-hit";
    f.scene.waitForTexture = () => new Promise<boolean>((resolve) => (ready = () => resolve(true)));
    const pending = f.play();
    await flush();
    f.scene.isSceneDestroyed = () => true;
    ready();
    await pending;
    expect(f.events).toEqual([]);
});

test.each([
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
])("recorded rear positions assign initiating/counter breath in direction (%i, %i)", (x, y) => {
    const source = { x: 10, y: 10 };
    const primary = { x: source.x + x * 10, y: source.y + y * 10 };
    const hit = (id: string, distance: number): NonNullable<IVisibleDamage["secondary"]>[number] => ({
        source: "fire_breath",
        unitId: id,
        position: { x: source.x + x * distance, y: source.y + y * distance },
        amount: 1,
        unitsDied: 0,
    });
    const secondary = [hit("rear", 20), hit("far", 30), hit("counter-rear", -10)];
    expect(fireBreathHitsForStrike(secondary, source, primary)).toEqual(secondary.slice(0, 2));
    expect(fireBreathHitsForStrike(secondary, primary, source)).toEqual(secondary.slice(2));
    expect(fireBreathHitsForStrike(secondary, source, source)).toEqual([]);
});
