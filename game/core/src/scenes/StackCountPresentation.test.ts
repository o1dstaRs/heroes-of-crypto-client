import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { Container, Texture } from "pixi.js";
import {
    AbilityFactory,
    EffectFactory,
    FightStateManager,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
    type ISceneLog,
    type UnitsHolder,
} from "@heroesofcrypto/common";

import { applyRankedUnitSnapshotStats } from "./RankedPlayScene";
import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import { CombatVisuals } from "./sandbox/CombatVisuals";

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const sceneLog: ISceneLog = { getLog: () => "", updateLog: () => {}, hasBeenUpdated: () => false };
const createUnit = () => {
    const effects = new EffectFactory();
    return RenderableUnit.fromBase(
        Unit.createUnit(
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Squire", "squire_512", 10),
            gs,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        ),
        () => Texture.WHITE,
    );
};
const containers: Container[] = [];
const visualsFor = (unit: RenderableUnit, onPop = () => {}) =>
    new CombatVisuals({
        getGridSettings: () => gs,
        getUnitsHolder: () => ({ getAllUnits: () => new Map([[unit.getId(), unit]]) }) as unknown as UnitsHolder,
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => {},
        setUnitPropertiesUpdateNeeded: () => {},
        attachToWorldRoot: (container) => {
            containers.push(container);
            onPop();
        },
    });
let textureFrom: ReturnType<typeof spyOn<typeof Texture, "from">>;
beforeEach(() => {
    FightStateManager.getInstance().reset();
    textureFrom = spyOn(Texture, "from").mockReturnValue(Texture.WHITE);
});
afterEach(() => {
    textureFrom.mockRestore();
    for (const container of containers.splice(0)) {
        if (!container.destroyed) container.destroy({ children: true });
    }
    FightStateManager.getInstance().reset();
});
const flush = async () => {
    for (let index = 0; index < 12; index++) await Promise.resolve();
};

