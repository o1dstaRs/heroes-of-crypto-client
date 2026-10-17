import { beforeAll, expect, test } from "bun:test";
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
import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";

import { RenderableUnit } from "./RenderableUnit";
beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
});
test.each([false, true])("Nomad retains source pixel scale at every transition, lab=%s", (lab) => {
    const grid = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const effects = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Might", "Nomad", "nomad_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const atlas = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 8192, height: 8192 }),
    });
    const requested: string[] = [];
    const unit = RenderableUnit.fromBase(base, (name) => {
        requested.push(name);
        return atlas;
    });
    const root = new Container();
    type Action = {
        frames: Texture[];
        frameIndex: number;
        frameDurationsMs: number[];
        authoredRealTime: boolean;
        holdLastFrame: boolean;
        finished?: boolean;
    };
    const view = unit as unknown as {
        sprite: Sprite;
        walkAnim?: unknown;
        oneShotAnim?: Action;
        selectionAnimFrames: Texture[];
    };
    unit.setPosition(0, 1024);
    unit.setCreatureAnimationLabPreviewEnabled(lab);
    unit.ensureVisual(root, grid);

    const initial = { x: Math.abs(view.sprite.scale.x), y: view.sprite.scale.y, floorY: view.sprite.y };
    const checkScale = () => {
        expect(Math.abs(view.sprite.scale.x)).toBeCloseTo(initial.x, 8);
        expect(view.sprite.scale.y).toBeCloseTo(initial.y, 8);
        const padding = view.sprite.texture.height === 1024 ? 128 : 0;
        const floorY =
            view.sprite.y + (742 + padding - view.sprite.anchor.y * view.sprite.texture.height) * view.sprite.scale.y;
        expect(floorY).toBeCloseTo(initial.floorY, 8);
    };
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down", "hit", "death"]) {
        expect(unit.playOneShotAnimation(state)).toBe(true);
        checkScale();
        const action = view.oneShotAnim!;
        for (const duration of action.frameDurationsMs) {
            unit.ensureVisual(root, grid);
            checkScale();
            unit.stepOneShotAnimation(duration);
            checkScale();
        }
        unit.returnToIdleAnimation();
        checkScale();
        unit.ensureVisual(root, grid);
        checkScale();
    }
    for (const state of ["melee_attack", "death"]) {
        unit.playOneShotAnimation(state);
        unit.ensureVisual(root, grid);
        unit.startBoardWalkAnimation(1, 4);
        expect(view.oneShotAnim).toBeUndefined();
        expect(view.walkAnim).toBeDefined();
        expect(view.sprite.anchor.y).toBeCloseTo(742 / 768, 8);
        checkScale();
        unit.ensureVisual(root, grid);
        checkScale();
        unit.setBoardWalkDistanceCells(0.4);
        checkScale();
        unit.playOneShotAnimation("hit");
        checkScale();
        unit.ensureVisual(root, grid);
        checkScale();
        unit.returnToIdleAnimation();
        checkScale();
    }
    root.destroy({ children: true });
});
