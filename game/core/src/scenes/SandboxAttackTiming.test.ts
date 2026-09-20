import { describe, expect, test } from "bun:test";

import { ATTACK_HIT_STAGGER_MS, getAttackFinalImpactDelayMs, Sandbox } from "./Sandbox";
import type { RenderableUnit } from "./RenderableUnit";
import type { IFireProjectileOptions } from "./sandbox/RangedProjectiles";

describe("attack impact timing", () => {
    test("single-hit deaths tear down on impact without a readability hold", () => {
        expect(getAttackFinalImpactDelayMs(0)).toBe(0);
        expect(getAttackFinalImpactDelayMs(1)).toBe(0);
    });

    test("multi-hit deaths follow the same cadence as their visible hit numbers", () => {
        expect(getAttackFinalImpactDelayMs(2)).toBe(ATTACK_HIT_STAGGER_MS);
        expect(getAttackFinalImpactDelayMs(3)).toBe(ATTACK_HIT_STAGGER_MS * 2);
    });
});

describe("Arbalester lab projectile timing", () => {
    test("prepares before windup and captures the muzzle on release before awaiting flight", async () => {
        let finishPrepare!: () => void;
        let finishFlight!: () => void;
        let release!: () => void;
        const shot = new AbortController();
        let muzzle = { x: 42, y: 84 };
        let shots = 0;
        let fired: IFireProjectileOptions | undefined;
        let finished = 0;
        const unit = {
            prepareArbalesterRangedShot: () => shot,
            playArbalesterRangedShot: (_state: string, _shot: AbortController, callback: () => void) => {
                shots++;
                release = callback;
                return true;
            },
            getVisualCenter: () => ({ x: 0, y: 0 }),
            setBoardFacing: () => {},
            getRangedProjectileOrigin: () => muzzle,
            finishArbalesterRangedShot: () => finished++,
        } as unknown as RenderableUnit;
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            sc_sceneSettings: { getGridSettings: () => ({}) },
            isSceneDestroyed: () => false,
            scheduleSceneTimeout: () => 1,
            clearSceneTimeout: () => {},
            rangedProjectiles: {
                prepare: () =>
                    new Promise<void>((resolve) => {
                        finishPrepare = resolve;
                    }),
                fire: (opts: IFireProjectileOptions) => {
                    fired = opts;
                    return new Promise<void>((resolve) => {
                        finishFlight = resolve;
                    });
                },
            },
        }) as {
            fireArbalesterLabProjectile(
                unit: RenderableUnit,
                opts: IFireProjectileOptions,
                state: string,
            ): Promise<void>;
        };
        const pending = scene.fireArbalesterLabProjectile(
            unit,
            { from: { x: 0, y: 0 }, to: { x: 200, y: 0 }, big: false, arbalesterBolt: true },
            "attack",
        );
        expect(shots).toBe(0);
        finishPrepare();
        await Promise.resolve();
        expect(shots).toBe(1);
        expect(fired).toBeUndefined();
        release();
        muzzle = { x: 999, y: 999 }; // A large animation tick may already be showing recovery now.
        await Promise.resolve();
        expect(fired?.from).toEqual({ x: 42, y: 84 });
        expect(fired?.signal).toBe(shot.signal);
        expect(finished).toBe(0);
        finishFlight();
        await pending;
        expect(finished).toBe(1);
    });

    test("cancels a shot during preparation or windup without ever firing", async () => {
        for (const duringPreparation of [true, false]) {
            const shot = new AbortController();
            let finishPrepare!: () => void;
            let fired = 0;
            let finished = 0;
            const unit = {
                prepareArbalesterRangedShot: () => shot,
                playArbalesterRangedShot: () => true,
                getVisualCenter: () => ({ x: 0, y: 0 }),
                setBoardFacing: () => {},
                finishArbalesterRangedShot: () => finished++,
            } as unknown as RenderableUnit;
            const scene = Object.assign(Object.create(Sandbox.prototype), {
                sc_sceneSettings: { getGridSettings: () => ({}) },
                isSceneDestroyed: () => false,
                scheduleSceneTimeout: () => 1,
                clearSceneTimeout: () => {},
                rangedProjectiles: {
                    prepare: () =>
                        new Promise<void>((resolve) => {
                            finishPrepare = resolve;
                        }),
                    fire: async () => {
                        fired++;
                    },
                },
            }) as {
                fireArbalesterLabProjectile(
                    unit: RenderableUnit,
                    opts: IFireProjectileOptions,
                    state: string,
                ): Promise<void>;
            };
            const pending = scene.fireArbalesterLabProjectile(
                unit,
                { from: { x: 0, y: 0 }, to: { x: 200, y: 0 }, big: false, arbalesterBolt: true },
                "attack",
            );
            if (duringPreparation) shot.abort();
            finishPrepare();
            await Promise.resolve();
            shot.abort();
            await pending;
            expect(fired).toBe(0);
            expect(finished).toBe(1);
        }
    });

    test.each(["Orc", "Arbalester"])(
        "%s reacts only on impact and targets placed enemies in all directions",
        (unitName) => {
            const hits: string[] = [];
            const makeUnit = (id: string, team: number, y: number, placed = true) => ({
                getId: () => id,
                getName: () => unitName,
                getTeam: () => team,
                getPosition: () => ({ x: 0, y }),
                getVisualCenter: () => ({ x: 0, y }),
                getProjectileImpactPoint: () => ({ x: 0, y: y + 80 }),
                getCells: () => [{ x: placed ? 1 : 0, y }],
                hasAnimationState: () => true,
                isPlayingOneShotAnimation: () => false,
                hasPendingArbalesterRangedShot: () => false,
                playOneShotAnimation: () => hits.push(id),
            });
            const shooter = makeUnit("shooter", 1, 1000);
            const enemies = [
                makeUnit("up", 2, 1200),
                makeUnit("down", 2, 800),
                makeUnit("side", 2, 1000),
                makeUnit("bench", 2, 1100, false),
                makeUnit("ally", 1, 1100),
            ];
            const units = new Map([shooter, ...enemies].map((unit) => [unit.getId(), unit]));
            let fired: IFireProjectileOptions | undefined;
            const scene = Object.assign(Object.create(Sandbox.prototype), {
                creatureAnimationLabEnabled: true,
                moveAnimManager: { isMoving: () => false },
                creatureAnimationLabPlacedUnit: () => ({ ok: true, unit: shooter }),
                rangedProjectiles: { hasActive: () => false },
                unitsHolder: { getAllUnits: () => units },
                grid: {
                    getOccupantUnitId: (cell: { x: number; y: number }) =>
                        cell.x
                            ? enemies
                                  .find((enemy) => enemy.getPosition().y === cell.y && enemy.getId() !== "bench")
                                  ?.getId()
                            : undefined,
                },
                sc_sceneSettings: {
                    getGridSettings: () => ({ getCellSize: () => 100, getMinX: () => -1000, getMaxX: () => 1000 }),
                },
                isSceneDestroyed: () => false,
                fireUnitProjectile: async (_unit: RenderableUnit, opts: IFireProjectileOptions) => {
                    fired = opts;
                },
            }) as Sandbox;
            for (const [state, target, y] of [
                ["attack_up", "up", 1280],
                ["attack_down", "down", 880],
                ["attack", "side", 1080],
            ] as const) {
                expect(scene.playCreatureAnimationLabState(state).ok).toBe(true);
                expect(fired?.arbalesterBolt).toBe(unitName === "Arbalester");
                expect(fired?.orcAxe).toBe(unitName === "Orc");
                expect(fired?.to).toEqual({ x: 0, y });
                expect(hits).not.toContain(target);
                fired?.onImpact?.();
                expect(hits).toContain(target);
            }
            // Removing the victim before arrival must not animate a detached figure.
            hits.length = 0;
            expect(scene.playCreatureAnimationLabState("attack_up").ok).toBe(true);
            units.delete("up");
            fired?.onImpact?.();
            expect(hits).toHaveLength(0);
            expect(scene.playCreatureAnimationLabState("hit").ok).toBe(true);
            expect(hits).toEqual(["shooter"]);
        },
    );
});
