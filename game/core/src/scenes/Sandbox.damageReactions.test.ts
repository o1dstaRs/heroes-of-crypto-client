import { expect, test } from "bun:test";

import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import type { CombatExchangeStrike } from "./sandbox/combat_exchange";

const fixture = () => {
    const reactions: string[] = [];
    const animations: string[] = [];
    const sounds: string[] = [];
    const damageNumbers: number[] = [];
    const makeUnit = (id: string, x: number) =>
        Object.assign(Object.create(RenderableUnit.prototype), {
            getId: () => id,
            getName: () => "Test Unit",
            getTeam: () => (id === "attacker" ? 1 : 2),
            getUnitProperties: () => ({ name: "Test Unit", level: 1 }),
            getPosition: () => ({ x, y: 0 }),
            getVisualCenter: () => ({ x, y: 0 }),
            getDamagePredictionAnchor: () => ({ x, y: 100 }),
            getAmountAlive: () => 10,
            getCumulativeHp: () => 100,
            getMaxHp: () => 10,
            isDead: () => false,
            getAnimationTextureKey: () => undefined,
            hasAbilityActive: () => false,
            getAbility: () => undefined,
            beginDamagePresentation: () => {},
            presentDamageCasualties: () => {},
            applyHitReaction: () => reactions.push(id),
        });
    const attacker = makeUnit("attacker", 0);
    const target = makeUnit("target", 100);
    const units = new Map([
        [attacker.getId(), attacker],
        [target.getId(), target],
    ]);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => units },
        sc_sceneSettings: { getGridSettings: () => ({ getCellSize: () => 100 }) },
        preDeferredActionUnitHp: undefined,
        isSceneDestroyed: () => false,
        prepareDirectionalAttackState: () => "attack",
        offsetReplayDamagePosition: (position: unknown) => position,
        playReplayOneShot: (unit: RenderableUnit, state: string) => {
            animations.push(`${unit.getId()}:${state}`);
            return Promise.resolve();
        },
        playReplayProjectile: (_source: unknown, _victim: unknown, _position: unknown, impact: () => void) => {
            impact();
            return Promise.resolve();
        },
        playUnitCombatSound: (unit: RenderableUnit, role: string) => sounds.push(`${unit.getId()}:${role}`),
        showAttackMissedVfx: () => animations.push("dodge"),
        popRecordedDullingDefense: () => {},
        combatVisuals: {
            showFloatingDamage: (_position: unknown, amount: number) => damageNumbers.push(amount),
        },
    });
    const event = {
        type: "unit_attacked",
        attackType: "melee",
        attackerId: attacker.getId(),
        targetId: target.getId(),
        damage: { amount: 40, hits: [{ amount: 0, unitsDied: 0 }], secondary: [] },
        animations: [
            { affectedUnitId: attacker.getId(), toPosition: { x: 80, y: 0 } },
            { affectedUnitId: target.getId(), toPosition: { x: 100, y: 0 } },
        ],
    };
    const record = (targetHp = 100, attackerHp = 100) => ({
        events: [],
        stateAfter: {
            units: [
                { properties: { id: attacker.getId(), amount_alive: 10, hp: attackerHp - 90, max_hp: 10 } },
                { properties: { id: target.getId(), amount_alive: 10, hp: targetHp - 90, max_hp: 10 } },
            ],
        },
    });
    return { scene, attacker, target, event, record, reactions, animations, sounds, damageNumbers };
};

test.each(["melee", "range"])("%s movement and projectile metadata do not hurt undamaged units", (attackType) => {
    const { scene, attacker, event, record, reactions } = fixture();
    scene.applyReplayAttackRecoil(attacker, { ...event, attackType }, new Set(), record());
    expect(reactions).toEqual([]);
});

test("an absorbed hit and an effect application do not become damage reactions", () => {
    const { scene, attacker, event, record, reactions } = fixture();
    const shielded = {
        ...event,
        damage: {
            ...event.damage,
            secondary: [{ source: "water_shield", unitId: "target", amount: 40, unitsDied: 0 }],
        },
    };
    scene.applyReplayAttackRecoil(attacker, shielded, new Set(), {
        ...record(),
        events: [{ type: "effects_applied", applications: [{ unitId: "target", name: "Dulling Defense" }] }],
    });
    expect(reactions).toEqual([]);
});

