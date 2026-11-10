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
import baseline from "./fixtures/mainCombatTimings.json";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
const grid = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

// INTENDED: this independent snapshot was measured from the published main commit recorded
// in the fixture. Do not regenerate it from the PR implementation to make a timing drift pass.
// Main's absent clips have no duration to copy; extra authored PR clips retain their own cadence.
test.each(baseline.units)("$name keeps main's selected attacks and final hit duration", (row) => {
    const effects = new EffectFactory();
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 16384, height: 16384 }),
    });
    const unit = RenderableUnit.fromBase(
        Unit.createUnit(
            HoCConfig.getCreatureConfig(TeamVals.LEFT, row.faction, row.name, "timing_512", 10),
            grid,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        ),
        () => texture,
    );
    const world = new Container();
    const check = (state: string, expected: number) => {
        unit.returnToIdleAnimation();
        expect(unit.playOneShotAnimation(state, undefined, true), row.name + ":" + state).toBe(true);
        const anim = (
            unit as unknown as {
                oneShotAnim?: { frames: Texture[]; frameDurationsMs?: number[]; durationPerFrame: number };
            }
        ).oneShotAnim!;
        const total =
            anim.frameDurationsMs?.length === anim.frames.length
                ? anim.frameDurationsMs.reduce((sum, ms) => sum + ms, 0)
                : anim.frames.length * anim.durationPerFrame;
        expect(total, row.name + ":" + state).toBeCloseTo(expected, 5);
    };
    try {
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, grid);
        for (const mode of ["melee", "range"] as const)
            for (const [index, direction] of [-1, 0, 1].entries()) {
                const expected = (mode === "melee" ? row.meleeMs : row.rangeMs)[index];
                if (expected === null) continue;
                const state = unit.getAttackAnimationStateForTarget({ x: 400, y: 1024 + direction * 400 }, mode);
                check(state, expected);
            }
        if (row.hitMs !== null) check("hit", row.hitMs);
    } finally {
        unit.destroyVisuals();
        world.destroy({ children: true });
        texture.destroy(true);
    }
});
