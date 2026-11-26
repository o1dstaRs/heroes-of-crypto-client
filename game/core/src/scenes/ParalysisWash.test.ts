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
import { beforeAll, expect, test } from "bun:test";
import { BufferImageSource, Container, type Sprite, Texture } from "pixi.js";

import { getParalysisWashFilter, paralysisWashMatrix, PARALYSIS_WASH_STRENGTH } from "./ParalysisWashFilter";
import { RenderableUnit } from "./RenderableUnit";

const grid = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const texture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 512, height: 512 }),
});

beforeAll(() => {
    if (typeof document === "undefined") {
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
            querySelectorAll: () => [],
        };
    }
    document.cookie ??= "";
});

function squire() {
    const effects = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Squire", "squire_512", 20),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const unit = RenderableUnit.fromBase(base, () => texture);
    const root = new Container();
    unit.setBattlefieldVisualProjection(true);
    unit.setPosition(-832, 64 + 7 * grid.getCellSize());
    unit.ensureVisual(root, grid);
    return { unit, root, sprite: () => (unit as unknown as { sprite: Sprite }).sprite, effects };
}

test("the wash keeps (1 - k) of every colour, adds k of white and leaves alpha alone", () => {
    const k = PARALYSIS_WASH_STRENGTH;
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(0.5);
    expect(paralysisWashMatrix()).toEqual([1 - k, 0, 0, 0, k, 0, 1 - k, 0, 0, k, 0, 0, 1 - k, 0, k, 0, 0, 0, 1, 0]);
    // Black lifts to k grey, white stays white, alpha row is identity.
    const m = paralysisWashMatrix();
    expect(m[0] * 0 + m[4]).toBeCloseTo(k);
    expect(m[0] * 1 + m[4]).toBeCloseTo(1);
    expect(m.slice(15)).toEqual([0, 0, 0, 1, 0]);
});

test("a paralysed creature is washed toward white, and the wash leaves with the effect", () => {
    const { unit, root, sprite, effects } = squire();
    try {
        const wash = getParalysisWashFilter();
        expect(wash).toBeDefined();
        const hasWash = () => (sprite().filters ?? []).includes(wash!);
        expect(unit.isParalysisWashShown()).toBe(false);
        expect(hasWash()).toBe(false);

        unit.applyEffect(effects.makeEffect("Paralysis")!);
        unit.ensureVisual(root, grid);
        expect(unit.isParalysisWashShown()).toBe(true);
        expect(hasWash()).toBe(true);
        // Re-syncing a still-paralysed unit keeps exactly one wash.
        unit.ensureVisual(root, grid);
        expect((sprite().filters ?? []).filter((f) => f === wash)).toHaveLength(1);

        unit.deleteEffect("Paralysis");
        unit.ensureVisual(root, grid);
        expect(unit.isParalysisWashShown()).toBe(false);
        expect(hasWash()).toBe(false);
    } finally {
        root.destroy({ children: true });
    }
});
