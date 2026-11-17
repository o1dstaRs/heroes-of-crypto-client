import { afterAll, beforeAll, expect, mock, spyOn, test } from "bun:test";
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
import { FIRE_SPELL_PLAYBACK_SPEED, FIRE_STRIKE_RELEASE_MS } from "../settings/fireSpellTiming";

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

for (const [name, faction] of [
    ["Battle Mage", "Life"],
    ["Wandering Mage", "Chaos"],
])
    for (const windupMs of [0, FIRE_STRIKE_RELEASE_MS / FIRE_SPELL_PLAYBACK_SPEED])
        test(`${name} releases a ${windupMs ? "charged arrow" : "fireball"} before recovery and keeps every cast frame`, () => {
            let now = 1000;
            const clock = spyOn(performance, "now").mockImplementation(() => now);
            const texture = new Texture({
                source: new BufferImageSource({ resource: new Uint8Array(4), width: 16384, height: 16384 }),
            });
            const world = new Container();
            const effects = new EffectFactory();
            const unit = RenderableUnit.fromBase(
                Unit.createUnit(
                    HoCConfig.getCreatureConfig(TeamVals.LEFT, faction, name, "test_512", 10),
                    gs,
                    TeamVals.LEFT,
                    UnitVals.CREATURE,
                    new AbilityFactory(effects),
                    effects,
                    false,
                ),
                () => texture,
            );
            try {
                unit.ensureVisual(world, gs);
                const complete = mock(() => undefined);
                const releases: number[] = [];
                expect(unit.playOneShotAnimation("cast", complete, true)).toBe(true);
                const anim = (
                    unit as unknown as {
                        oneShotAnim: {
                            frames: Texture[];
                            durationPerFrame: number;
                            frameDurationsMs?: number[];
                            frameIndex: number;
                        };
                    }
                ).oneShotAnim;
                const durations = anim.frames.map(
                    (_frame, index) => anim.frameDurationsMs?.[index] ?? anim.durationPerFrame,
                );
                const total = durations.reduce((sum, ms) => sum + ms, 0);
                expect(unit.onCastProjectileRelease(() => releases.push(now - 1000), windupMs)).toBe(true);
                const visited = new Set([0]);
                for (let elapsed = 1; elapsed <= Math.ceil(total) + 1; elapsed++) {
                    now = 1000 + elapsed;
                    unit.stepOneShotAnimation(1);
                    if (unit.isPlayingOneShotAnimation("cast")) visited.add(anim.frameIndex);
                }
                expect(releases).toHaveLength(1);
                expect(releases[0] + windupMs).toBeGreaterThanOrEqual(total * 0.8 - 1);
                expect(releases[0] + windupMs).toBeLessThan(total * 0.8 + Math.max(...durations) + 1);
                expect(releases[0]).toBeLessThan(total);
                expect(complete).toHaveBeenCalledTimes(1);
                expect(visited.size).toBe(anim.frames.length);
                expect(unit.onCastProjectileRelease(() => releases.push(-1))).toBe(false);
            } finally {
                unit.destroyVisuals();
                world.destroy({ children: true });
                texture.destroy(true);
                clock.mockRestore();
            }
        });
