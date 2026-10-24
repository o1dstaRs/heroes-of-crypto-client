import { describe, expect, mock, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
    type GameAction,
    type GameEvent,
    type IVisibleDamage,
} from "@heroesofcrypto/common";

import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";

const grid = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
const makeUnit = (name: string, faction: string, team: 1 | 2) => {
    const effects = new EffectFactory();
    const unit = RenderableUnit.fromBase(
        Unit.createUnit(
            HoCConfig.getCreatureConfig(team, faction, name, "", 10),
            grid,
            team,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        ),
        () => undefined,
    );
    Object.assign(unit.getUnitProperties(), { amount_alive: 10, hp: 10, max_hp: 10 });
    return unit;
};

/** Run the real live entry through the engine result and exchange callback; stop before unrelated cleanup. */
const fixture = ({ fairy = false, noMelee = false, ranged = false } = {}) => {
    const attacker = makeUnit(fairy ? "Fairy" : "Squire", fairy ? "Nature" : "Life", TeamVals.LEFT);
    const target = makeUnit(noMelee ? "Tsar Cannon" : "Squire", "Life", TeamVals.RIGHT);
    if (noMelee) expect(target.hasAbilityActive("No Melee")).toBe(true);
    const units = new Map([
        [attacker.getId(), attacker],
        [target.getId(), target],
    ]);
    const damage: IVisibleDamage = {
        amount: 10,
        render: true,
        unitId: target.getId(),
        unitPosition: target.getPosition(),
        unitIsSmall: true,
        hits: [{ amount: 10, unitsDied: 1 }],
    };
    const attackEvent = {
        type: "unit_attacked",
        attackerId: attacker.getId(),
        targetId: target.getId(),
        attackType: ranged ? "range" : "melee",
        damage,
        unitIdsDied: [],
        animations: [],
    } as Extract<GameEvent, { type: "unit_attacked" }>;
    const events: GameEvent[] = [attackEvent];
    const stopped = new Error("exchange captured");
    const buildCombatExchange = mock(() => []);
    const popDullingDefenseApplications = mock(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => units },
        sc_sceneSettings: { getGridSettings: () => grid },
        sc_sceneLog: { getLogSize: () => 0 },
        shownBuffsByUnit: new Map(),
        clearCommittedBoardActionPreview: () => undefined,
        snapshotRenderableUnits: () => units,
        noteDeathBlowsFromAttackEvent: () => undefined,
        scheduleSceneTimeout: () => 1,
        clearSceneTimeout: () => undefined,
        shouldDeferActionToAuthoritativeReplay: () => false,
        resolveRangeShotAim: () => undefined,
        footprintCenterForAnchor: () => attacker.getPosition(),
        spawnFireBreathVfx: () => undefined,
        createActionEngine: () => ({
            apply: () => {
                Object.assign(attacker.getUnitProperties(), { amount_alive: 7 });
                return { completed: true, events };
            },
        }),
        buildCombatExchange,
        popDullingDefenseApplications,
        playCombatExchange: async () => {
            scene.popRecordedDullingDefense(events, new Set([attacker.getId()]));
            scene.popRecordedDullingDefense(events, new Set([attacker.getId()]));
            throw stopped;
        },
    });
    const run = async () => {
        Object.assign(attacker.getUnitProperties(), { amount_alive: 10 });
        const action: GameAction = {
            type: ranged ? "range_attack" : "melee_attack",
            attackerId: attacker.getId(),
            targetId: target.getId(),
            attackFrom: { x: 0, y: 0 },
        };
        await expect(scene.executeAttackSequence(attacker, target, { x: 0, y: 0 }, action)).rejects.toBe(stopped);
        return (buildCombatExchange.mock.calls.at(-1) as unknown as unknown[])[5];
    };
    return { attacker, target, attackEvent, events, damage, scene, run, popDullingDefenseApplications };
};

