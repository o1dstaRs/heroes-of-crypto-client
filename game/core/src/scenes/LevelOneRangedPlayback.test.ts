import { expect, test } from "bun:test";
import { Sandbox } from "./Sandbox";
import type { RenderableUnit } from "./RenderableUnit";
import type { IFireProjectileOptions } from "./sandbox/RangedProjectiles";

test.each(["Arbalester", "Dryad", "Centaur", "Orc"])(
    "%s uses frame-triggered projectiles in ordinary combat in all directions",
    async (name) => {
        for (const dy of [-100, 0, 100]) {
            const events: string[] = [];
            const releaseOrigin = { x: 22, y: 33 };
            const unit = {
                getName: () => name,
                hasAnimationState: () => true,
                getProjectileImpactPoint: () => ({ x: 0, y: 0 }),
                getRangedProjectileOrigin: () => releaseOrigin,
                getOrcProjectileAppearance: () => undefined,
                setBoardFacing: () => {},
                isPlayingOneShotAnimation: () => false,
                playCentaurLabRangedThrow: (state: string, release: () => void) => {
                    events.push(state);
                    release();
                    return true;
                },
                playOrcRangedThrow: (state: string, release: () => void) => {
                    events.push(state);
                    release();
                    return true;
                },
                finishOrcRangedThrow: () => {},
            } as unknown as RenderableUnit;
            const scene = Object.assign(Object.create(Sandbox.prototype), {
                creatureAnimationLabEnabled: false,
                sc_sceneSettings: { getGridSettings: () => ({ getCellSize: () => 100 }) },
                isSceneDestroyed: () => false,
                scheduleSceneTimeout: () => 1,
                clearSceneTimeout: () => {},
                rangedProjectiles: {
                    prepare: async () => {
                        events.push("prepare");
                    },
                    fire: async (opts: IFireProjectileOptions) => {
                        expect(opts.from).toEqual(releaseOrigin);
                        events.push("flight");
                    },
                },
                fireDryadLabProjectile: async (_unit: RenderableUnit, _opts: IFireProjectileOptions, state: string) => {
                    events.push("dryad:" + state);
                },
                fireArbalesterLabProjectile: async (
                    _unit: RenderableUnit,
                    _opts: IFireProjectileOptions,
                    state: string,
                ) => {
                    events.push("arbalester:" + state);
                },
            });
            await scene.fireUnitProjectile(unit, {
                from: { x: 0, y: 0 },
                to: { x: 500, y: dy },
                big: false,
                dryadArrow: name === "Dryad",
                arbalesterBolt: name === "Arbalester",
                centaurSpear: name === "Centaur",
                orcAxe: name === "Orc",
            });
            const state = dy === 0 ? "attack" : dy > 0 ? "attack_up" : "attack_down";
            expect(events).toEqual(
                name === "Dryad" || name === "Arbalester"
                    ? ["prepare", name.toLowerCase() + ":" + state]
                    : ["prepare", state, "flight"],
            );
        }
    },
);

test("a following shot waits for the previous recovery and an incoming hit", async () => {
    const states = ["attack_down", "attack_down", "hit", "hit", "idle"];
    let frame = 0;
    const unit = { isPlayingOneShotAnimation: (state: string) => state === states[frame] };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        isSceneDestroyed: () => false,
        delayReplay: async () => {
            frame++;
        },
    });
    expect(await scene.waitForProjectileHitReaction(unit)).toBe(true);
    expect(frame).toBe(4);
});

test.each(["Arbalester", "Dryad", "Centaur", "Orc"])(
    "%s does not start a duplicate ranged clip before its projectile player",
    async (name) => {
        const events: string[] = [];
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            prepareDirectionalAttackState: () => {
                events.push("aim");
                return "attack_up";
            },
            playReplayOneShot: async () => {
                events.push("standalone");
            },
        });
        await scene.playDirectionalAttackOneShot({ getName: () => name }, {}, 5000, false);
        expect(events).toEqual(["aim"]);
        await scene.playDirectionalAttackOneShot({ getName: () => name }, {}, 5000, true);
        expect(events).toEqual(["aim", "aim", "standalone"]);
    },
);
