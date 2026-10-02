import { afterEach, describe, expect, test } from "bun:test";

import {
    GridConstants,
    GridMath,
    GridSettings,
    TeamVals,
    type HoCMath,
    type IVisibleDamage,
    type TeamType,
} from "@heroesofcrypto/common";

import { releaseBoardMirror, setBoardMirror } from "../pixi/boardMirror";
import { Sandbox } from "./Sandbox";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";
import type { CombatExchangeStrike } from "./sandbox/combat_exchange";
import { hasRecordedChakramCounter } from "./sandbox/range_projectile_impact";

type XY = HoCMath.XY;
type Arc = NonNullable<IVisibleDamage["chakramArcs"]>[number];
type Splash = NonNullable<IVisibleDamage["splash"]>[number];
type Flight = NonNullable<IVisibleDamage["chakramFlights"]>[number];

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const projectedCell = (cell: XY): XY =>
    projectBattlefieldPoint(GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep()), gs);
const mirrorOwner = {};
afterEach(() => releaseBoardMirror(mirrorOwner));

const unit = (id: string, anchor: XY, width = 1, height = 1, team: TeamType = TeamVals.RIGHT, chakram = true) => {
    const position = GridMath.getPositionForFootprintAnchor(gs, anchor, width, height);
    const center = projectBattlefieldPoint(position, gs);
    // Incoming projectiles hit the torso above the footprint's ground point.
    const impact = { x: center.x + 3, y: center.y + 19 };
    const flag = { x: center.x - 5, y: center.y + 27 };
    return {
        getId: () => id,
        getName: () => id,
        getTeam: () => team,
        getAbility: () => undefined,
        getAnimationTextureKey: () => undefined,
        getBaseCell: () => anchor,
        getCells: () => GridMath.getFootprintCellsForAnchor(anchor, width, height),
        getPosition: () => position,
        getVisualCenter: () => center,
        getProjectileImpactPoint: () => impact,
        getDamagePredictionAnchor: () => flag,
        getRangedProjectileOrigin: () => impact,
        isSmallSize: () => width === 1 && height === 1,
        isDead: () => false,
        hasAbilityActive: (ability: string) => ability === "Chakram" && chakram,
        applyRecoil: () => undefined,
    };
};
type UnitStub = ReturnType<typeof unit>;

const sceneFor = (units: readonly UnitStub[]) => {
    const byId = new Map(units.map((entry) => [entry.getId(), entry]));
    const paths: XY[][] = [];
    const damagePops: { center: XY; amount: number; unitsDied: number; flag?: XY }[] = [];
    const wounds: XY[] = [];
    const slashes: XY[] = [];
    const missPops: XY[] = [];
    const scene = {
        sc_sceneSettings: { getGridSettings: () => gs },
        unitsHolder: { getAllUnits: () => byId },
        rangedProjectiles: {
            fireAlongPath: (points: XY[]): Promise<void> => {
                paths.push(points.map((point) => ({ ...point })));
                return Promise.resolve();
            },
        },
        combatVisuals: {
            showFloatingDamage: (
                center: XY,
                amount: number,
                _direction: XY,
                unitsDied: number,
                _style: unknown,
                _text: unknown,
                flag?: XY,
            ) => damagePops.push({ center, amount, unitsDied, flag }),
            spawnBloodSpray: (center: XY) => wounds.push(center),
            spawnSlash: (center: XY) => slashes.push(center),
            showMissLabel: (position: XY) => missPops.push(position),
        },
        delayForScene: () => Promise.resolve(),
        chakramWorldDir: (Sandbox.prototype as unknown as { chakramWorldDir: (from: XY, to: XY) => XY })
            .chakramWorldDir,
    };
    return { scene, byId, paths, damagePops, wounds, slashes, missPops };
};

const splash = (victim: UnitStub, amount = 10, unitsDied = 0): Splash => ({
    unitId: victim.getId(),
    position: { ...victim.getPosition() },
    amount,
    unitsDied,
});

const exchangeFor = (units: readonly UnitStub[]) => {
    const harness = sceneFor(units);
    const shots: string[] = [];
    const shotChakrams: (boolean | undefined)[] = [];
    Object.setPrototypeOf(harness.scene, Sandbox.prototype);
    Object.assign(harness.scene, {
        isSceneDestroyed: () => false,
        dyingVisualUnits: new Set(),
        prepareDirectionalAttackState: () => "attack",
        offsetReplayDamagePosition: (position: XY) => position,
        popRecordedDullingDefense: () => undefined,
        playReplayOneShot: () => Promise.resolve(),
        playReplayProjectile: async (
            source: UnitStub,
            _victim: unknown,
            _position: unknown,
            impact: () => void,
            chakram?: boolean,
        ) => {
            shots.push(source.getId());
            shotChakrams.push(chakram);
            impact();
        },
    });
    return { ...harness, shots, shotChakrams };
};
const strike = (source: UnitStub, victim: UnitStub, amount: number, response = false): CombatExchangeStrike => ({
    attackerId: source.getId(),
    targetId: victim.getId(),
    amount,
    unitsDied: 0,
    lethal: false,
    response,
    hitIndex: 0,
});
const exchange = (
    scene: object,
    attacker: UnitStub,
    target: UnitStub,
    plan: CombatExchangeStrike[],
    arcs: Arc[],
    hits: Splash[],
    options: {
        melee?: boolean;
        missed?: boolean;
        captured?: Map<string, UnitStub>;
        initialChakram?: boolean;
        damage?: Partial<IVisibleDamage>;
        onDeath?: (victim: UnitStub) => void;
        deathState?: { amountsBefore: ReadonlyMap<string, number>; deadIds: ReadonlySet<string> };
    } = {},
) =>
    (
        Sandbox.prototype as unknown as {
            playCombatExchange: (
                attacker: unknown,
                target: unknown,
                event: unknown,
                plan: readonly CombatExchangeStrike[],
                onDeath: (victim: UnitStub) => void,
                captured?: Map<string, UnitStub>,
                dullingEvents?: unknown,
                initialChakram?: boolean,
                deathState?: { amountsBefore: ReadonlyMap<string, number>; deadIds: ReadonlySet<string> },
            ) => Promise<unknown>;
        }
    ).playCombatExchange.call(
        scene,
        attacker,
        target,
        {
            attackType: options.melee ? "melee" : "range",
            damage: {
                amount: 0,
                render: true,
                ...options.damage,
                missed: options.missed ?? options.damage?.missed,
                splash: hits,
                chakramArcs: arcs,
            },
        },
        plan,
        options.onDeath ?? (() => undefined),
        options.captured,
        undefined,
        options.initialChakram,
        options.deathState,
    );
const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
};

const recordedFlight = (
    source: UnitStub,
    primary: UnitStub,
    hitIndex: 0 | 1,
    arcs: Arc[],
    hits: Splash[],
    response = false,
    missed = false,
): Flight => ({
    attackerId: source.getId(),
    primaryTargetId: primary.getId(),
    hitIndex,
    response,
    missed,
    arcs,
    splash: hits,
});

