import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    AbilityFactory,
    AttackHandler,
    createSequenceGameRuntime,
    EffectFactory,
    FightProperties,
    FightStateManager,
    GameActionEngine,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    MoveHandler,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
    type GameAction,
    type GameEvent,
    type HoCMath,
    type IGameActionResult,
    type TeamType,
} from "@heroesofcrypto/common";

import type { SandboxReplayActionRecord } from "../replay/sandbox_replay";
import { DamageStatisticHolder } from "./DamageStats";
import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import type { IFireProjectileOptions } from "./sandbox/RangedProjectiles";

type XY = HoCMath.XY;
type AreaEvent = Extract<GameEvent, { type: "area_attacked" }>;
type AreaScene = {
    performAreaThrow(unit: RenderableUnit, cell: XY, position: XY, record?: SandboxReplayActionRecord): Promise<void>;
};
const settings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const point = (cell: XY): XY =>
    GridMath.getPositionForCell(cell, settings.getMinX(), settings.getStep(), settings.getHalfStep());
let previousFight: FightProperties;
beforeEach(() => {
    previousFight = FightStateManager.getInstance().getFightProperties();
    FightStateManager.getInstance().setFightProperties(new FightProperties());
});
afterEach(() => FightStateManager.getInstance().setFightProperties(previousFight));

