import { describe, expect, mock, test } from "bun:test";
import { Container, Texture, TextureSource } from "pixi.js";
import {
    GridConstants,
    GridMath,
    GridSettings,
    TeamVals,
    type HoCMath,
    type IVisibleDamage,
    type TeamType,
} from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { RankedPlayScene } from "./RankedPlayScene";
import { CombatVisuals } from "./sandbox/CombatVisuals";
import { orderCombatExchange, type CombatExchangeStrike } from "./sandbox/combat_exchange";
import { prepareBrutalityTarget } from "./sandbox/ZenaBrutalityVfx";
import type { RenderableUnit } from "./RenderableUnit";

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
    for (let i = 0; i < 24; i++) await Promise.resolve();
};
const expectStraightApproach = (points: HoCMath.XY[]) => {
    const from = points[0];
    const to = points[points.length - 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    let previousProgress = -1;
    for (const point of points) {
        const x = point.x - from.x;
        const y = point.y - from.y;
        expect(Math.abs(x * dy - y * dx) / length).toBeLessThan(0.000001);
        const progress = (x * dx + y * dy) / (length * length);
        expect(progress).toBeGreaterThan(previousProgress);
        previousProgress = progress;
    }
};

const fixture = (ranked = false, sourceName = "Zena", victimName = "Peasant") => {
    const texture = new Texture({ source: new TextureSource({ width: 512, height: 512 }) });
    const world = new Container();
    const actor = (id: string, name: string, x: number, team: TeamType) => {
        const position = GridMath.getPositionForCell({ x, y: 4 }, gs.getMinX(), gs.getStep(), gs.getHalfStep())!;
        let destroyed = false;
        return {
            getId: () => id,
            getName: () => name,
            getTeam: () => team,
            getPosition: () => position,
            getVisualCenter: () => position,
            getProjectileImpactPoint: () => position,
            getDamagePredictionAnchor: () => position,
            getRangedProjectileOrigin: () => position,
            getCells: () => [{ x, y: 4 }],
            getBaseCell: () => ({ x, y: 4 }),
            isSmallSize: () => true,
            getAmountAlive: () => 5,
            getAmountDied: () => 5,
            setPosition: () => {},
            setRemainingStats: () => {
                destroyed = false;
            },
            syncVisual: () => {},
            setVisualGhost: () => {},
            getCurrentVisualScale: () => 1,
            startSpawnAnimation: () => {},
            getUnitProperties: () => ({ level: 3 }),
            getAnimationTextureKey: (): string | undefined => undefined,
            hasAbilityActive: (ability: string) => name === "Zena" && ability === "Chakram",
            hasAnimationState: () => true,
            isPlayingOneShotAnimation: () => false,
            isDead: () => destroyed,
            applyRecoil: () => {},
            playOneShotAnimation: mock((_state: string, done?: () => void) => done?.()),
            destroyVisuals: mock(() => {
                destroyed = true;
            }),
            getStaticBattlefieldPreviewAt: () =>
                destroyed
                    ? undefined
                    : {
                          texture,
                          x: position.x,
                          y: position.y,
                          anchorX: 0.5,
                          anchorY: 0.97,
                          scaleX: 0.5,
                          scaleY: -0.5,
                      },
        };
    };
    const a = actor("A", sourceName, 2, TeamVals.LEFT);
    const b = actor("B", victimName, 6, TeamVals.RIGHT);
    const c = actor("C", "Wolf", 9, TeamVals.RIGHT);
    const units = new Map([a, b, c].map((unit) => [unit.getId(), unit]));
    const visuals = new CombatVisuals({
        getGridSettings: () => gs,
        attachToWorldRoot: (node) => {
            world.addChild(node);
        },
        getUnitsHolder: () => undefined!,
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => {},
        setUnitPropertiesUpdateNeeded: () => {},
    });
    visuals.showFloatingDamage = mock();
    visuals.spawnBloodSpray = mock();
    visuals.spawnSlash = mock();
    visuals.showMissLabel = mock();
    const flights: { from: HoCMath.XY; to: HoCMath.XY; impact: () => void; finish: () => void }[] = [];
    const hops: (() => void)[] = [];
    const paths: HoCMath.XY[][] = [];
    const scene = Object.assign(Object.create(ranked ? RankedPlayScene.prototype : Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => gs },
        unitsHolder: { getAllUnits: () => units },
        combatVisuals: visuals,
        dyingVisualUnits: new Set(),
        isSceneDestroyed: () => false,
        snapshotRenderableUnits: () => units,
        drawer: { getUnitsContainer: () => world },
        renderResurrectionVfx: () => {},
        scheduleSceneTimeout: () => 0,
        prepareDirectionalAttackState: () => "attack",
        offsetReplayDamagePosition: (to: unknown) => to,
        popRecordedDullingDefense: () => {},
        playUnitCombatSound: () => {},
        applyReplayLunge: () => {},
        applyReplayHitKnockback: () => {},
        playReplayOneShot: () => Promise.resolve(),
        delayReplay: () => Promise.resolve(),
        waitForProjectileHitReaction: () => Promise.resolve(),
        fireUnitProjectile: (_source: unknown, opts: { from: HoCMath.XY; to: HoCMath.XY; onImpact: () => void }) =>
            new Promise<void>((finish) =>
                flights.push({ from: opts.from, to: opts.to, impact: opts.onImpact, finish }),
            ),
        rangedProjectiles: {
            prepare: () => Promise.resolve(),
            showChakramBounce: mock(() => Promise.resolve()),
            fireAlongPath: (points: HoCMath.XY[]) => {
                paths.push(points.map((point) => ({ ...point })));
                return new Promise<void>((resolve) => hops.push(resolve));
            },
        },
    });
    const run = (plan: CombatExchangeStrike[], damage: Partial<IVisibleDamage> = {}, melee = false) =>
        scene.playCombatExchange(
            a,
            b,
            { attackType: melee ? "melee" : "range", damage },
            plan,
            (unit: RenderableUnit) => scene.playCustomDeathAnimation(unit),
            units,
            [],
            false,
            { amountsBefore: new Map([...units.keys()].map((id) => [id, 5])), deadIds: new Set(["A", "B", "C"]) },
        ) as Promise<Set<string>>;
    const roots = () => world.children.filter((child) => child.label === "zena-brutality");
    const cleanup = () => {
        visuals.clear();
        world.destroy({ children: true });
        texture.destroy(true);
    };
    return { scene, a, b, c, units, visuals, world, flights, hops, paths, run, roots, cleanup };
};
const strike = (overrides: Partial<CombatExchangeStrike> = {}): CombatExchangeStrike => ({
    attackerId: "A",
    targetId: "B",
    amount: 100,
    unitsDied: 5,
    lethal: true,
    response: false,
    hitIndex: 0,
    ...overrides,
});