const recordedExchange = (
    harness: ReturnType<typeof exchangeFor>,
    attacker: UnitStub,
    target: UnitStub,
    flights: Flight[],
    flatSplash = flights.flatMap((flight) => flight.splash),
    deadIds = new Set<string>(),
    options: { amountsBefore?: Map<string, number>; onDeath?: (victim: UnitStub) => void } = {},
) => {
    const amountsBefore = options.amountsBefore ?? new Map([...harness.byId.keys()].map((id) => [id, 1]));
    const damage = {
        amount: 0,
        render: true,
        unitPosition: target.getPosition(),
        unitIsSmall: target.isSmallSize(),
        unitId: target.getId(),
        chakramFlights: flights,
        chakramArcs: flights.flatMap((flight) => flight.arcs),
        splash: flatSplash,
    };
    const event = {
        attackType: "range",
        attackerId: attacker.getId(),
        targetId: target.getId(),
        animations: flights.map((flight) => ({
            fromPosition: harness.byId.get(flight.attackerId)!.getPosition(),
            toPosition: harness.byId.get(flight.primaryTargetId)!.getPosition(),
            affectedUnitId: flight.primaryTargetId,
        })),
        damage,
    };
    const plan = (
        Sandbox.prototype as unknown as { buildCombatExchange: (...args: unknown[]) => CombatExchangeStrike[] }
    ).buildCombatExchange.call(harness.scene, attacker, target, event, amountsBefore, deadIds);
    return {
        plan,
        playing: exchange(harness.scene, attacker, target, plan, damage.chakramArcs, flatSplash, {
            damage,
            onDeath: options.onDeath,
            deathState: { amountsBefore, deadIds },
        }),
    };
};