function fixture(team: TeamType) {
    const grid = new Grid(settings, GridVals.NORMAL);
    const holder = new UnitsHolder(grid);
    const effects = new EffectFactory();
    const abilities = new AbilityFactory(effects);
    const sceneLog = { getLog: () => "", updateLog: () => {}, hasBeenUpdated: () => false };
    const handler = new AttackHandler(settings, grid, sceneLog, new DamageStatisticHolder());
    const place = (unit: Unit, anchor: XY) => {
        const position = GridMath.getPositionForFootprintAnchor(
            settings,
            anchor,
            unit.getFootprintWidth(),
            unit.getFootprintHeight(),
        );
        unit.setPosition(position.x, position.y);
        expect(
            grid.occupyCells(unit.getCells(), unit.getId(), unit.getTeam(), unit.getAttackRange(), false, false),
        ).toBe(true);
        holder.addUnit(unit);
        return unit;
    };
    const attacker = RenderableUnit.fromBase(
        Unit.createUnit(
            HoCConfig.getCreatureConfig(team, "Nature", "Gargantuan", "gargantuan_512", 1),
            settings,
            team,
            UnitVals.CREATURE,
            abilities,
            effects,
            false,
        ),
        () => undefined,
    );
    place(attacker, { x: team === TeamVals.LEFT ? 3 : 12, y: 3 });
    attacker.refreshPossibleAttackTypes(true);
    const aim = { x: team === TeamVals.LEFT ? 12 : 3, y: 3 };
    const enemyTeam = team === TeamVals.LEFT ? TeamVals.RIGHT : TeamVals.LEFT;
    const enemy = (anchor: XY, width = 1, height = 1) => {
        const properties = {
            ...HoCConfig.getCreatureConfig(enemyTeam, "Might", "Berserker", "berserker_512", 100),
            footprint_width: width,
            footprint_height: height,
        };
        return place(
            Unit.createUnit(properties, settings, enemyTeam, UnitVals.CREATURE, abilities, effects, false),
            anchor,
        );
    };
    const remove = (unit: Unit) => {
        grid.cleanupAll(unit.getId(), unit.getAttackRange(), unit.isSmallSize());
        holder.deleteUnitById(unit.getId());
    };
    const fight = FightStateManager.getInstance().getFightProperties();
    fight.startFight();
    fight.startTurn(team, 1_000);
    const engine = new GameActionEngine({
        fightProperties: fight,
        grid,
        unitsHolder: holder,
        attackHandler: handler,
        moveHandler: new MoveHandler(settings, grid, holder),
        sceneLog,
        getCurrentActiveUnitId: () => attacker.getId(),
        runtime: createSequenceGameRuntime({ nowMillis: [1_400] }),
    });
    const resolve = (): { event: AreaEvent; record: SandboxReplayActionRecord } => {
        const action = { type: "area_throw_attack" as const, attackerId: attacker.getId(), targetCell: aim };
        const result = engine.apply(action);
        expect(result.completed).toBe(true);
        const event = result.events.find((candidate): candidate is AreaEvent => candidate.type === "area_attacked");
        expect(event).toBeDefined();
        return {
            event: event!,
            record: {
                sequence: 1,
                clientTimeMs: 1_400,
                action,
                events: result.events,
                stateAfter: {
                    gridType: GridVals.NORMAL,
                    currentLap: fight.getCurrentLap(),
                    fightStarted: true,
                    fightFinished: fight.hasFightFinished(),
                    units: [],
                },
            },
        };
    };
    const capture = async (record?: SandboxReplayActionRecord): Promise<IFireProjectileOptions> => {
        const launches: IFireProjectileOptions[] = [];
        const stop = new Error("First projectile endpoint captured");
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            grid,
            unitsHolder: holder,
            attackHandler: handler,
            currentActiveUnit: attacker,
            sc_sceneSettings: { getGridSettings: () => settings },
            shouldDeferActionToAuthoritativeReplay: () => false,
            rangedProjectiles: {
                fire: (options: IFireProjectileOptions) => {
                    launches.push(options);
                    return Promise.reject(stop);
                },
            },
        }) as AreaScene;
        await expect(scene.performAreaThrow(attacker, aim, point(aim), record)).rejects.toBe(stop);
        expect(launches).toHaveLength(1);
        expect(launches[0].gargantuanRock).toBe(true);
        expect(launches[0].big).toBe(true);
        return launches[0];
    };
    const complete = async () => {
        const launches: IFireProjectileOptions[] = [];
        const waveSizes: number[] = [];
        let result: IGameActionResult | undefined;
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            grid,
            unitsHolder: holder,
            attackHandler: handler,
            currentActiveUnit: attacker,
            sc_sceneSettings: { getGridSettings: () => settings },
            shouldDeferActionToAuthoritativeReplay: () => false,
            rangedProjectiles: {
                fire: (options: IFireProjectileOptions) => {
                    launches.push(options);
                    return Promise.resolve();
                },
            },
            snapshotRenderableUnits: () => new Map(),
            createActionEngine: () => ({
                apply: (action: GameAction) => {
                    result = engine.apply(action);
                    return result;
                },
            }),
            noteDeathBlowsFromAttackEvent: () => {},
            showFleshShieldAbsorbedDamage: () => new Map<string, number>(),
            showWaterShieldAbsorbs: () => {},
            showSplashDamage: (splash: AreaEvent["damage"]["splash"]) => {
                waveSizes.push(splash?.length ?? 0);
                return !!splash?.length;
            },
            combatVisuals: { showDamageVisualsFromDiff: () => {} },
            hoverManager: {
                clearAOEArea: () => {},
                clearAttackVisuals: () => {},
                clearHoverSilhouette: () => {},
            },
            cleanupDeadUnits: () => {},
            refreshUnits: () => {},
            applyTurnEngineEvents: () => {},
            reportRefusedLocalAction: () => {
                throw new Error("Native Area Throw unexpectedly refused");
            },
        }) as AreaScene;
        await scene.performAreaThrow(attacker, aim, point(aim));
        expect(result?.completed).toBe(true);
        const event = result?.events.find((candidate): candidate is AreaEvent => candidate.type === "area_attacked");
        expect(event).toBeDefined();
        return { launches, waveSizes, event: event! };
    };
    const defer = async () => {
        const submitted: GameAction[] = [];
        const launches: IFireProjectileOptions[] = [];
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            grid,
            unitsHolder: holder,
            attackHandler: handler,
            currentActiveUnit: attacker,
            sc_sceneSettings: { getGridSettings: () => settings },
            shouldDeferActionToAuthoritativeReplay: () => true,
            submitActionForAuthoritativeReplay: (action: GameAction) => {
                submitted.push(action);
                return true;
            },
            rangedProjectiles: {
                fire: (options: IFireProjectileOptions) => {
                    launches.push(options);
                    return Promise.resolve();
                },
            },
            hoverManager: {
                clearAOEArea: () => {},
                clearAttackVisuals: () => {},
                clearHoverSilhouette: () => {},
            },
        }) as AreaScene;
        await scene.performAreaThrow(attacker, aim, point(aim));
        return { submitted, launches };
    };
    return { aim, attacker, grid, holder, handler, place, enemy, remove, resolve, capture, complete, defer };
}