describe("stack counts at damage impact", () => {
    test("local resolved casualties stay on the ribbon until each damage bubble appears", () => {
        const unit = createUnit();
        expect(unit.getDisplayedAmount()).toBe(10);
        FightStateManager.getInstance().getFightProperties().startFight();
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            replayRecordingSuspended: true,
            unitsHolder: { getAllUnits: () => new Map([[unit.getId(), unit]]) },
        });
        const engine = scene.createReplayRecordingActionEngine({
            apply: () => {
                unit.applyDamage(3 * unit.getMaxHp(), 0, sceneLog);
                return { completed: true, events: [] };
            },
        });
        engine.apply({ type: "end_turn", unitId: unit.getId() });
        expect(unit.getAmountAlive()).toBe(7);
        expect(unit.getDisplayedAmount()).toBe(10);

        const countsAtPop: number[] = [];
        const visuals = visualsFor(unit, () => countsAtPop.push(unit.getDisplayedAmount()));
        visuals.showFloatingDamage({ x: 0, y: 0 }, 20, undefined, 2, undefined, undefined, undefined, unit);
        expect(unit.getDisplayedAmount()).toBe(8);
        visuals.showFloatingDamage({ x: 0, y: 0 }, 10, undefined, 1, undefined, undefined, undefined, unit);
        expect(countsAtPop).toEqual([8, 7]);
        expect(unit.getAmountAlive()).toBe(7);
    });

    test("ranked bubbles change the visible count without applying combat damage twice", () => {
        const unit = createUnit();
        unit.beginDamagePresentation();
        const visuals = visualsFor(unit);
        visuals.showFloatingDamage({ x: 0, y: 0 }, 20, undefined, 2, undefined, undefined, undefined, unit);
        expect(unit.getDisplayedAmount()).toBe(8);
        expect(unit.getAmountAlive()).toBe(10);
        applyRankedUnitSnapshotStats(unit, { ...unit.getUnitProperties(), amount_alive: 8, amount_died: 2 });
        expect(unit.getAmountAlive()).toBe(8);
        expect(unit.getDisplayedAmount()).toBe(8);
    });

    test("damage with no kills preserves the count, and a lethal result cannot make it negative", () => {
        const unit = createUnit();
        unit.beginDamagePresentation();
        const visuals = visualsFor(unit);
        visuals.showFloatingDamage({ x: 0, y: 0 }, 1, undefined, 0, undefined, undefined, undefined, unit);
        expect(unit.getDisplayedAmount()).toBe(10);
        visuals.showFloatingDamage({ x: 0, y: 0 }, 1000, undefined, 10, undefined, undefined, undefined, unit);
        expect(unit.getDisplayedAmount()).toBe(0);
        unit.presentDamageCasualties(2);
        expect(unit.getDisplayedAmount()).toBe(0);
    });

    test("a delayed burn subtracts casualties when its bubble starts, not when it is queued", () => {
        const unit = createUnit();
        unit.beginDamagePresentation();
        const visuals = visualsFor(unit);
        visuals.showFloatingDamageDelayed({ x: 0, y: 0 }, 20, 2, 0.5, "#ffb347", "#5a1500", unit);
        visuals.update(0.3);
        expect(unit.getDisplayedAmount()).toBe(10);
        visuals.update(0.3);
        expect(unit.getDisplayedAmount()).toBe(8);
    });

    test("Flesh Shield losses update the bearer's count with its absorbed-damage bubble", () => {
        const unit = createUnit();
        unit.beginDamagePresentation();
        const visuals = visualsFor(unit);
        visuals.showFloatingAbsorbed({ x: 0, y: 0 }, 30, undefined, 3, unit);
        expect(unit.getDisplayedAmount()).toBe(7);
    });

    test("a subsequent model change or unchanged authoritative snapshot clears the presentation", () => {
        const unit = createUnit();
        unit.beginDamagePresentation();
        unit.presentDamageCasualties(2);
        expect(unit.getDisplayedAmount()).toBe(8);
        applyRankedUnitSnapshotStats(unit, { ...unit.getUnitProperties() });
        expect(unit.getDisplayedAmount()).toBe(10);
        unit.beginDamagePresentation();
        unit.presentDamageCasualties(2);
        unit.setAmountAlive(12);
        expect(unit.getDisplayedAmount()).toBe(12);
    });

    test("each projectile and counter subtracts only its own casualties at contact", async () => {
        const attacker = createUnit();
        const target = createUnit();
        attacker.getAnimationTextureKey = target.getAnimationTextureKey = () => undefined;
        const units = new Map([
            [attacker.getId(), attacker],
            [target.getId(), target],
        ]);
        const contacts: (() => void)[] = [];
        const countsAtPop: number[][] = [];
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            sc_sceneSettings: { getGridSettings: () => gs },
            unitsHolder: { getAllUnits: () => units },
            dyingVisualUnits: new Set(),
            isSceneDestroyed: () => false,
            prepareDirectionalAttackState: () => "attack",
            offsetReplayDamagePosition: (position: unknown) => position,
            popRecordedDullingDefense: () => {},
            playUnitCombatSound: () => {},
            playReplayOneShot: () => Promise.resolve(),
            combatVisuals: visualsFor(target, () =>
                countsAtPop.push([attacker.getDisplayedAmount(), target.getDisplayedAmount()]),
            ),
            playReplayProjectile: (_a: unknown, _b: unknown, _position: unknown, onImpact: () => void) =>
                new Promise<void>((resolve) =>
                    contacts.push(() => {
                        onImpact();
                        resolve();
                    }),
                ),
        });
        const plan = [
            { attackerId: attacker.getId(), targetId: target.getId(), unitsDied: 2, response: false, hitIndex: 0 },
            { attackerId: target.getId(), targetId: attacker.getId(), unitsDied: 1, response: true, hitIndex: 0 },
            { attackerId: attacker.getId(), targetId: target.getId(), unitsDied: 3, response: false, hitIndex: 1 },
        ].map((strike) => ({ ...strike, amount: 20, lethal: false }));
        const playback = scene.playCombatExchange(
            attacker,
            target,
            { attackType: "range", damage: {} },
            plan,
            () => {},
        );
        await flush();
        expect(countsAtPop).toEqual([]);
        expect(contacts).toHaveLength(2);
        expect(target.getDisplayedAmount()).toBe(10);
        contacts.shift()!();
        await flush();
        expect(countsAtPop).toEqual([[10, 8]]);
        expect(contacts).toHaveLength(1);
        contacts.shift()!();
        await flush();
        expect(countsAtPop).toEqual([
            [10, 8],
            [9, 8],
        ]);
        contacts.shift()!();
        await playback;
        expect(countsAtPop).toEqual([
            [10, 8],
            [9, 8],
            [9, 5],
        ]);
        expect(attacker.getAmountAlive()).toBe(10);
        expect(target.getAmountAlive()).toBe(10);
    });
});