describe("Each recorded Chakram throw owns its damage and path", () => {
    test("a killed first-bounce victim dies at arrival before the next disc crosses its cleared cell", async () => {
        const zena = unit("Zena", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT);
        const primary = unit("Primary", { x: 6, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const killed = unit("Killed", { x: 8, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const next = unit("Next", { x: 9, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const harness = exchangeFor([zena, primary, killed, next]);
        const deaths: { id: string; shots: number; paths: number }[] = [];
        let landFirst!: () => void;
        const arriving = new Promise<void>((resolve) => {
            landFirst = resolve;
        });
        harness.scene.rangedProjectiles.fireAlongPath = (points) => {
            harness.paths.push(points.map((point) => ({ ...point })));
            return harness.paths.length === 1 ? arriving : Promise.resolve();
        };
        const { playing } = recordedExchange(
            harness,
            zena,
            primary,
            [
                recordedFlight(
                    zena,
                    primary,
                    0,
                    [arc(killed, [primary.getBaseCell(), { x: 7, y: 10 }, killed.getBaseCell()])],
                    [splash(primary, 10), splash(killed, 9, 1)],
                ),
                recordedFlight(
                    zena,
                    primary,
                    1,
                    [arc(next, [primary.getBaseCell(), { x: 7, y: 10 }, killed.getBaseCell(), next.getBaseCell()])],
                    [splash(primary, 5), splash(next, 3)],
                ),
            ],
            undefined,
            new Set([killed.getId()]),
            {
                onDeath: (victim) => {
                    deaths.push({ id: victim.getId(), shots: harness.shots.length, paths: harness.paths.length });
                    harness.byId.delete(victim.getId());
                },
            },
        );
        await flush();
        expect(harness.paths).toHaveLength(1);
        expect(deaths).toEqual([]);

        landFirst();
        await playing;

        expect(deaths).toEqual([{ id: killed.getId(), shots: 1, paths: 1 }]);
        expect(harness.byId.has(killed.getId())).toBe(false);
        expect(harness.paths[2]).toContainEqual(projectedCell(killed.getBaseCell()));
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([10, 9, 5, 3]);
    });

    test("a final-dead stack's partial first-bounce loss waits until the second bounce exhausts it", async () => {
        const zena = unit("Zena", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT);
        const primary = unit("Primary", { x: 6, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const bounce = { ...unit("Bounce", { x: 8, y: 10 }, 1, 2, TeamVals.RIGHT, false), isDead: () => true };
        const harness = exchangeFor([zena, primary, bounce]);
        const deaths: { id: string; shots: number; paths: number }[] = [];
        const bridge = arc(bounce, [primary.getBaseCell(), { x: 7, y: 10 }, bounce.getBaseCell()]);
        const { playing } = recordedExchange(
            harness,
            zena,
            primary,
            [
                recordedFlight(zena, primary, 0, [bridge], [splash(primary, 10), splash(bounce, 9, 1)]),
                recordedFlight(zena, primary, 1, [bridge], [splash(primary, 5), splash(bounce, 6, 2)]),
            ],
            undefined,
            new Set([bounce.getId()]),
            {
                amountsBefore: new Map([
                    [zena.getId(), 1],
                    [primary.getId(), 1],
                    [bounce.getId(), 3],
                ]),
                onDeath: (victim) =>
                    deaths.push({ id: victim.getId(), shots: harness.shots.length, paths: harness.paths.length }),
            },
        );
        await playing;

        expect(deaths).toEqual([{ id: bounce.getId(), shots: 2, paths: 3 }]);
        expect(harness.damagePops.map((pop) => pop.unitsDied)).toEqual([0, 1, 0, 2]);
    });

    test("a first-bounce partial loss and later primary kill share the stack's remaining count", async () => {
        const zena = unit("Zena", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT);
        const primary = unit("Primary", { x: 6, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const nextPrimary = unit("Next primary", { x: 8, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const harness = exchangeFor([zena, primary, nextPrimary]);
        const deaths: { id: string; shots: number }[] = [];
        const { playing } = recordedExchange(
            harness,
            zena,
            primary,
            [
                recordedFlight(
                    zena,
                    primary,
                    0,
                    [arc(nextPrimary, [primary.getBaseCell(), { x: 7, y: 10 }, nextPrimary.getBaseCell()])],
                    [splash(primary, 10, 1), splash(nextPrimary, 8, 1)],
                ),
                recordedFlight(zena, nextPrimary, 1, [], [splash(nextPrimary, 5, 2)]),
            ],
            undefined,
            new Set([primary.getId(), nextPrimary.getId()]),
            {
                amountsBefore: new Map([
                    [zena.getId(), 1],
                    [primary.getId(), 1],
                    [nextPrimary.getId(), 3],
                ]),
                onDeath: (victim) => deaths.push({ id: victim.getId(), shots: harness.shots.length }),
            },
        );
        await playing;

        expect(deaths).toEqual([
            { id: primary.getId(), shots: 1 },
            { id: nextPrimary.getId(), shots: 2 },
        ]);
        expect(harness.damagePops.map((pop) => pop.unitsDied)).toEqual([1, 1, 2]);
    });

    test.each([true, false])(
        "modern counter metadata preserves a zero-damage response with missed=%s",
        async (missed) => {
            const shooter = unit("Shooter", { x: 6, y: 5 }, 1, 2, TeamVals.LEFT, false);
            const zena = unit("Broken Zena", { x: 6, y: 10 }, 1, 1, TeamVals.RIGHT, false);
            const harness = exchangeFor([shooter, zena]);
            Object.assign(harness.scene, {
                getReplayUnitDamage: () => {
                    throw new Error("Metadata owns the response damage");
                },
            });
            const counter = recordedFlight(
                zena,
                shooter,
                0,
                [],
                missed ? [{ ...splash(shooter, 0), missed: true }] : [],
                true,
                missed,
            );
            const hits = [splash(zena, 10), splash(shooter, 99)];
            const damage = {
                amount: 10,
                render: true,
                unitId: zena.getId(),
                unitPosition: zena.getPosition(),
                unitIsSmall: true,
                chakramFlights: [counter],
                splash: hits,
            };
            const event = {
                attackType: "range",
                attackerId: shooter.getId(),
                targetId: zena.getId(),
                damage,
                animations: [
                    {
                        fromPosition: shooter.getPosition(),
                        toPosition: zena.getPosition(),
                        affectedUnitId: zena.getId(),
                    },
                ],
            };
            const prototype = Sandbox.prototype as unknown as {
                getReplayRetaliationDamage: (...args: unknown[]) => { amount: number; unitsDied: number } | undefined;
                buildCombatExchange: (...args: unknown[]) => CombatExchangeStrike[];
            };
            expect(
                prototype.getReplayRetaliationDamage.call(harness.scene, shooter, zena, event, { events: [] }),
            ).toEqual({ amount: 0, unitsDied: 0 });
            const plan = prototype.buildCombatExchange.call(
                harness.scene,
                shooter,
                zena,
                event,
                new Map([
                    [shooter.getId(), 1],
                    [zena.getId(), 1],
                ]),
                new Set(),
            );
            expect(plan.map((strike) => [strike.attackerId, strike.response, strike.amount])).toEqual([
                [shooter.getId(), false, 10],
                [zena.getId(), true, 0],
            ]);

            await exchange(harness.scene, shooter, zena, plan, [], hits, { damage });

            expect(harness.shotChakrams).toEqual([false, true]);
            expect(harness.damagePops.map((pop) => pop.amount)).toEqual([10]);
            expect(harness.missPops).toHaveLength(Number(missed));
            expect(harness.wounds).toEqual([]);
            expect(harness.paths).toEqual([[shooter.getProjectileImpactPoint(), zena.getRangedProjectileOrigin()]]);
        },
    );

    test("a shielded primary returns its disc without a wound or slash", async () => {
        const zena = unit("Zena", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT, false);
        const primary = unit("Shield", { x: 6, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const harness = exchangeFor([zena, primary]);
        const { playing } = recordedExchange(harness, zena, primary, [recordedFlight(zena, primary, 0, [], [])]);
        await playing;

        expect(harness.paths).toEqual([[primary.getProjectileImpactPoint(), zena.getRangedProjectileOrigin()]]);
        expect(harness.damagePops).toEqual([]);
        expect(harness.wounds).toEqual([]);
        expect(harness.slashes).toEqual([]);
    });

    test("an absorbed primary and bounce keep their flight without blood, slash or recoil", async () => {
        const zena = unit("Zena", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT, false);
        const primary = unit("Primary", { x: 6, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        let recoilCount = 0;
        const bounce = {
            ...unit("Bounce", { x: 8, y: 10 }, 1, 2, TeamVals.RIGHT, false),
            applyRecoil: () => {
                recoilCount++;
                return undefined;
            },
        };
        const harness = exchangeFor([zena, primary, bounce]);
        const { playing } = recordedExchange(harness, zena, primary, [
            recordedFlight(
                zena,
                primary,
                0,
                [arc(bounce, [primary.getBaseCell(), { x: 7, y: 10 }, bounce.getBaseCell()])],
                [splash(primary, 0), splash(bounce, 0)],
            ),
        ]);
        await playing;

        expect(harness.paths).toHaveLength(2);
        expect(harness.damagePops).toEqual([]);
        expect(harness.wounds).toEqual([]);
        expect(harness.slashes).toEqual([]);
        expect(recoilCount).toBe(0);
    });

    test("the recorded primary owns the bounce origin even when AOE splash lists another victim first", async () => {
        const zena = unit("Zena", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT, false);
        const primary = unit("Primary", { x: 6, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const adjacent = unit("AOE adjacent", { x: 5, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const bounce = unit("Bounce", { x: 8, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const harness = exchangeFor([zena, primary, adjacent, bounce]);
        const { plan, playing } = recordedExchange(harness, zena, primary, [
            recordedFlight(
                zena,
                primary,
                0,
                [arc(bounce, [primary.getBaseCell(), { x: 7, y: 10 }, bounce.getBaseCell()])],
                [splash(adjacent, 6), splash(primary, 10), splash(bounce, 8)],
            ),
        ]);
        await playing;

        expect(plan[0].amount).toBe(10);
        expect(harness.paths[0][0]).toEqual(primary.getProjectileImpactPoint());
        expect(harness.wounds).toEqual([primary.getVisualCenter(), bounce.getVisualCenter()]);
    });

    test("a crafted second throw uses its own primary and bounce amounts even with repeated victims", async () => {
        const zena = unit("Zena", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT, false);
        const primary = unit("Primary", { x: 6, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const bounce = unit("Bounce", { x: 8, y: 10 }, 2, 1, TeamVals.RIGHT, false);
        const harness = exchangeFor([zena, primary, bounce]);
        const bridge = arc(bounce, [primary.getBaseCell(), { x: 7, y: 10 }, bounce.getBaseCell()]);
        const { plan, playing } = recordedExchange(
            harness,
            zena,
            primary,
            [
                recordedFlight(zena, primary, 0, [bridge], [splash(primary, 10), splash(bounce, 8)]),
                recordedFlight(zena, primary, 1, [bridge], [splash(primary, 5), splash(bounce, 4)]),
            ],
            [splash(primary, 99), splash(bounce, 99)],
        );
        await playing;

        expect(plan.map((strike) => strike.amount)).toEqual([10, 5]);
        expect(harness.shotChakrams).toEqual([true, true]);
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([10, 8, 5, 4]);
        expect(harness.paths).toHaveLength(4);
    });

    test("a missed first throw does not erase the second throw's newly reached bounce", async () => {
        const zena = unit("Zena", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT, false);
        const primary = unit("Primary", { x: 6, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const bounce = unit("Bounce", { x: 8, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const harness = exchangeFor([zena, primary, bounce]);
        const { plan, playing } = recordedExchange(harness, zena, primary, [
            recordedFlight(zena, primary, 0, [], [{ ...splash(primary, 0), missed: true }], false, true),
            recordedFlight(
                zena,
                primary,
                1,
                [arc(bounce, [primary.getBaseCell(), { x: 7, y: 10 }, bounce.getBaseCell()])],
                [splash(primary, 7), splash(bounce, 3)],
            ),
        ]);
        await playing;

        expect(plan.map((strike) => strike.missed)).toEqual([true, false]);
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([7, 3]);
        expect(harness.missPops).toHaveLength(1);
        expect(harness.paths).toHaveLength(3);
    });

    test("a first-bounce kill is never replayed as a second hit when the next throw follows a fresh route", async () => {
        const zena = unit("Zena", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT);
        const primary = unit("Primary", { x: 6, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const killed = unit("Killed", { x: 8, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const fresh = unit("Fresh", { x: 6, y: 12 }, 2, 1, TeamVals.RIGHT, false);
        const harness = exchangeFor([zena, primary, killed, fresh]);
        const { playing } = recordedExchange(harness, zena, primary, [
            recordedFlight(
                zena,
                primary,
                0,
                [arc(killed, [primary.getBaseCell(), { x: 7, y: 10 }, killed.getBaseCell()])],
                [splash(primary, 10), splash(killed, 9, 1)],
            ),
            recordedFlight(
                zena,
                primary,
                1,
                [arc(fresh, [primary.getBaseCell(), { x: 6, y: 11 }, fresh.getBaseCell()])],
                [splash(primary, 5), splash(fresh, 3)],
            ),
        ]);
        await playing;

        expect(harness.damagePops.map((pop) => [pop.amount, pop.unitsDied])).toEqual([
            [10, 0],
            [9, 1],
            [5, 0],
            [3, 0],
        ]);
        expect(harness.paths[2].at(-1)).toEqual(fresh.getProjectileImpactPoint());
        expect(harness.paths[2]).not.toContainEqual(killed.getProjectileImpactPoint());
    });

    test("the second throw's primary amount is independent of an earlier bounce on that same stack", async () => {
        const zena = unit("Zena", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT, false);
        const primary = unit("Primary", { x: 6, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const nextPrimary = unit("Next primary", { x: 8, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const harness = exchangeFor([zena, primary, nextPrimary]);
        const { plan, playing } = recordedExchange(
            harness,
            zena,
            primary,
            [
                recordedFlight(
                    zena,
                    primary,
                    0,
                    [arc(nextPrimary, [primary.getBaseCell(), { x: 7, y: 10 }, nextPrimary.getBaseCell()])],
                    [splash(primary, 10, 1), splash(nextPrimary, 8)],
                ),
                recordedFlight(zena, nextPrimary, 1, [], [splash(nextPrimary, 3)]),
            ],
            undefined,
            new Set([primary.getId()]),
        );
        await playing;

        expect(plan.map((strike) => [strike.targetId, strike.amount])).toEqual([
            [primary.getId(), 10],
            [nextPrimary.getId(), 3],
        ]);
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([10, 8, 3]);
        expect(harness.paths.at(-1)?.[0]).toEqual(nextPrimary.getProjectileImpactPoint());
    });

    test.each(["shield", "miss"])(
        "a fresh second-throw %s stop does not replay the first throw's extra victim",
        async (stop) => {
            const zena = unit("Zena", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT, false);
            const primary = unit("Primary", { x: 6, y: 10 }, 1, 2, TeamVals.RIGHT, false);
            const bounce = unit("Bounce", { x: 8, y: 10 }, 1, 2, TeamVals.RIGHT, false);
            const stopUnit = unit("Stop", { x: 6, y: 12 }, 1, 1, TeamVals.RIGHT, false);
            const harness = exchangeFor([zena, primary, bounce, stopUnit]);
            const terminalArc: Arc =
                stop === "shield"
                    ? {
                          targetUnitId: "",
                          hitUnitIds: [],
                          cells: [primary.getBaseCell(), { x: 6, y: 11 }, stopUnit.getBaseCell()],
                      }
                    : arc(stopUnit, [primary.getBaseCell(), { x: 6, y: 11 }, stopUnit.getBaseCell()]);
            const { playing } = recordedExchange(harness, zena, primary, [
                recordedFlight(
                    zena,
                    primary,
                    0,
                    [arc(bounce, [primary.getBaseCell(), { x: 7, y: 10 }, bounce.getBaseCell()])],
                    [splash(primary, 10), splash(bounce, 8)],
                ),
                recordedFlight(
                    zena,
                    primary,
                    1,
                    [terminalArc],
                    [splash(primary, 5), ...(stop === "miss" ? [{ ...splash(stopUnit, 0), missed: true }] : [])],
                ),
            ]);
            await playing;

            expect(harness.damagePops.map((pop) => pop.amount)).toEqual([10, 8, 5]);
            expect(harness.missPops).toHaveLength(stop === "miss" ? 1 : 0);
            expect(harness.paths).toHaveLength(4);
            expect(harness.paths[2]).not.toContainEqual(bounce.getProjectileImpactPoint());
        },
    );

    test("both Zenas and a crafted second throw each replay one independent disc", async () => {
        const attacker = unit("Attacker", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT, false);
        const defender = unit("Defender", { x: 6, y: 10 }, 1, 1, TeamVals.RIGHT, false);
        const red = unit("Red", { x: 8, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const green = unit("Green", { x: 8, y: 5 }, 1, 2, TeamVals.LEFT, false);
        const harness = exchangeFor([attacker, defender, red, green]);
        const redArc = arc(red, [defender.getBaseCell(), { x: 7, y: 10 }, red.getBaseCell()]);
        const { plan, playing } = recordedExchange(harness, attacker, defender, [
            recordedFlight(attacker, defender, 0, [redArc], [splash(defender, 10), splash(red, 8)]),
            recordedFlight(
                defender,
                attacker,
                0,
                [arc(green, [attacker.getBaseCell(), { x: 7, y: 5 }, green.getBaseCell()])],
                [splash(attacker, 12), splash(green, 6)],
                true,
            ),
            recordedFlight(attacker, defender, 1, [redArc], [splash(defender, 5), splash(red, 3)]),
        ]);
        await playing;

        expect(plan.map((strike) => [strike.attackerId, strike.response, strike.hitIndex])).toEqual([
            [attacker.getId(), false, 0],
            [defender.getId(), true, 0],
            [attacker.getId(), false, 1],
        ]);
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([10, 8, 12, 6, 5, 3]);
        expect(harness.paths).toHaveLength(6);
        expect(harness.paths[3].at(-1)).toEqual(defender.getRangedProjectileOrigin());
    });

    test("a modern empty flight list prevents stale active-ability and flat-arc inference", async () => {
        const zena = unit("Zena", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT);
        const target = unit("Target", { x: 6, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const harness = exchangeFor([zena, target]);

        await exchange(harness.scene, zena, target, [strike(zena, target, 10)], [], [splash(target, 10)], {
            damage: { chakramFlights: [] },
            initialChakram: true,
        });

        expect(harness.shotChakrams).toEqual([false]);
        expect(harness.paths).toEqual([]);
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([10]);
    });
});

describe("Chakram belongs to the ranged strike that threw it", () => {
    test.each([
        { initiatingMissed: false, counterMissed: false },
        { initiatingMissed: false, counterMissed: true },
        { initiatingMissed: true, counterMissed: false },
        { initiatingMissed: true, counterMissed: true },
    ])(
        "a recorded no-bounce counter survives final Break: initialMISS=$initiatingMissed, counterMISS=$counterMissed",
        async ({ initiatingMissed, counterMissed }) => {
            const shooter = unit("Shooter", { x: 6, y: 5 }, 1, 2, TeamVals.LEFT, false);
            const zena = unit("Broken Zena", { x: 6, y: 10 }, 1, 1, TeamVals.RIGHT, false);
            const harness = exchangeFor([shooter, zena]);
            const initiatingAmount = initiatingMissed ? 0 : 10;
            const counterAmount = counterMissed ? 0 : 12;
            Object.assign(harness.scene, { getReplayUnitDamage: () => ({ amount: counterAmount, unitsDied: 0 }) });
            const hits = [
                { ...splash(zena, initiatingAmount), missed: initiatingMissed || undefined },
                { ...splash(shooter, counterAmount), missed: counterMissed || undefined },
            ];
            const damage = {
                amount: initiatingAmount,
                render: true,
                unitId: zena.getId(),
                unitPosition: zena.getPosition(),
                unitIsSmall: true,
                missed: initiatingMissed || undefined,
                hits: initiatingMissed ? undefined : [{ amount: initiatingAmount, unitsDied: 0 }],
                splash: hits,
            };
            const event = {
                attackType: "range",
                attackerId: shooter.getId(),
                targetId: zena.getId(),
                animations: [
                    {
                        fromPosition: shooter.getPosition(),
                        toPosition: zena.getPosition(),
                        affectedUnitId: zena.getId(),
                    },
                    {
                        fromPosition: zena.getPosition(),
                        toPosition: shooter.getPosition(),
                        affectedUnitId: shooter.getId(),
                    },
                ],
                damage,
            };
            const prototype = Sandbox.prototype as unknown as {
                getReplayRetaliationDamage: (...args: unknown[]) => { amount: number; unitsDied: number } | undefined;
                buildCombatExchange: (...args: unknown[]) => CombatExchangeStrike[];
            };
            const response = prototype.getReplayRetaliationDamage.call(harness.scene, shooter, zena, event, {
                events: [],
            });
            expect(response).toEqual({ amount: counterAmount, unitsDied: 0 });
            const plan = prototype.buildCombatExchange.call(
                harness.scene,
                shooter,
                zena,
                event,
                new Map([
                    [shooter.getId(), 1],
                    [zena.getId(), 1],
                ]),
                new Set(),
                response,
            );

            await exchange(harness.scene, shooter, zena, plan, [], hits, { damage });

            expect(harness.shotChakrams).toEqual([false, true]);
            expect(harness.paths).toEqual([[shooter.getProjectileImpactPoint(), zena.getRangedProjectileOrigin()]]);
            expect(harness.missPops).toHaveLength(Number(initiatingMissed) + Number(counterMissed));
            expect(harness.damagePops.map((pop) => pop.amount)).toEqual(
                [initiatingAmount, counterAmount].filter((amount) => amount > 0),
            );
        },
    );

    test("friendly AOE splash and incomplete single-shot evidence cannot invent a Chakram counter", () => {
        const damage = {
            amount: 10,
            render: true,
            unitId: "Initial target",
            unitPosition: { x: 0, y: 0 },
            unitIsSmall: true,
            splash: [{ unitId: "Shooter", position: { x: 0, y: 0 }, amount: 5, unitsDied: 0 }],
        };

        expect(hasRecordedChakramCounter(damage, "Shooter")).toBe(false);
        expect(
            hasRecordedChakramCounter(
                { ...damage, unitId: undefined, hits: [{ amount: 10, unitsDied: 0 }] },
                "Shooter",
            ),
        ).toBe(false);
        expect(hasRecordedChakramCounter({ ...damage, missed: true }, "Initial target")).toBe(false);
    });

    test("the real replay response gate retains a zero-damage Chakram MISS and the plan presents it once", async () => {
        const shooter = unit("Shooter", { x: 6, y: 5 }, 1, 2, TeamVals.LEFT, false);
        const zena = unit("Zena", { x: 6, y: 10 }, 1, 1, TeamVals.RIGHT);
        const harness = exchangeFor([shooter, zena]);
        Object.assign(harness.scene, { getReplayUnitDamage: () => ({ amount: 0, unitsDied: 0 }) });
        const hits = [splash(zena, 10), { ...splash(shooter, 0), missed: true }];
        const event = {
            attackType: "range",
            attackerId: shooter.getId(),
            targetId: zena.getId(),
            animations: [
                { fromPosition: shooter.getPosition(), toPosition: zena.getPosition(), affectedUnitId: zena.getId() },
                {
                    fromPosition: zena.getPosition(),
                    toPosition: shooter.getPosition(),
                    affectedUnitId: shooter.getId(),
                },
            ],
            damage: { amount: 10, render: true, unitPosition: zena.getPosition(), unitIsSmall: true, splash: hits },
        };
        const prototype = Sandbox.prototype as unknown as {
            getReplayRetaliationDamage: (...args: unknown[]) => { amount: number; unitsDied: number } | undefined;
            buildCombatExchange: (...args: unknown[]) => CombatExchangeStrike[];
        };
        const response = prototype.getReplayRetaliationDamage.call(harness.scene, shooter, zena, event, { events: [] });
        expect(response).toEqual({ amount: 0, unitsDied: 0 });
        const plan = prototype.buildCombatExchange.call(
            harness.scene,
            shooter,
            zena,
            event,
            new Map([
                [shooter.getId(), 1],
                [zena.getId(), 1],
            ]),
            new Set(),
            response,
        );
        expect(plan.map((entry) => [entry.response, entry.amount, entry.missed])).toEqual([
            [false, 10, undefined],
            [true, 0, true],
        ]);

        await exchange(harness.scene, shooter, zena, plan, [], hits);

        expect(harness.shots).toEqual(["Shooter", "Zena"]);
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([10]);
        expect(harness.missPops).toEqual([
            { x: shooter.getVisualCenter().x, y: shooter.getVisualCenter().y - gs.getCellSize() * 1.25 },
        ]);
    });

    test("the real replay response gate still retains a positive counter from an older payload without splash", () => {
        const shooter = unit("Shooter", { x: 6, y: 5 }, 1, 2, TeamVals.LEFT, false);
        const zena = unit("Zena", { x: 6, y: 10 }, 1, 1, TeamVals.RIGHT);
        const harness = exchangeFor([shooter, zena]);
        Object.assign(harness.scene, { getReplayUnitDamage: () => ({ amount: 12, unitsDied: 0 }) });
        const prototype = Sandbox.prototype as unknown as {
            getReplayRetaliationDamage: (...args: unknown[]) => { amount: number; unitsDied: number } | undefined;
        };

        const response = prototype.getReplayRetaliationDamage.call(
            harness.scene,
            shooter,
            zena,
            {
                attackType: "range",
                animations: [
                    { fromPosition: shooter.getPosition(), affectedUnitId: zena.getId() },
                    { fromPosition: zena.getPosition(), affectedUnitId: shooter.getId() },
                ],
                damage: {},
            },
            { events: [] },
        );

        expect(response).toEqual({ amount: 12, unitsDied: 0 });
    });

    test("a per-occurrence initiating MISS is kept when a counter adds splash entries", async () => {
        const shooter = unit("Shooter", { x: 6, y: 5 }, 1, 2, TeamVals.LEFT, false);
        const zena = unit("Zena", { x: 6, y: 10 }, 1, 1, TeamVals.RIGHT);
        const harness = exchangeFor([shooter, zena]);
        const hits = [{ ...splash(zena, 0), missed: true }, splash(shooter, 10)];
        const prototype = Sandbox.prototype as unknown as {
            buildCombatExchange: (...args: unknown[]) => CombatExchangeStrike[];
        };
        const plan = prototype.buildCombatExchange.call(
            harness.scene,
            shooter,
            zena,
            {
                attackType: "range",
                attackerId: shooter.getId(),
                animations: [
                    {
                        fromPosition: shooter.getPosition(),
                        toPosition: zena.getPosition(),
                        affectedUnitId: zena.getId(),
                    },
                    {
                        fromPosition: zena.getPosition(),
                        toPosition: shooter.getPosition(),
                        affectedUnitId: shooter.getId(),
                    },
                ],
                damage: { amount: 0, missed: true, splash: hits },
            },
            new Map([
                [shooter.getId(), 1],
                [zena.getId(), 1],
            ]),
            new Set(),
            { amount: 10, unitsDied: 0 },
        );

        await exchange(harness.scene, shooter, zena, plan, [], hits, { missed: true });

        expect(harness.missPops).toHaveLength(1);
        expect(harness.missPops[0].x).toBe(zena.getVisualCenter().x);
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([10]);
    });

    test("recorded hops keep their disc when a later counter applied Break", async () => {
        const zena = unit("Zena", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT, false);
        const target = unit("Target", { x: 6, y: 10 }, 1, 1, TeamVals.RIGHT, false);
        const bounce = unit("Bounce", { x: 8, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const harness = exchangeFor([zena, target, bounce]);

        await exchange(
            harness.scene,
            zena,
            target,
            [strike(zena, target, 10)],
            [arc(bounce, [target.getBaseCell(), { x: 7, y: 10 }, bounce.getBaseCell()])],
            [splash(target, 10), splash(bounce, 8)],
        );

        expect(harness.shotChakrams).toEqual([true]);
        expect(harness.paths).toHaveLength(2);
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([10, 8]);
    });

    test("the captured first-shot ability keeps a no-bounce disc after counter Break", async () => {
        const zena = unit("Zena", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT, false);
        const target = unit("Target", { x: 6, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const harness = exchangeFor([zena, target]);

        await exchange(harness.scene, zena, target, [strike(zena, target, 10)], [], [splash(target, 10)], {
            initialChakram: true,
        });

        expect(harness.shotChakrams).toEqual([true]);
        expect(harness.paths).toEqual([[target.getProjectileImpactPoint(), zena.getRangedProjectileOrigin()]]);
    });

    test("plays a defender Zena's counter flight after an ordinary shot", async () => {
        const shooter = unit("Shooter", { x: 6, y: 5 }, 1, 2, TeamVals.LEFT, false);
        const zena = unit("Zena", { x: 6, y: 10 }, 1, 1, TeamVals.RIGHT);
        const bounce = unit("Shooter ally", { x: 8, y: 5 }, 1, 2, TeamVals.LEFT, false);
        const harness = exchangeFor([shooter, zena, bounce]);

        await exchange(
            harness.scene,
            shooter,
            zena,
            [strike(shooter, zena, 20), strike(zena, shooter, 10, true)],
            [arc(bounce, [shooter.getBaseCell(), { x: 7, y: 5 }, bounce.getBaseCell()])],
            [splash(zena, 20), splash(shooter, 10), splash(bounce, 7)],
        );

        expect(harness.shots).toEqual(["Shooter", "Zena"]);
        expect(harness.paths).toEqual([
            [shooter.getProjectileImpactPoint(), projectedCell({ x: 7, y: 5 }), bounce.getProjectileImpactPoint()],
            [bounce.getProjectileImpactPoint(), zena.getRangedProjectileOrigin()],
        ]);
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([20, 10, 7]);
    });

    test("two Zenas replay their own arcs and damage once each", async () => {
        const attacker = unit("Attacker", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT);
        const defender = unit("Defender", { x: 6, y: 10 }, 1, 1, TeamVals.RIGHT);
        const redBounce = unit("Red bounce", { x: 8, y: 10 }, 1, 2, TeamVals.RIGHT, false);
        const greenBounce = unit("Green bounce", { x: 8, y: 5 }, 2, 1, TeamVals.LEFT, false);
        const harness = exchangeFor([attacker, defender, redBounce, greenBounce]);

        await exchange(
            harness.scene,
            attacker,
            defender,
            [strike(attacker, defender, 10), strike(defender, attacker, 12, true)],
            [
                arc(redBounce, [defender.getBaseCell(), { x: 7, y: 10 }, redBounce.getBaseCell()]),
                arc(greenBounce, [attacker.getBaseCell(), { x: 7, y: 5 }, greenBounce.getBaseCell()]),
            ],
            [splash(defender, 10), splash(redBounce, 8), splash(attacker, 12), splash(greenBounce, 9)],
        );

        expect(harness.paths).toEqual([
            [defender.getProjectileImpactPoint(), projectedCell({ x: 7, y: 10 }), redBounce.getProjectileImpactPoint()],
            [redBounce.getProjectileImpactPoint(), attacker.getRangedProjectileOrigin()],
            [
                attacker.getProjectileImpactPoint(),
                projectedCell({ x: 7, y: 5 }),
                greenBounce.getProjectileImpactPoint(),
            ],
            [greenBounce.getProjectileImpactPoint(), defender.getRangedProjectileOrigin()],
        ]);
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([10, 8, 12, 9]);
    });

    test("the counter waits until the initiating disc has returned", async () => {
        const attacker = unit("Attacker", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT);
        const defender = unit("Defender", { x: 6, y: 10 }, 1, 1, TeamVals.RIGHT, false);
        const harness = exchangeFor([attacker, defender]);
        let caught!: () => void;
        harness.scene.rangedProjectiles.fireAlongPath = (points) => {
            harness.paths.push(points.map((point) => ({ ...point })));
            return new Promise<void>((resolve) => (caught = resolve));
        };
        const pending = exchange(
            harness.scene,
            attacker,
            defender,
            [strike(attacker, defender, 10), strike(defender, attacker, 12, true)],
            [],
            [splash(defender, 10)],
        );

        await flush();
        expect(harness.shots).toEqual(["Attacker"]);
        caught();
        await pending;
        expect(harness.shots).toEqual(["Attacker", "Defender"]);
    });

    test("an adjacent melee poke plays no thrown disc or return disc", async () => {
        const attacker = unit("Attacker", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT);
        const defender = unit("Defender", { x: 6, y: 6 }, 1, 2, TeamVals.RIGHT);
        const harness = exchangeFor([attacker, defender]);

        await exchange(harness.scene, attacker, defender, [strike(attacker, defender, 10)], [], [], { melee: true });

        expect(harness.paths).toEqual([]);
        expect(harness.shots).toEqual([]);
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([10]);
    });

    test("an initiating miss does not mark a landed counter-throw as missed", async () => {
        const shooter = unit("Shooter", { x: 6, y: 5 }, 1, 2, TeamVals.LEFT, false);
        const zena = unit("Zena", { x: 6, y: 10 }, 1, 1, TeamVals.RIGHT);
        const harness = exchangeFor([shooter, zena]);

        await exchange(
            harness.scene,
            shooter,
            zena,
            [strike(shooter, zena, 0), strike(zena, shooter, 10, true)],
            [],
            [{ ...splash(zena, 0), missed: true }, splash(shooter, 10)],
            { missed: true },
        );

        expect(harness.paths).toEqual([[shooter.getProjectileImpactPoint(), zena.getRangedProjectileOrigin()]]);
        expect(harness.wounds).toEqual([shooter.getVisualCenter()]);
    });

    test("a dodged counter uses its own miss verdict without wounding the shooter", async () => {
        const attacker = unit("Attacker", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT);
        const defender = unit("Defender", { x: 6, y: 10 }, 1, 1, TeamVals.RIGHT);
        const harness = exchangeFor([attacker, defender]);

        await exchange(
            harness.scene,
            attacker,
            defender,
            [strike(attacker, defender, 10), strike(defender, attacker, 0, true)],
            [],
            [splash(defender, 10), { ...splash(attacker, 0), missed: true }],
        );

        expect(harness.paths).toEqual([
            [defender.getProjectileImpactPoint(), attacker.getRangedProjectileOrigin()],
            [attacker.getProjectileImpactPoint(), defender.getRangedProjectileOrigin()],
        ]);
        expect(harness.wounds).toEqual([defender.getVisualCenter()]);
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([10]);
    });

    test("a removed shield still identifies its response hop in an older recording", async () => {
        const attacker = unit("Attacker", { x: 6, y: 5 }, 1, 1, TeamVals.LEFT);
        const defender = unit("Defender", { x: 6, y: 10 }, 1, 1, TeamVals.RIGHT);
        const shield = unit("Shield", { x: 8, y: 5 }, 1, 2, TeamVals.LEFT, false);
        const harness = exchangeFor([attacker, defender, shield]);
        const captured = new Map(harness.byId);
        harness.byId.delete(shield.getId());
        const bridge = { x: 7, y: 5 };

        await exchange(
            harness.scene,
            attacker,
            defender,
            [strike(attacker, defender, 10), strike(defender, attacker, 12, true)],
            [{ targetUnitId: "", hitUnitIds: [], cells: [bridge, shield.getBaseCell()] }],
            [splash(defender, 10), splash(attacker, 12)],
            { captured },
        );

        expect(harness.paths).toEqual([
            [defender.getProjectileImpactPoint(), attacker.getRangedProjectileOrigin()],
            [attacker.getProjectileImpactPoint(), projectedCell(bridge), projectedCell(shield.getBaseCell())],
            [projectedCell(shield.getBaseCell()), defender.getRangedProjectileOrigin()],
        ]);
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([10, 12]);
    });

    test("a removed counter-bounce victim retains its captured impact and damage anchor", async () => {
        const shooter = unit("Shooter", { x: 6, y: 5 }, 1, 2, TeamVals.LEFT, false);
        const zena = unit("Zena", { x: 6, y: 10 }, 1, 1, TeamVals.RIGHT);
        const bounce = unit("Shooter ally", { x: 8, y: 5 }, 1, 2, TeamVals.LEFT, false);
        const harness = exchangeFor([shooter, zena, bounce]);
        const captured = new Map(harness.byId);
        harness.byId.delete(bounce.getId());

        await exchange(
            harness.scene,
            shooter,
            zena,
            [strike(shooter, zena, 20), strike(zena, shooter, 10, true)],
            [arc(bounce, [shooter.getBaseCell(), { x: 7, y: 5 }, bounce.getBaseCell()])],
            [splash(zena, 20), splash(shooter, 10), splash(bounce, 7, 1)],
            { captured },
        );

        expect(harness.paths[0].at(-1)).toEqual(bounce.getProjectileImpactPoint());
        expect(harness.damagePops.at(-1)).toEqual({
            center: bounce.getVisualCenter(),
            amount: 7,
            unitsDied: 1,
            flag: bounce.getDamagePredictionAnchor(),
        });
    });
});
const arc = (victim: UnitStub, cells: XY[]): Arc => ({
    targetUnitId: victim.getId(),
    hitUnitIds: [victim.getId()],
    cells,
});
const play = (scene: object, attacker: UnitStub, primary: UnitStub, arcs: Arc[], hits: Splash[]) =>
    (
        Sandbox.prototype as unknown as {
            playChakramArcs: (attacker: unknown, damage: Partial<IVisibleDamage>, primary: unknown) => Promise<void>;
        }
    ).playChakramArcs.call(scene, attacker, { chakramArcs: arcs, splash: hits }, primary);

const shapes = [
    [1, 1],
    [1, 2],
    [2, 1],
    [2, 2],
] as const;
const directions = [
    [0, 1],
    [1, 1],
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, -1],
    [-1, 0],
    [-1, 1],
] as const;
const cases = shapes.flatMap(([width, height]) =>
    directions.flatMap(([dx, dy]) => [false, true].map((mirrored) => ({ width, height, dx, dy, mirrored }))),
);

describe("Chakram follows the authoritative footprint bridge", () => {
    test.each(cases)("$width x $height, direction $dx/$dy, mirrored=$mirrored", async (geometry) => {
        setBoardMirror(mirrorOwner, geometry.mirrored);
        const zena = unit("Zena", { x: 3, y: 2 });
        const primary = unit("Primary", { x: 8, y: 8 }, geometry.width, geometry.height);
        const bounce = unit(
            "Bounce",
            { x: 8 + geometry.dx * 4, y: 8 + geometry.dy * 4 },
            geometry.height,
            geometry.width,
        );
        // Start at the closest body cell, which can be different from the rectangular unit's anchor.
        const pairs = primary.getCells().flatMap((from) => bounce.getCells().map((to) => ({ from, to })));
        pairs.sort(
            (a, b) =>
                Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y) - Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y),
        );
        const { from, to } = pairs[0];
        const bridge = { x: Math.round((from.x + to.x) / 2), y: Math.round((from.y + to.y) / 2) };
        const harness = sceneFor([zena, primary, bounce]);

        await play(harness.scene, zena, primary, [arc(bounce, [from, bridge, to])], [splash(primary), splash(bounce)]);

        expect(harness.paths).toEqual([
            [primary.getProjectileImpactPoint(), projectedCell(bridge), bounce.getProjectileImpactPoint()],
            [bounce.getProjectileImpactPoint(), zena.getRangedProjectileOrigin()],
        ]);
        expect(harness.damagePops).toEqual([
            {
                center: bounce.getVisualCenter(),
                amount: 10,
                unitsDied: 0,
                flag: bounce.getDamagePredictionAnchor(),
            },
        ]);
    });

    test("retains an empty-cell detour instead of drawing through the blocker", async () => {
        const zena = unit("Zena", { x: 3, y: 2 });
        const primary = unit("Primary", { x: 8, y: 8 }, 1, 2);
        const bounce = unit("Bounce", { x: 10, y: 8 }, 1, 2);
        const harness = sceneFor([zena, primary, bounce]);
        const bridge = [
            { x: 9, y: 6 },
            { x: 10, y: 6 },
        ];

        await play(
            harness.scene,
            zena,
            primary,
            [arc(bounce, [{ x: 8, y: 7 }, ...bridge, { x: 10, y: 7 }])],
            [splash(primary), splash(bounce)],
        );

        expect(harness.paths[0]).toEqual([
            primary.getProjectileImpactPoint(),
            ...bridge.map(projectedCell),
            bounce.getProjectileImpactPoint(),
        ]);
    });

    test("older recordings retain their first empty cell when the source cell was omitted", async () => {
        const zena = unit("Zena", { x: 3, y: 2 });
        const primary = unit("Primary", { x: 8, y: 8 });
        const bounce = unit("Bounce", { x: 10, y: 8 });
        const bridge = { x: 9, y: 8 };
        const harness = sceneFor([zena, primary, bounce]);

        await play(
            harness.scene,
            zena,
            primary,
            [arc(bounce, [bridge, bounce.getBaseCell()])],
            [splash(primary), splash(bounce)],
        );

        expect(harness.paths[0]).toEqual([
            primary.getProjectileImpactPoint(),
            projectedCell(bridge),
            bounce.getProjectileImpactPoint(),
        ]);
    });

    test.each(shapes)("returns from the actual primary impact when a %i x %i target has no bounce", async (w, h) => {
        const zena = unit("Zena", { x: 3, y: 2 });
        const primary = unit("Primary", { x: 8, y: 8 }, w, h);
        const harness = sceneFor([zena, primary]);

        await play(harness.scene, zena, primary, [], [splash(primary)]);

        expect(harness.paths).toEqual([[primary.getProjectileImpactPoint(), zena.getRangedProjectileOrigin()]]);
    });

    test("starts at the intercepted primary rather than the clicked stack behind it", async () => {
        const zena = unit("Zena", { x: 3, y: 2 });
        const clicked = unit("Clicked", { x: 8, y: 11 });
        const screen = unit("Screen", { x: 8, y: 8 }, 1, 2);
        const bounce = unit("Bounce", { x: 10, y: 8 });
        const harness = sceneFor([zena, clicked, screen, bounce]);

        await play(
            harness.scene,
            zena,
            clicked,
            [arc(bounce, [screen.getBaseCell(), { x: 9, y: 8 }, bounce.getBaseCell()])],
            [splash(screen), splash(bounce)],
        );

        expect(harness.paths[0][0]).toEqual(screen.getProjectileImpactPoint());
        expect(harness.wounds[0]).toEqual(screen.getVisualCenter());
    });

    test("a terminal shield hop flies to its cell without drawing a hit", async () => {
        const zena = unit("Zena", { x: 3, y: 2 });
        const primary = unit("Primary", { x: 8, y: 8 }, 1, 2);
        const shieldCell = { x: 10, y: 8 };
        const bridge = { x: 9, y: 8 };
        const harness = sceneFor([zena, primary]);

        await play(
            harness.scene,
            zena,
            primary,
            [{ targetUnitId: "", hitUnitIds: [], cells: [primary.getBaseCell(), bridge, shieldCell] }],
            [splash(primary)],
        );

        expect(harness.paths).toEqual([
            [primary.getProjectileImpactPoint(), projectedCell(bridge), projectedCell(shieldCell)],
            [projectedCell(shieldCell), zena.getRangedProjectileOrigin()],
        ]);
        expect(harness.damagePops).toEqual([]);
    });

    test("legacy target-only arcs exclude exactly the same victims from generic splash playback", () => {
        const bounceVictims = (
            Sandbox.prototype as unknown as { chakramBounceVictimIds: (damage: Partial<IVisibleDamage>) => Set<string> }
        ).chakramBounceVictimIds({
            chakramArcs: [
                { targetUnitId: "Bounce", cells: [] },
                { targetUnitId: "Shield", hitUnitIds: [], cells: [] },
            ],
        });

        expect([...bounceVictims]).toEqual(["Bounce"]);
    });
});

describe("Chakram bounce damage survives casualty cleanup", () => {
    test("lands damage at the authoritative position for a victim already removed by the engine", async () => {
        const zena = unit("Zena", { x: 3, y: 2 });
        const primary = unit("Primary", { x: 8, y: 8 }, 1, 2);
        const removed = unit("Removed", { x: 10, y: 8 }, 2, 1);
        const harness = sceneFor([zena, primary]);
        const center = projectBattlefieldPoint(removed.getPosition(), gs);

        await play(
            harness.scene,
            zena,
            primary,
            [arc(removed, [primary.getBaseCell(), { x: 9, y: 8 }, removed.getBaseCell()])],
            [splash(primary), splash(removed, 37, 2)],
        );

        expect(harness.paths[0].at(-1)).toEqual(center);
        expect(harness.damagePops).toEqual([{ center, amount: 37, unitsDied: 2, flag: undefined }]);
    });

    test("captures all future victims before ranked cleanup and lands each number after its hop", async () => {
        const zena = unit("Zena", { x: 3, y: 2 });
        const primary = unit("Primary", { x: 6, y: 8 }, 1, 2);
        const first = unit("First", { x: 8, y: 8 }, 1, 2);
        const last = unit("Last", { x: 10, y: 8 }, 1, 2);
        const harness = sceneFor([zena, primary, first, last]);
        const landings: (() => void)[] = [];
        harness.scene.rangedProjectiles.fireAlongPath = (points) => {
            harness.paths.push(points.map((point) => ({ ...point })));
            return harness.paths.length <= 2
                ? new Promise<void>((resolve) => landings.push(resolve))
                : Promise.resolve();
        };
        const playing = play(
            harness.scene,
            zena,
            primary,
            [
                arc(first, [primary.getBaseCell(), { x: 7, y: 8 }, first.getBaseCell()]),
                arc(last, [first.getBaseCell(), { x: 9, y: 8 }, last.getBaseCell()]),
            ],
            [splash(primary), splash(first, 20, 1), splash(last, 30, 3)],
        );
        expect(harness.damagePops).toHaveLength(0);
        harness.byId.delete(first.getId());
        harness.byId.delete(last.getId());
        landings[0]();
        await Promise.resolve();
        expect(harness.damagePops.map((pop) => pop.amount)).toEqual([20]);
        expect(harness.paths[1][0]).toEqual(first.getProjectileImpactPoint());
        expect(harness.paths[1].at(-1)).toEqual(last.getProjectileImpactPoint());
        landings[1]();
        await playing;
        expect(harness.damagePops).toEqual([
            { center: first.getVisualCenter(), amount: 20, unitsDied: 1, flag: first.getDamagePredictionAnchor() },
            { center: last.getVisualCenter(), amount: 30, unitsDied: 3, flag: last.getDamagePredictionAnchor() },
        ]);
    });
});