describe("Sandbox Area Throw projectile landing", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        test(`team ${team}, a clear throw flies to the aimed cell center`, async () => {
            const f = fixture(team);
            f.enemy({ x: f.aim.x, y: 4 });
            const launch = await f.capture();
            const { event } = f.resolve();
            expect(event.targetCell).toEqual(f.aim);
            expect(launch.to).toEqual(event.targetPosition);
            expect(launch.to).toEqual(point(f.aim));
        });
        for (const [width, height] of [
            [1, 1],
            [1, 2],
            [2, 1],
            [2, 2],
        ]) {
            test(`team ${team}, a ${width}x${height} interceptor redirects the first boulder to the engine landing center`, async () => {
                const f = fixture(team);
                const target = f.enemy({ x: 7, y: height === 1 ? 3 : 4 }, width, height);
                const launch = await f.capture();
                const { event } = f.resolve();
                expect(event.targetCell).toEqual(target.getBaseCell());
                expect(event.targetCell).not.toEqual(f.aim);
                expect(launch.to).toEqual(event.targetPosition);
                expect(launch.to).toEqual(point(event.targetCell));
            });
        }
        for (const change of ["removed", "moved", "replaced"] as const) {
            test(`team ${team}, replay retains the recorded landing after its interceptor is ${change}`, async () => {
                const f = fixture(team);
                const target = f.enemy({ x: 7, y: 4 }, 1, 2);
                const { event, record } = f.resolve();
                expect(event.targetCell).toEqual(target.getBaseCell());
                f.remove(target);
                if (change === "moved") f.place(target, { x: 7, y: 10 });
                if (change === "replaced") f.enemy({ x: team === TeamVals.LEFT ? 5 : 10, y: 3 });
                expect(f.handler.projectAreaThrowTargetCell(f.holder.getAllUnits(), f.attacker, f.aim)).not.toEqual(
                    event.targetCell,
                );
                const launch = await f.capture(record);
                expect(launch.to).toEqual(event.targetPosition);
                expect(launch.to).toEqual(point(event.targetCell));
                expect(launch.to).not.toEqual(point(f.aim));
            });
        }
        test(`team ${team}, ranked submission retains the original empty aim and waits for replay before flight`, async () => {
            const f = fixture(team);
            const target = f.enemy({ x: 7, y: 4 }, 1, 2);
            expect(f.handler.projectAreaThrowTargetCell(f.holder.getAllUnits(), f.attacker, f.aim)).toEqual(
                target.getBaseCell(),
            );
            expect(target.getBaseCell()).not.toEqual(f.aim);
            const { submitted, launches } = await f.defer();
            expect(submitted).toEqual([
                { type: "area_throw_attack", attackerId: f.attacker.getId(), targetCell: f.aim },
            ]);
            expect(launches).toHaveLength(0);
            const { record } = f.resolve();
            const replayLaunch = await f.capture(record);
            expect(replayLaunch.to).toEqual(point(target.getBaseCell()));
        });
        test(`team ${team}, Double Throw flies twice to the same empty landing even when neither wave deals splash`, async () => {
            const f = fixture(team);
            f.enemy({ x: f.aim.x, y: 12 });
            const { launches, waveSizes, event } = await f.complete();
            expect(event.targetCell).toEqual(f.aim);
            expect(event.damage.splash ?? []).toHaveLength(0);
            expect(waveSizes).toEqual([0, 0]);
            expect(launches).toHaveLength(2);
            for (const launch of launches) {
                expect(launch.gargantuanRock).toBe(true);
                expect(launch.to).toEqual(event.targetPosition);
                expect(launch.to).toEqual(point(f.aim));
            }
        });
        test(`team ${team}, Double Throw retains its second flight after the interceptor dies in wave one`, async () => {
            const f = fixture(team);
            const target = f.enemy({ x: 7, y: 3 });
            Object.assign(target.getUnitProperties(), { amount_alive: 1, amount_died: 0, hp: 1 });
            f.enemy({ x: f.aim.x, y: 12 });
            const impactCell = target.getBaseCell();
            const { launches, waveSizes, event } = await f.complete();
            expect(event.targetCell).toEqual(impactCell);
            expect(event.unitIdsDied).toContain(target.getId());
            expect(event.damage.splash).toHaveLength(1);
            expect(waveSizes).toEqual([1, 0]);
            expect(launches).toHaveLength(2);
            for (const launch of launches) {
                expect(launch.gargantuanRock).toBe(true);
                expect(launch.to).toEqual(event.targetPosition);
                expect(launch.to).toEqual(point(impactCell));
            }
        });
    }
});