describe("Zena lethal impact routing", () => {
    test.each([false, true])("only projectile contact starts brutality, ranked=%s", async (ranked) => {
        const f = fixture(ranked);
        try {
            const pending = f.run([strike()]);
            await flush();
            const cut = prepareBrutalityTarget(f.b.getStaticBattlefieldPreviewAt()!, f.b.getName())!;
            expect(f.flights[0].to).toEqual(cut.point);
            expect(f.flights[0].to).not.toEqual(f.b.getProjectileImpactPoint());
            expect(f.roots()).toHaveLength(0);
            expect(f.b.destroyVisuals).not.toHaveBeenCalled();
            f.flights[0].impact();
            expect(f.roots()).toHaveLength(1);
            expect(f.b.destroyVisuals).toHaveBeenCalledTimes(1);
            expect(f.b.playOneShotAnimation).not.toHaveBeenCalled();
            f.flights[0].impact();
            f.flights[0].finish();
            await flush();
            f.hops.splice(0).forEach((finish) => finish());
            await pending;
            f.scene.playCustomDeathAnimation(f.b);
            expect(f.roots()).toHaveLength(1);
            expect(f.b.playOneShotAnimation).not.toHaveBeenCalled();
        } finally {
            f.cleanup();
        }
    });

    test.each([
        { name: "ordinary hit", changes: { lethal: false, unitsDied: 1 } },
        { name: "resurrected stack", changes: { lethal: false } },
        { name: "miss", changes: { missed: true } },
        { name: "absorbed hit", changes: { amount: 0, unitsDied: 0 } },
        { name: "later artifact explosion finishes the stack", changes: { unitsDied: 1 } },
    ])("$name does not receive a Zena finishing animation", async ({ changes }) => {
        const f = fixture();
        try {
            const pending = f.run([strike(changes)]);
            await flush();
            expect(f.flights[0].to).toEqual(f.b.getProjectileImpactPoint());
            f.flights[0].impact();
            f.flights[0].finish();
            await pending;
            expect(f.roots()).toHaveLength(0);
        } finally {
            f.cleanup();
        }
    });

    test("a different killer and an unknown future creature keep their own authored death", async () => {
        for (const [source, victim] of [
            ["Elf", "Peasant"],
            ["Zena", "Unknown Creature"],
        ]) {
            const f = fixture(false, source, victim);
            try {
                await f.run([strike()], {}, true);
                expect(f.roots()).toHaveLength(0);
                expect(f.b.playOneShotAnimation).toHaveBeenCalledTimes(1);
            } finally {
                f.cleanup();
            }
        }
    });

    test("Zena's cannon kill uses the matching mechanical finisher", async () => {
        const f = fixture(false, "Zena", "Tsar Cannon");
        try {
            await f.run([strike()], {}, true);
            expect(f.roots()).toHaveLength(1);
            expect(f.b.playOneShotAnimation).not.toHaveBeenCalled();
        } finally {
            f.cleanup();
        }
    });

    test.each([false, true])("a killing counter belongs to Zena, ranked=%s", async (ranked) => {
        const f = fixture(ranked, "Peasant", "Zena");
        try {
            const pending = f.run(
                orderCombatExchange(
                    [strike({ lethal: false, unitsDied: 0 })],
                    strike({ attackerId: "B", targetId: "A", response: true }),
                ),
            );
            await flush();
            expect(f.flights[0].to).toEqual(f.b.getProjectileImpactPoint());
            expect(f.flights[1].to).toEqual(
                prepareBrutalityTarget(f.a.getStaticBattlefieldPreviewAt()!, f.a.getName())!.point,
            );
            f.flights[1].impact();
            f.flights[1].finish();
            await flush();
            expect(f.roots()).toHaveLength(0);
            // Preserve the initiating victim's recorded outgoing projectile before removing its body.
            f.flights[0].impact();
            f.flights[0].finish();
            await flush();
            f.hops.splice(0).forEach((finish) => finish());
            await pending;
            expect(f.roots()).toHaveLength(1);
            expect(f.a.destroyVisuals).toHaveBeenCalled();
            expect(f.b.destroyVisuals).not.toHaveBeenCalled();
        } finally {
            f.cleanup();
        }
    });

    test.each([
        { ranked: false, legacy: false },
        { ranked: true, legacy: false },
        { ranked: false, legacy: true },
        { ranked: true, legacy: true },
    ])("each lethal ricochet starts at its own arrival, ranked=$ranked legacy=$legacy", async ({ ranked, legacy }) => {
        const f = fixture(ranked);
        try {
            const splash = [f.b, f.c].map((unit) => ({
                unitId: unit.getId(),
                position: unit.getPosition(),
                amount: 100,
                unitsDied: 5,
            }));
            const arcs = [
                {
                    targetUnitId: "C",
                    hitUnitIds: ["C"],
                    cells: [...f.b.getCells(), { x: 7, y: 4 }, { x: 8, y: 4 }, ...f.c.getCells()],
                },
            ];
            const damage = {
                unitId: "B",
                splash,
                chakramArcs: arcs,
                chakramFlights: legacy
                    ? undefined
                    : [
                          {
                              attackerId: "A",
                              primaryTargetId: "B",
                              response: false,
                              hitIndex: 0,
                              missed: false,
                              arcs,
                              splash,
                          },
                      ],
            };
            const pending = f.run([strike()], damage);
            await flush();
            const firstCut = prepareBrutalityTarget(f.b.getStaticBattlefieldPreviewAt()!, f.b.getName())!;
            const bounceCut = prepareBrutalityTarget(f.c.getStaticBattlefieldPreviewAt()!, f.c.getName())!;
            expect(f.flights[0].to).toEqual(firstCut.point);
            f.flights[0].impact();
            f.flights[0].finish();
            await flush();
            expect(f.roots()).toHaveLength(1);
            expect(f.c.destroyVisuals).not.toHaveBeenCalled();
            expect(f.paths[0][0]).toEqual(firstCut.point);
            expect(f.paths[0].at(-1)).toEqual(bounceCut.point);
            // The neck is chosen before flight: every separating waypoint must already lie on
            // that approach, rather than staying on the floor until the disc enters the victim.
            expect(f.paths[0]).toHaveLength(4);
            expectStraightApproach(f.paths[0]);
            f.hops.shift()!();
            await flush();
            expect(f.roots()).toHaveLength(2);
            expect(f.c.destroyVisuals).toHaveBeenCalledTimes(1);
            expect(f.paths[1][0]).toEqual(bounceCut.point);
            f.hops.shift()!();
            await pending;
            expect(f.roots()).toHaveLength(2);
        } finally {
            f.cleanup();
        }
    });

    test("single-projectile playback chooses the same complete neck approach before launch", async () => {
        const f = fixture();
        try {
            const primaryCut = prepareBrutalityTarget(f.b.getStaticBattlefieldPreviewAt()!, f.b.getName())!;
            const bounceCut = prepareBrutalityTarget(f.c.getStaticBattlefieldPreviewAt()!, f.c.getName())!;
            const cells = [...f.b.getCells(), { x: 7, y: 4 }, { x: 8, y: 4 }, ...f.c.getCells()];
            const onImpact = mock();
            const pending = f.scene.playChakramArcs(
                f.a,
                {
                    unitId: "B",
                    chakramArcs: [{ targetUnitId: "C", hitUnitIds: ["C"], cells }],
                    splash: [f.b, f.c].map((unit) => ({
                        unitId: unit.getId(),
                        position: unit.getPosition(),
                        amount: 100,
                        unitsDied: 5,
                    })),
                },
                f.b,
                f.units,
                true,
                undefined,
                { from: f.a.getPosition(), to: primaryCut.point, onImpact },
                new Map([
                    ["B", primaryCut],
                    ["C", bounceCut],
                ]),
            );
            await flush();
            expect(onImpact).not.toHaveBeenCalled();
            expect(f.paths[0]).toHaveLength(6);
            expect(f.paths[0][1]).toEqual(primaryCut.point);
            expect(f.paths[0][4]).toEqual(bounceCut.point);
            expectStraightApproach(f.paths[0].slice(1, -1));
            f.hops.shift()!();
            await pending;
        } finally {
            f.cleanup();
        }
    });

    test.each([
        { name: "wounding", amount: 30, unitsDied: 1, missed: false },
        { name: "missed", amount: 0, unitsDied: 0, missed: true },
        { name: "absorbed", amount: 0, unitsDied: 0, missed: false },
    ])("a $name ricochet keeps its body contact and its living victim", async ({ amount, unitsDied, missed }) => {
        const f = fixture();
        try {
            const arcs = [{ targetUnitId: "C", hitUnitIds: ["C"], cells: [...f.b.getCells(), ...f.c.getCells()] }];
            const splash = [
                { unitId: "B", position: f.b.getPosition(), amount: 100, unitsDied: 5 },
                { unitId: "C", position: f.c.getPosition(), amount, unitsDied, missed },
            ];
            const pending = f.run([strike()], {
                unitId: "B",
                splash,
                chakramArcs: arcs,
                chakramFlights: [
                    {
                        attackerId: "A",
                        primaryTargetId: "B",
                        response: false,
                        hitIndex: 0,
                        missed: false,
                        arcs,
                        splash,
                    },
                ],
            });
            await flush();
            f.flights[0].impact();
            f.flights[0].finish();
            await flush();
            expect(f.paths[0].at(-1)).toEqual(f.c.getProjectileImpactPoint());
            f.hops.shift()!();
            await flush();
            expect(f.c.destroyVisuals).not.toHaveBeenCalled();
            expect(f.roots()).toHaveLength(1);
            f.hops.shift()!();
            await pending;
        } finally {
            f.cleanup();
        }
    });

    test("an extra attack finishes a wounded stack once; hydrate preserves the detached finisher", async () => {
        const f = fixture();
        try {
            const pending = f.run([strike({ lethal: false, unitsDied: 2 }), strike({ unitsDied: 3, hitIndex: 1 })]);
            await flush();
            expect(f.flights[0].to).toEqual(f.b.getProjectileImpactPoint());
            f.flights[0].impact();
            f.flights[0].finish();
            await flush();
            expect(f.roots()).toHaveLength(0);
            expect(f.flights[1].to).toEqual(
                prepareBrutalityTarget(f.b.getStaticBattlefieldPreviewAt()!, f.b.getName())!.point,
            );
            f.flights[1].impact();
            f.flights[1].finish();
            await flush();
            f.hops.splice(0).forEach((finish) => finish());
            await pending;
            const root = f.roots()[0];
            f.visuals.clear({ keepDetachedOverlays: true });
            expect(root.destroyed).toBe(false);
            f.visuals.update(0.3);
            expect(root.getChildByLabel("severed-head")!.rotation).not.toBe(0);
            f.visuals.clear();
            expect(root.destroyed).toBe(true);
        } finally {
            f.cleanup();
        }
    });

    test("the finisher keeps its preflight pose even if the preview scratch changes while the disc flies", async () => {
        const f = fixture();
        try {
            const pose = f.b.getStaticBattlefieldPreviewAt()!;
            f.b.getStaticBattlefieldPreviewAt = () => pose;
            const expected = { ...pose };
            const pending = f.run([strike()]);
            await flush();
            const cut = { ...f.flights[0].to };
            pose.x += 700;
            pose.scaleX *= -1;
            pose.scaleY *= 1.8;
            f.flights[0].impact();
            const root = f.roots()[0];
            expect(root.position.x).toBe(expected.x);
            expect(root.position.y).toBe(expected.y);
            expect(f.flights[0].to).toEqual(cut);
            f.flights[0].finish();
            await flush();
            f.hops.splice(0).forEach((finish) => finish());
            await pending;
        } finally {
            f.cleanup();
        }
    });

    test("Last Fuse still detonates after Zena's killing strike", async () => {
        const f = fixture();
        try {
            const explosions = mock();
            f.scene.pyreDeaths = { play: explosions };
            await f.run([strike()], {}, true);
            expect(f.roots()).toHaveLength(1);
            expect(explosions).toHaveBeenCalledWith("B", f.b);
        } finally {
            f.cleanup();
        }
    });

    test("a later resurrection permits a new finisher on the same renderable body", async () => {
        const f = fixture();
        try {
            await f.run([strike()], {}, true);
            expect(f.roots()).toHaveLength(1);
            f.scene.syncResurrectedUnit({ unitId: "B", position: f.b.getPosition(), amount: 5, hp: 100 }, f.units);
            await f.run([strike()], {}, true);
            expect(f.roots()).toHaveLength(2);
            expect(f.b.destroyVisuals).toHaveBeenCalledTimes(2);
        } finally {
            f.cleanup();
        }
    });
});