describe("live attack presentation", () => {
    test.each(["ember_covenant", "water_shield"] as const)(
        "%s preserves a fully absorbed ranged counter onto a screening ally",
        async (source) => {
            const h = fixture({ ranged: true });
            const screen = makeUnit("Squire", "Life", TeamVals.LEFT);
            Object.assign(h.attacker, { getPosition: () => ({ x: 0, y: 0 }) });
            Object.assign(h.target, { getPosition: () => ({ x: 500, y: 0 }) });
            Object.assign(screen, { getPosition: () => ({ x: 100, y: 0 }) });
            h.scene.unitsHolder.getAllUnits().set(screen.getId(), screen);
            h.damage.secondary = [
                { source, unitId: screen.getId(), position: screen.getPosition(), amount: 47, unitsDied: 0 },
            ];
            h.attackEvent.animations = [
                {
                    fromPosition: h.attacker.getPosition(),
                    toPosition: h.target.getPosition(),
                    affectedUnitId: h.target.getId(),
                },
                {
                    fromPosition: h.target.getPosition(),
                    toPosition: screen.getPosition(),
                    affectedUnitId: screen.getId(),
                },
            ];
            expect(await h.run()).toEqual({ amount: 0, unitsDied: 0 });
        },
    );

    test.each(["ember_covenant", "water_shield"] as const)(
        "the live damage summary cannot repeat %s already presented at contact",
        async (source) => {
            const h = fixture();
            const amounts: number[] = [];
            let summary: IVisibleDamage["secondary"];
            h.damage.secondary = [
                {
                    source,
                    unitId: h.target.getId(),
                    position: h.target.getPosition(),
                    amount: 47,
                    unitsDied: 0,
                },
            ];
            h.scene.combatVisuals = {
                showFloatingAbsorbed: (_position: unknown, amount: number) => amounts.push(amount),
            };
            h.scene.spawnFireBreathVfx = (_a: unknown, _b: unknown, damage: IVisibleDamage) => {
                summary = damage.secondary;
            };
            const stop = h.scene.playCombatExchange;
            h.scene.playCombatExchange = async () => {
                h.scene.showShieldAbsorbsAtImpact(h.damage, new Set([h.target.getId()]), { x: 0, y: 0 });
                h.scene.showShieldAbsorbs(summary, { x: 0, y: 0 });
                return stop();
            };
            await h.run();
            expect(amounts).toEqual([47]);
        },
    );

    test("a legal counter retains only the defender's direct damage", async () => {
        const h = fixture();
        h.damage.secondary = [
            { source: "fire_shield", unitId: h.attacker.getId(), position: { x: 0, y: 0 }, amount: 10, unitsDied: 1 },
        ];
        expect(await h.run()).toEqual({ amount: 20, unitsDied: 2 });
    });

    test("Shadow Touch does not turn unrelated HP loss into a counter", async () => {
        const h = fixture({ fairy: true });
        expect(h.attacker.canSkipResponse()).toBe(true);
        expect(await h.run()).toBeUndefined();
    });

    test("a No Melee defender cannot counter", async () => {
        expect(await fixture({ noMelee: true }).run()).toBeUndefined();
    });

    test.each([10, 30])("Last Fuse damage (%i) stays separate from retaliation", async (amount) => {
        const h = fixture();
        h.events.push({
            type: "pyre_exploded",
            unitId: "corpse",
            position: { x: 0, y: 0 },
            hits: [{ unitId: h.attacker.getId(), position: { x: 0, y: 0 }, amount, unitsDied: amount / 10 }],
        });
        expect(await h.run()).toEqual(amount === 30 ? undefined : { amount: 20, unitsDied: 2 });
    });

    test("Dulling Defense proves a zero-HP-loss counter and pops once on each action", async () => {
        const h = fixture();
        h.events.push({
            type: "effects_applied",
            applications: [{ unitId: h.attacker.getId(), name: "Dulling Defense", kind: "debuff", laps: 15 }],
        });
        h.damage.secondary = [
            { source: "fire_shield", unitId: h.attacker.getId(), position: { x: 0, y: 0 }, amount: 30, unitsDied: 3 },
        ];
        for (let action = 1; action <= 2; action++) {
            expect(await h.run()).toEqual({ amount: 0, unitsDied: 0 });
            expect(h.popDullingDefenseApplications).toHaveBeenCalledTimes(action);
        }
    });

    test("recorded Chakram counter uses its screening victim and direct hit", async () => {
        const h = fixture({ ranged: true });
        const screen = makeUnit("Squire", "Life", TeamVals.LEFT);
        h.scene.unitsHolder.getAllUnits().set(screen.getId(), screen);
        h.damage.chakramFlights = [
            {
                attackerId: h.target.getId(),
                primaryTargetId: screen.getId(),
                hitIndex: 0,
                response: true,
                missed: false,
                arcs: [],
                splash: [{ unitId: screen.getId(), position: screen.getPosition(), amount: 12, unitsDied: 1 }],
            },
        ];
        expect(await h.run()).toEqual({ amount: 12, unitsDied: 1 });
    });
});
