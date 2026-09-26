import { expect, test } from "bun:test";
import { BufferImageSource, Container, Texture } from "pixi.js";
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

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

test("a counter requested before damage processing shows all Orc hit frames before throwing", async () => {
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 8192, height: 8192 }),
    });
    const effects = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Chaos", "Orc", "orc_512", 100),
        gs,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const unit = RenderableUnit.fromBase(base, () => texture);
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gs);
    const frames = new Set<number>();
    let elapsed = 0;
    let launched = false;
    const internals = unit as unknown as { oneShotAnim?: { stateName: string; frameIndex: number } };
    const playThrow = unit.playOrcRangedThrow.bind(unit);
    unit.playOrcRangedThrow = (state, release, cancel) => {
        expect(unit.isPlayingOneShotAnimation("hit")).toBe(false);
        expect([...frames]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(elapsed).toBeGreaterThanOrEqual(450);
        const started = playThrow(state, release, cancel);
        unit.stepOneShotAnimation(285);
        return started;
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => gs },
        isSceneDestroyed: () => false,
        delayReplay: async (ms: number) => {
            if (internals.oneShotAnim?.stateName === "hit") frames.add(internals.oneShotAnim.frameIndex);
            elapsed += ms;
            unit.stepOneShotAnimation(ms);
        },
        scheduleSceneTimeout: () => 1,
        clearSceneTimeout: () => {},
        rangedProjectiles: {
            prepare: async () => {},
            fire: async () => {
                launched = true;
            },
        },
    });
    // Live combat requests the counter first, then applies its incoming hit in the same task.
    const counter = scene.fireUnitProjectile(unit, {
        from: { x: 0, y: 0 },
        to: { x: 1000, y: 1024 },
        big: false,
        orcAxe: true,
    });
    unit.applyHitReaction(20, 0);
    await counter;
    expect(launched).toBe(true);
    expect(unit.isPlayingOneShotAnimation()).toBe(false);
    world.destroy({ children: true });
    texture.destroy(true);
});
