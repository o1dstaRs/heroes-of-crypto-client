import { afterAll, beforeAll, expect, test } from "bun:test";
import { BufferImageSource, Container, DOMAdapter, Texture } from "pixi.js";
import {
    AbilityFactory,
    CreatureVals,
    EffectFactory,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
    type GameEvent,
} from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot, AuthoritativeUnitState } from "../game_action_transport";
import { RankedPlayScene } from "./RankedPlayScene";
import { RenderableUnit } from "./RenderableUnit";
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
const flush = async () => {
    for (let index = 0; index < 40; index++) await Promise.resolve();
};

test.each([
    { names: ["Wolf", "Orc"], factions: ["Nature", "Chaos"], attackType: "melee", blows: 1 },
    { names: ["Wolf", "Wolf"], factions: ["Nature", "Nature"], attackType: "melee", blows: 2 },
    { names: ["Orc", "Dryad"], factions: ["Chaos", "Nature"], attackType: "range", blows: 1 },
    { names: ["Elf", "Zena"], factions: ["Nature", "Might"], attackType: "range", blows: 2 },
    { names: ["Arbalester", "Medusa"], factions: ["Life", "Chaos"], attackType: "range", blows: 1 },
] as const)(
    "ranked $names $attackType finishes each hit reaction before the response, including $blows blows",
    async ({ names, factions, attackType, blows }) => {
        const texture = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 16384, height: 16384 }),
        });
        const world = new Container();
        const actors = names.map((name, index) => {
            const effects = new EffectFactory();
            const team = index ? TeamVals.RIGHT : TeamVals.LEFT;
            const unit = RenderableUnit.fromBase(
                Unit.createUnit(
                    HoCConfig.getCreatureConfig(team, factions[index], name, "test_512", 10),
                    gs,
                    team,
                    UnitVals.CREATURE,
                    new AbilityFactory(effects),
                    effects,
                    false,
                ),
                () => texture,
            );
            const position = GridMath.getPositionForFootprintAnchor(
                gs,
                { x: index ? 18 : 6, y: 12 },
                unit.getFootprintWidth(),
                unit.getFootprintHeight(),
            );
            unit.setPosition(position.x, position.y);
            unit.ensureVisual(world, gs);
            return unit;
        });
        const [attacker, defender] = actors;
        const units = new Map(actors.map((unit) => [unit.getId(), unit]));
        let frame = 0;
        const starts: { unit: RenderableUnit; state: string; frame: number }[] = [];
        const finished: { unit: RenderableUnit; state: string; frame: number }[] = [];
        for (const unit of actors) {
            const play = unit.playOneShotAnimation.bind(unit);
            unit.playOneShotAnimation = (state, complete, force) => {
                if (state === "hit") expect(unit.isPlayingForegroundAttackAnimation()).toBe(false);
                starts.push({ unit, state, frame });
                return play(
                    state,
                    () => {
                        finished.push({ unit, state, frame });
                        complete?.();
                    },
                    force,
                );
            };
        }
        const snapshot: AuthoritativeGameSnapshot = {
            gameId: "combat-timing",
            phase: 2,
            gridType: GridVals.NORMAL,
            currentLap: 1,
            fightStarted: true,
            fightFinished: false,
            currentUnitId: attacker.getId(),
            currentTurnTeam: attacker.getTeam(),
            latestSequence: 1,
            narrowingLayers: 0,
            centerDried: false,
            units: actors.map((unit, index): AuthoritativeUnitState => ({
                id: unit.getId(),
                name: unit.getName(),
                team: unit.getTeam(),
                creatureId:
                    CreatureVals[unit.getName().toUpperCase().replaceAll(" ", "_") as keyof typeof CreatureVals],
                amountAlive: unit.getAmountAlive(),
                amountDied: 0,
                hp: unit.getHp() - (index ? blows : 1),
                maxHp: unit.getMaxHp(),
                attackType: unit.getAttackTypeSelection(),
                size: unit.getUnitProperties().size,
                baseCell: unit.getBaseCell(),
                cells: unit.getCells(),
                initiative: unit.getInitiative(),
                morale: 0,
                dead: false,
                placed: true,
                stackPower: unit.getStackPower(),
                rangeShots: unit.getRangeShots() + 1,
                luck: 0,
                onHourglass: false,
                responded: index === 1,
            })),
        };
        const event: Extract<GameEvent, { type: "unit_attacked" }> = {
            type: "unit_attacked",
            attackerId: attacker.getId(),
            targetId: defender.getId(),
            attackType,
            unitIdsDied: [],
            damage: {
                amount: blows,
                unitId: defender.getId(),
                render: true,
                unitPosition: defender.getPosition(),
                unitIsSmall: defender.isSmallSize(),
                hits: Array.from({ length: blows }, () => ({ amount: 1, unitsDied: 0 })),
                ...(attackType === "range" ? { rangedVolleyCount: blows } : {}),
            },
            animations:
                attackType === "range"
                    ? [...Array<RenderableUnit>(blows).fill(attacker), defender].map((source) => ({
                          fromPosition: source.getPosition(),
                          toPosition: (source === attacker ? defender : attacker).getPosition(),
                          affectedUnitId: (source === attacker ? defender : attacker).getId(),
                      }))
                    : [],
        };
        const sleeps: { due: number; resolve(): void }[] = [];
        const projectiles: IFireProjectileOptions[] = [];
        const damage: number[] = [];
        let settled = false;
        const noop = () => {};
        const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
            lastAuthoritativeSequence: 0,
            playedAuthoritativeActionSequences: new Set(),
            currentActiveUnit: attacker,
            unitsHolder: { getAllUnits: () => units },
            drawer: { getUnitsContainer: () => world },
            sc_sceneSettings: { getGridSettings: () => gs },
            sc_sceneLog: { updateLog: noop },
            dyingVisualUnits: new Set(),
            isSceneDestroyed: () => false,
            preparePyreDeaths: noop,
            waitForTexture: async () => texture,
            scheduleSceneTimeout: () => 1,
            clearSceneTimeout: noop,
            delayReplay: (ms: number) =>
                new Promise<void>((resolve) => sleeps.push({ due: frame + Math.ceil(ms / (1000 / 60)), resolve })),
            playUnitCombatSound: noop,
            combatVisuals: {
                showFloatingDamage: (_position: unknown, amount: number) => damage.push(amount),
                spawnBloodSpray: noop,
                spawnSlash: noop,
            },
            rangedProjectiles: {
                prepare: async () => {},
                fire: async (options: IFireProjectileOptions) => {
                    projectiles.push(options);
                    // Contact during the other unit's windup must not cancel its authored response.
                    if (options.returnToOrigin) options.onWaypoint?.(0);
                    options.onImpact?.();
                },
                fireAlongPath: async () => {},
            },
            spawnFireBreathVfx: noop,
            spawnChainLightningVfx: noop,
            spawnFireDamageVfx: noop,
            showReplayAttackDamage: noop,
            spawnAbilityStealVfx: noop,
            spawnShatterArmorSlashVfx: noop,
            spawnSkewerWindSpearVfx: noop,
            destroyReplayAttackUnitsAtImpact: noop,
            applyReplayEvents: noop,
            applyRankedUnitStats: () => {
                settled = true;
            },
        });
        let completed = false;
        const playback = scene
            .playAuthoritativeActionRecord(
                {
                    type: attackType === "melee" ? "melee_attack" : "range_attack",
                    attackerId: attacker.getId(),
                    targetId: defender.getId(),
                },
                [event],
                snapshot,
            )
            .then((played: boolean) => {
                completed = true;
                return played;
            });
        try {
            await flush();
            const opening = starts.filter((entry) => entry.state.includes("attack"));
            expect(opening.map((entry) => entry.unit.getId())).toEqual([attacker.getId()]);
            expect(opening.map((entry) => entry.frame)).toEqual([0]);
            expect(actors.map((unit) => unit.isPlayingForegroundAttackAnimation())).toEqual([true, false]);
            expect(starts.every((entry) => entry.state !== "hit")).toBe(true);
            expect(settled).toBe(false);
            for (frame = 1; frame < 2400 && !completed; frame++) {
                for (const unit of actors) unit.stepSpawnAnimation(1 / 240);
                for (const sleep of sleeps.filter((sleep) => sleep.due <= frame)) {
                    sleeps.splice(sleeps.indexOf(sleep), 1);
                    sleep.resolve();
                }
                await flush();
            }
            expect(completed).toBe(true);
            expect(await playback).toBe(true);
            expect(settled).toBe(true);
            expect(scene.lastAuthoritativeSequence).toBe(1);
            expect(starts.filter((entry) => entry.state.includes("attack"))).toHaveLength(blows + 1);
            expect(new Set(starts.filter((entry) => entry.state === "hit").map((entry) => entry.unit.getId()))).toEqual(
                new Set(actors.map((unit) => unit.getId())),
            );
            const responseStart = starts.find((entry) => entry.unit === defender && entry.state.includes("attack"))!;
            expect(
                finished.some(
                    (entry) => entry.unit === defender && entry.state === "hit" && entry.frame <= responseStart.frame,
                ),
            ).toBe(true);
            if (blows === 2) {
                const second = starts.filter((entry) => entry.unit === attacker && entry.state.includes("attack"))[1];
                expect(
                    actors.every((unit) =>
                        finished.some(
                            (entry) => entry.unit === unit && entry.state === "hit" && entry.frame <= second.frame,
                        ),
                    ),
                ).toBe(true);
            }
            expect(projectiles).toHaveLength(attackType === "range" ? blows + 1 : 0);
            expect(projectiles.some((shot) => shot.signal?.aborted)).toBe(false);
            expect(damage).toEqual(Array(blows + 1).fill(1));
        } finally {
            for (const unit of actors) unit.destroyVisuals();
            world.destroy({ children: true });
            texture.destroy(true);
        }
    },
);