test("replay fallback reacts only on the unit that actually lost HP", () => {
    const { scene, attacker, event, record, reactions } = fixture();
    scene.applyReplayAttackRecoil(attacker, event, new Set(), record(99));
    expect(reactions).toEqual(["target"]);
});

test("captured pre-action HP preserves real reactions after authoritative state was applied", () => {
    const { scene, attacker, target, event, record, reactions } = fixture();
    target.getCumulativeHp = () => 99;
    scene.preDeferredActionUnitHp = new Map([["target", { amount: 10, cumulativeHp: 100, maxHp: 10 }]]);
    scene.applyReplayAttackRecoil(attacker, event, new Set(), record(99));
    expect(reactions).toEqual(["target"]);
});

test("a real reaction already presented by the exchange is not replayed", () => {
    const { scene, attacker, event, record, reactions } = fixture();
    scene.applyReplayAttackRecoil(attacker, event, new Set(["target"]), record(99));
    expect(reactions).toEqual([]);
});

test.each([0, -1, Number.NaN])("the shared damage-reaction helper ignores %s received damage", (amount) => {
    const { scene, target, reactions } = fixture();
    scene.applyHitReactionFromPoint(target, { x: 0, y: 0 }, amount);
    expect(reactions).toEqual([]);
});

test("the shared damage-reaction helper retains a one-HP hit without casualties", () => {
    const { scene, target, reactions } = fixture();
    scene.applyHitReactionFromPoint(target, { x: 0, y: 0 }, 1);
    expect(reactions).toEqual(["target"]);
});

const strike = (overrides: Partial<CombatExchangeStrike> = {}): CombatExchangeStrike => ({
    attackerId: "attacker",
    targetId: "target",
    amount: 0,
    unitsDied: 0,
    lethal: false,
    response: false,
    hitIndex: 0,
    ...overrides,
});

test.each(["melee", "range"])("%s zero-damage strikes and counters animate only the attack", async (attackType) => {
    const { scene, attacker, target, event, animations, sounds, damageNumbers } = fixture();
    await scene.playCombatExchange(
        attacker,
        target,
        { ...event, attackType },
        [strike(), strike({ attackerId: "target", targetId: "attacker", response: true })],
        () => {},
    );
    expect(animations).toEqual(["attacker:attack", "target:attack"]);
    expect(sounds.filter((sound) => sound.endsWith(":hurt"))).toEqual([]);
    expect(damageNumbers).toEqual([]);
});

test.each(["melee", "range"])("%s misses ignore a pre-mitigation damage amount", async (attackType) => {
    const { scene, attacker, target, event, animations, sounds, damageNumbers } = fixture();
    await scene.playCombatExchange(
        attacker,
        target,
        { ...event, attackType },
        [strike({ amount: 40, missed: true })],
        () => {},
    );
    expect(animations).toEqual(["attacker:attack", "dodge"]);
    expect(sounds.filter((sound) => sound.endsWith(":hurt"))).toEqual([]);
    expect(damageNumbers).toEqual([]);
});

test("an absorbed first strike followed by a damaging second strike produces one hit reaction", async () => {
    const { scene, attacker, target, event, animations, sounds, damageNumbers } = fixture();
    const plan = scene.buildCombatExchange(
        attacker,
        target,
        {
            ...event,
            damage: {
                ...event.damage,
                hits: [
                    { amount: 0, unitsDied: 0 },
                    { amount: 1, unitsDied: 0 },
                ],
            },
        },
        new Map([["target", 10]]),
        new Set(),
    );
    await scene.playCombatExchange(attacker, target, event, plan, () => {});
    expect(animations).toEqual(["attacker:attack", "attacker:attack", "target:hit"]);
    expect(sounds.filter((sound) => sound.endsWith(":hurt"))).toEqual(["target:hurt"]);
    expect(damageNumbers).toEqual([1]);
});
