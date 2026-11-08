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
};
const flush = async () => {
    for (let index = 0; index < 24; index++) await Promise.resolve();
};

test.each([
    { attackerName: "Elf", defenderName: "Zena", attackType: "range" },
    { attackerName: "Zena", defenderName: "Elf", attackType: "range" },
    { attackerName: "Orc", defenderName: "Dryad", attackType: "range" },
    { attackerName: "Arbalester", defenderName: "Medusa", attackType: "range" },
    { attackerName: "Centaur", defenderName: "Orc", attackType: "range" },
    { attackerName: "Wolf", defenderName: "Manticore", attackType: "melee" },
    { attackerName: "Orc", defenderName: "Medusa", attackType: "melee" },
])(
    "$attackerName / $defenderName $attackType preserve both authored attacks before reactions or deaths",
    async ({ attackerName, defenderName, attackType }) => {
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
                if (lethal)
                    for (const actor of actors) {
                        actor.setAmountAlive(0);
                        current.delete(actor.getId());
                    }
                const sleeps: (() => void)[] = [];
                const projectiles: IFireProjectileOptions[] = [];
                const deaths: RenderableUnit[] = [];
                const damage: number[] = [];
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
                    popRecordedDullingDefense: () => {},
                    combatVisuals: {
                        spawnCommonFlagPop: () => {},
                        showFloatingDamage: (_position: unknown, amount: number) => damage.push(amount),
                        spawnBloodSpray: () => {},
                        spawnSlash: () => {},
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
                const makeStrike = (source: RenderableUnit, victim: RenderableUnit, response: boolean) => ({
                    attackerId: source.getId(),
                    targetId: victim.getId(),
                    amount: 10,
                    unitsDied: lethal ? 10 : 0,
                    lethal,
                    response,
                    hitIndex: 0,
                });
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
                            deadIds: new Set(lethal ? captured.keys() : []),
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
                    for (frame = 1; frame <= 400 && !completed; frame++) {
                        for (const actor of actors) actor.stepOneShotAnimation(16);
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
                    ).toEqual(new Set(lethal ? [] : actors.map((actor) => actor.getName())));
                    expect(new Set(deaths)).toEqual(new Set(lethal ? actors : []));
                    expect(damage).toEqual([10, 10]);
                } finally {
                    for (const actor of actors) actor.destroyVisuals();
                    world.destroy({ children: true });
                    texture.destroy(true);
                }
            }
    },
);
