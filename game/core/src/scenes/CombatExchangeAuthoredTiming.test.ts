import { afterAll, beforeAll, expect, test } from "bun:test";
import { BufferImageSource, Container, DOMAdapter, Texture } from "pixi.js";
import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";
import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import { CombatVisuals } from "./sandbox/CombatVisuals";
import { orderCombatExchange } from "./sandbox/combat_exchange";
import type { IFireProjectileOptions } from "./sandbox/RangedProjectiles";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const factions: Record<string, string> = {
    Arbalester: "Life",
    Dryad: "Nature",
    Elf: "Nature",
    Wolf: "Nature",
    Orc: "Chaos",
    Medusa: "Chaos",
    Manticore: "Chaos",
    Centaur: "Might",
    Zena: "Might",
    Hydra: "Chaos",
    Scavenger: "Chaos",
    Troglodyte: "Chaos",
};
const flush = async () => {
    for (let index = 0; index < 24; index++) await Promise.resolve();
};

type AuthoredExchangeCase = {
    attackerName: string;
    defenderName: string;
    attackType: "range" | "melee";
    missedPrimary?: boolean;
    missedResponse?: boolean;
};

test.each<AuthoredExchangeCase>([
    { attackerName: "Elf", defenderName: "Zena", attackType: "range" },
    { attackerName: "Zena", defenderName: "Elf", attackType: "range" },
    { attackerName: "Orc", defenderName: "Dryad", attackType: "range" },
    { attackerName: "Arbalester", defenderName: "Medusa", attackType: "range" },
    { attackerName: "Centaur", defenderName: "Orc", attackType: "range" },
    { attackerName: "Wolf", defenderName: "Manticore", attackType: "melee" },
    { attackerName: "Orc", defenderName: "Medusa", attackType: "melee" },
    { attackerName: "Orc", defenderName: "Hydra", attackType: "melee" },
    { attackerName: "Hydra", defenderName: "Orc", attackType: "melee" },
    { attackerName: "Scavenger", defenderName: "Troglodyte", attackType: "melee", missedResponse: true },
    { attackerName: "Troglodyte", defenderName: "Scavenger", attackType: "melee", missedPrimary: true },
    {
        attackerName: "Scavenger",
        defenderName: "Scavenger",
        attackType: "melee",
        missedPrimary: true,
        missedResponse: true,
    },
])(
    "$attackerName / $defenderName $attackType keep both authored attacks without a late hit pose",
    async ({ attackerName, defenderName, attackType, missedPrimary = false, missedResponse = false }) => {
        // Test pre-action replay figures and the already-resolved, mutually lethal local-engine state.
        for (const lethal of [false, true])
            for (const direction of [-1, 0, 1]) {
                const texture = new Texture({
                    source: new BufferImageSource({ resource: new Uint8Array(4), width: 16384, height: 16384 }),
                });
                const world = new Container();
                const actors = [attackerName, defenderName].map((name, index) => {
                    const effects = new EffectFactory();
                    const team = index ? TeamVals.RIGHT : TeamVals.LEFT;
                    const base = Unit.createUnit(
                        HoCConfig.getCreatureConfig(team, factions[name], name, "test_512", 10),
                        gs,
                        team,
                        UnitVals.CREATURE,
                        new AbilityFactory(effects),
                        effects,
                        false,
                    );
                    const unit = RenderableUnit.fromBase(base, () => texture);
                    unit.setPosition(index ? 400 : -400, 1024 + (index ? direction * 400 : 0));
                    unit.ensureVisual(world, gs);
                    return unit;
                });
                const [attacker, defender] = actors;
                let frame = 0;
                let hydraAdvanced = false;
                const starts: { actor: RenderableUnit; state: string; frame: number }[] = [];
                for (const actor of actors) {
                    const play = actor.playOneShotAnimation.bind(actor);
                    actor.playOneShotAnimation = (state, complete, force) => {
                        starts.push({ actor, state, frame });
                        return play(state, complete, force);
                    };
                }
                const captured = new Map(actors.map((unit) => [unit.getId(), unit]));
                const current = new Map(captured);
                const dying = lethal ? actors.filter((_actor, index) => !(index ? missedPrimary : missedResponse)) : [];
                for (const actor of dying) {
                    actor.setAmountAlive(0);
                    current.delete(actor.getId());
                }
                const sleeps: (() => void)[] = [];
                const projectiles: IFireProjectileOptions[] = [];
                const deaths: RenderableUnit[] = [];
                const damage: number[] = [];
                const misses: RenderableUnit[] = [];
                // Exercise the real MISS → authored dodge path; floating text does not need a renderer.
                const missVisuals = Object.assign(Object.create(CombatVisuals.prototype), {
                    context: { getGridSettings: () => gs },
                    getMissStyle: () => ({}),
                    flagOverlayAnchor: () => ({ x: 0, y: 0 }),
                    enqueueFloatingContainer: (container: Container) => container.destroy({ children: true }),
                });
                let prepareCount = 0;
                let loadCounterProjectile!: () => void;
                const scene = Object.assign(Object.create(Sandbox.prototype), {
                    sc_sceneSettings: { getGridSettings: () => gs },
                    unitsHolder: { getAllUnits: () => current },
                    dyingVisualUnits: new Set(),
                    isSceneDestroyed: () => false,
                    waitForTexture: async () => texture,
                    scheduleSceneTimeout: () => 1,
                    clearSceneTimeout: () => {},
                    delayReplay: () => new Promise<void>((resolve) => sleeps.push(resolve)),
                    playUnitCombatSound: () => {},
                    playSceneGameSound: () => {},
                    popRecordedDullingDefense: () => {},
                    combatVisuals: {
                        spawnCommonFlagPop: () => {},
                        showFloatingDamage: (_position: unknown, amount: number) => damage.push(amount),
                        spawnBloodSpray: () => {},
                        spawnSlash: () => {},
                        showMissLabel: (
                            position: { x: number; y: number },
                            direction: undefined,
                            unit: RenderableUnit,
                        ) => {
                            misses.push(unit);
                            missVisuals.showMissLabel(position, direction, unit);
                        },
                    },
                    rangedProjectiles: {
                        prepare: () =>
                            ++prepareCount === 2
                                ? new Promise<void>((resolve) => {
                                      loadCounterProjectile = resolve;
                                  })
                                : Promise.resolve(),
                        fire: async (opts: IFireProjectileOptions) => {
                            projectiles.push(opts);
                            // Immediate contact stresses an incoming hit while the opponent is still winding up.
                            if (opts.returnToOrigin) opts.onWaypoint?.(0);
                            opts.onImpact?.();
                        },
                        fireAlongPath: async () => {},
                    },
                });
                const makeStrike = (source: RenderableUnit, victim: RenderableUnit, response: boolean) => {
                    const missed = response ? missedResponse : missedPrimary;
                    return {
                        attackerId: source.getId(),
                        targetId: victim.getId(),
                        amount: missed ? 0 : 10,
                        unitsDied: lethal && !missed ? 10 : 0,
                        lethal: lethal && !missed,
                        missed,
                        response,
                        hitIndex: 0,
                    };
                };
                let completed = false;
                const playback = scene
                    .playCombatExchange(
                        attacker,
                        defender,
                        { attackType, damage: {} },
                        orderCombatExchange(
                            [makeStrike(attacker, defender, false)],
                            makeStrike(defender, attacker, true),
                        ),
                        (unit: RenderableUnit) => {
                            deaths.push(unit);
                            unit.playOneShotAnimation("death", undefined, true);
                        },
                        captured,
                        [],
                        undefined,
                        {
                            amountsBefore: new Map(actors.map((unit) => [unit.getId(), 10])),
                            deadIds: new Set(dying.map((actor) => actor.getId())),
                        },
                    )
                    .then(() => {
                        completed = true;
                    });
                try {
                    await flush();
                    if (attackType === "range") {
                        expect(starts).toEqual([]);
                        loadCounterProjectile();
                        await flush();
                    }
                    const attacks = starts.filter((entry) => entry.state.includes("attack"));
                    expect(new Set(attacks.map((entry) => entry.actor))).toEqual(new Set(actors));
                    expect(attacks.map((entry) => entry.frame)).toEqual([0, 0]);
                    expect(starts.some((entry) => entry.state === "hit" || entry.state === "death")).toBe(false);
                    const hydra = actors.find((actor) => actor.getName() === "Hydra");
                    const hydraAnimation = (
                        hydra as unknown as { oneShotAnim?: { frames: Texture[]; frameIndex: number } } | undefined
                    )?.oneShotAnim;
                    if (hydra) expect(hydraAnimation!.frames.length).toBeGreaterThan(1);
                    for (frame = 1; frame <= 400 && !completed; frame++) {
                        for (const actor of actors) actor.stepOneShotAnimation(16);
                        if (hydraAnimation && hydraAnimation.frameIndex > 0) hydraAdvanced = true;
                        sleeps.splice(0).forEach((resolve) => resolve());
                        await flush();
                    }
                    expect(completed).toBe(true);
                    await playback;
                    expect(projectiles).toHaveLength(attackType === "range" ? 2 : 0);
                    expect(projectiles.some((shot) => shot.signal?.aborted)).toBe(false);
                    expect(starts.filter((entry) => entry.state.includes("attack"))).toHaveLength(2);
                    expect(
                        new Set(starts.filter((entry) => entry.state === "hit").map((entry) => entry.actor.getName())),
                    ).toEqual(new Set());
                    expect(new Set(deaths)).toEqual(new Set(dying));
                    expect(damage).toEqual([missedPrimary, missedResponse].filter((missed) => !missed).map(() => 10));
                    expect(misses).toEqual([
                        ...(missedPrimary ? [defender] : []),
                        ...(missedResponse ? [attacker] : []),
                    ]);
                    if (hydra) expect(hydraAdvanced).toBe(true);
                } finally {
                    for (const actor of actors) actor.destroyVisuals();
                    world.destroy({ children: true });
                    texture.destroy(true);
                }
            }
    },
);
