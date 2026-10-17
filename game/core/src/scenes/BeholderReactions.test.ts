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
import { shouldPreloadUnitAnimationAtlas } from "../pixi/creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import { getSplitBundles } from "../pixi/PixiTextureLoader";
import { RenderableUnit } from "./RenderableUnit";
beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
});
test("new Beholder reactions preload independently of legacy attacks", () => {
    const bundles = getSplitBundles({ animationsEnabled: false });
    for (const state of [
        "reactions_hit",
        "reactions_death",
        "flight_walk",
        "combat_melee_attack",
        "combat_melee_attack_up",
        "combat_melee_attack_down",
    ]) {
        const key = "beholder_" + state + "_atlas";
        expect(bundles.animations[key]).toBeDefined();
        expect(bundles.excludedFullResolutionUnitAtlases[key]).toBeUndefined();
    }
    for (const state of [
        "reactions_hit",
        "reactions_death",
        "flight_walk",
        "combat_melee_attack",
        "combat_melee_attack_up",
        "combat_melee_attack_down",
    ])
        expect(isRedundantFullResolutionUnitAtlasKey("beholder_" + state + "_atlas")).toBe(false);
    for (const state of ["hit", "death"])
        expect(shouldPreloadUnitAnimationAtlas("beholder_reactions_" + state + "_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("beholder_attack_atlas_quarter", false)).toBe(false);
});
test.each([false, true])("Beholder reaction lifecycle and flight interruption, lab=%s", (lab) => {
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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Chaos", "Beholder", "beholder_512", 1),
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
    const initial = { width: view.sprite.width, height: view.sprite.height, anchor: view.sprite.anchor.y };
    const checkSize = () => {
        expect(view.sprite.width).toBeCloseTo(initial.width, 5);
        expect(view.sprite.height).toBeCloseTo(initial.height, 5);
        expect(view.sprite.anchor.y).toBeCloseTo(initial.anchor, 5);
    };
    unit.startBoardWalkAnimation(-1, 4);
    unit.setBoardWalkDistanceCells(0.45);
    let hits = 0;
    expect(unit.playOneShotAnimation("hit", () => hits++)).toBe(true);
    expect(view.walkAnim).toBeUndefined();
    checkSize();
    expect(requested).toContain("beholder_reactions_hit_atlas");
    const hit = view.oneShotAnim!;
    expect(hit.frames.length).toBe(6);
    expect(hit.authoredRealTime).toBe(true);
    expect(hit.frameDurationsMs).toEqual([50, 65, 90, 70, 85, 100].map((ms) => ms / 1.1 / 1.17));
    for (let i = 0; i < 6; i++) {
        expect(hit.frameIndex).toBe(i);
        expect(view.sprite.texture).toBe(hit.frames[i]);
        unit.stepOneShotAnimation(hit.frameDurationsMs[i] - 1);
        expect(hit.frameIndex).toBe(i);
        expect(hits).toBe(0);
        unit.stepOneShotAnimation(1);
    }
    expect(hits).toBe(1);
    expect(view.oneShotAnim).toBeUndefined();
    checkSize();
    expect(view.selectionAnimFrames).toContain(view.sprite.texture);
    unit.ensureVisual(root, grid);
    checkSize();
    unit.stepOneShotAnimation(10000);
    expect(hits).toBe(1);
    let deaths = 0;
    expect(unit.playOneShotAnimation("death", () => deaths++)).toBe(true);
    const death = view.oneShotAnim!;
    expect(death.frames.length).toBe(10);
    expect(death.holdLastFrame).toBe(true);
    expect(death.authoredRealTime).toBe(true);
    expect(death.frameDurationsMs).toEqual([70, 80, 90, 100, 100, 100, 100, 110, 150, 400].map((ms) => ms / 1.05));
    for (let i = 0; i < 10; i++) {
        expect(death.frameIndex).toBe(i);
        unit.stepOneShotAnimation(death.frameDurationsMs[i]);
    }
    expect(deaths).toBe(1);
    expect(death.finished).toBe(true);
    expect(view.sprite.texture).toBe(death.frames[9]);
    unit.ensureVisual(root, grid);
    unit.stepOneShotAnimation(10000);
    expect(deaths).toBe(1);
    expect(view.sprite.texture).toBe(death.frames[9]);
    checkSize();
    unit.returnToIdleAnimation();
    checkSize();
    expect(view.selectionAnimFrames).toContain(view.sprite.texture);
    expect(unit.playOneShotAnimation("hit", () => hits++)).toBe(true);
    unit.stepOneShotAnimation(10000);
    expect(hits).toBe(2);
    checkSize();
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down"]) {
        unit.startBoardWalkAnimation(-1, 4);
        let completed = 0;
        expect(unit.playOneShotAnimation(state, () => completed++)).toBe(true);
        expect(view.walkAnim).toBeUndefined();
        expect(requested).toContain("beholder_combat_" + state + "_atlas");
        const action = view.oneShotAnim!;
        expect(action.frames.length).toBe(7);
        expect(action.authoredRealTime).toBe(true);
        expect(action.frameDurationsMs).toEqual([40, 90, 55, 80, 75, 90, 70]);
        expect(view.sprite.height).toBeCloseTo(initial.height, 5);
        expect(view.sprite.width).toBeCloseTo(initial.width * 1.5, 5);
        unit.stepOneShotAnimation(499);
        expect(completed).toBe(0);
        unit.stepOneShotAnimation(1);
        expect(completed).toBe(1);
        expect(view.oneShotAnim).toBeUndefined();
        checkSize();
        expect(view.selectionAnimFrames).toContain(view.sprite.texture);
        unit.stepOneShotAnimation(10000);
        expect(completed).toBe(1);
    }
    for (const state of ["attack", "attack_up", "attack_down"]) {
        let released = 0,
            cancelled = 0;
        expect(
            unit.playBeholderRangedShot(
                state,
                () => released++,
                () => cancelled++,
            ),
        ).toBe(true);
        expect(requested).toContain("beholder_ranged_" + state + "_atlas");
        expect(view.oneShotAnim!.frameDurationsMs).toEqual([50, 180, 100, 130, 90]);
        unit.stepOneShotAnimation(229);
        expect(released).toBe(0);
        unit.stepOneShotAnimation(1);
        expect(released).toBe(1);
        const right = unit.getRangedProjectileOrigin({ x: 1000, y: 1024 }, grid);
        expect(Number.isFinite(right.x) && Number.isFinite(right.y)).toBe(true);
        unit.stepOneShotAnimation(320);
        expect(released).toBe(1);
        expect(cancelled).toBe(0);
        checkSize();
        unit.playBeholderRangedShot(
            state,
            () => released++,
            () => cancelled++,
        );
        unit.stepOneShotAnimation(100);
        unit.returnToIdleAnimation();
        unit.stepOneShotAnimation(1000);
        expect(released).toBe(1);
        expect(cancelled).toBe(1);
    }
    root.destroy({ children: true });
});
