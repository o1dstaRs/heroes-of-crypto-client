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
import { BufferImageSource, Container, Texture } from "pixi.js";
import { shouldPreloadUnitAnimationAtlas } from "../pixi/creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import { creatureOneShotAnimationEnabledForUnit, RenderableUnit } from "./RenderableUnit";
import { wyvernLabMaterialColor, wyvernLabMaterialSamples, wyvernLabPoseForFrame } from "./WyvernLabWalkPalette";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
});

test("all redrawn Wyvern poses use the base figure's wing, scale, and acid material anchors", () => {
    expect(wyvernLabPoseForFrame(0)).toBeUndefined();
    expect(wyvernLabPoseForFrame(17)).toBeUndefined();
    for (let frame = 1; frame < 17; frame++) {
        const pose = wyvernLabPoseForFrame(frame);
        expect(pose).toBeDefined();
        for (const [source, target] of wyvernLabMaterialSamples(pose!)) {
            const corrected = wyvernLabMaterialColor(source, pose!);
            corrected.forEach((channel, i) => expect(Math.abs(channel - target[i])).toBeLessThan(4));
        }
    }
});

test("Wyvern's takeoff uses the Manticore's wall-clock speed", () => {
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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Might", "Wyvern", "wyvern_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const atlas = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 4096 }),
    });
    const idle = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    const unit = RenderableUnit.fromBase(base, (key) => (key.includes("_atlas") ? atlas : idle));
    const root = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(root, grid);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.startBoardWalkAnimation(1, 8);
    const view = unit as unknown as { walkAnim?: { frameIndex: number } };
    unit.stepSpawnAnimation(99 / (4000 * 1.35 * 1.15));
    expect(view.walkAnim?.frameIndex).toBe(0);
    unit.stepSpawnAnimation(1.01 / (4000 * 1.35 * 1.15));
    expect(view.walkAnim?.frameIndex).toBe(1);
    root.destroy({ children: true });
});

test("Wyvern reactions recover after hit, hold death, and reset without scale or filter leaks", () => {
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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Might", "Wyvern", "wyvern_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const atlas = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 4096 }),
    });
    const idle = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    const unit = RenderableUnit.fromBase(base, (key) => (key.includes("_atlas") ? atlas : idle));
    const root = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(root, grid);
    unit.setCreatureAnimationLabPreviewEnabled(false);

    const view = unit as unknown as {
        sprite: import("pixi.js").Sprite;
        oneShotAnim?: { finished?: boolean; authoredRealTime?: boolean };
    };
    const scale = view.sprite.scale.clone();
    let hits = 0;
    expect(unit.playOneShotAnimation("hit", () => hits++)).toBe(true);
    expect(view.oneShotAnim?.authoredRealTime).toBe(true);
    unit.stepOneShotAnimation(150);
    expect(view.sprite.texture.width).toBe(1024);
    expect(view.sprite.filters ?? []).toHaveLength(0);
    expect(hits).toBe(0);
    expect(view.sprite.scale.x).toBeCloseTo(scale.x, 8);
    expect(view.sprite.scale.y).toBeCloseTo(scale.y, 8);
    unit.stepOneShotAnimation(310);
    expect(hits).toBe(1);
    expect(view.oneShotAnim).toBeUndefined();
    expect(view.sprite.filters?.length).toBe(1);
    let deaths = 0;
    expect(unit.playOneShotAnimation("death", () => deaths++)).toBe(true);
    for (let tick = 0; tick < 20; tick++) {
        unit.stepOneShotAnimation(50);
        unit.ensureVisual(root, grid);
        expect(view.sprite.scale.x).toBeCloseTo(scale.x, 8);
        expect(view.sprite.scale.y).toBeCloseTo(scale.y, 8);
        expect(view.sprite.texture.width).toBe(1024);
    }
    unit.stepOneShotAnimation(1280 / 1.18 - 1000 - 0.01);
    expect(deaths).toBe(0);
    unit.stepOneShotAnimation(0.02);
    expect(deaths).toBe(1);
    expect(view.oneShotAnim?.finished).toBe(true);
    const held = view.sprite.texture;
    unit.stepOneShotAnimation(4000);
    expect(deaths).toBe(1);
    expect(view.sprite.texture).toBe(held);
    expect(view.sprite.scale.x).toBeCloseTo(scale.x, 8);
    expect(view.sprite.scale.y).toBeCloseTo(scale.y, 8);
    unit.returnToIdleAnimation();
    expect(view.sprite.filters![0].resources.reaction).toBeUndefined();
    unit.ensureVisual(root, grid);
    expect(view.oneShotAnim).toBeUndefined();
    expect(view.sprite.filters?.length).toBe(1);
    expect(view.sprite.scale.x).toBeCloseTo(scale.x, 8);
    expect(view.sprite.scale.y).toBeCloseTo(scale.y, 8);
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down"]) {
        const key = `wyvern_lab_${state}_atlas`;
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(unit.getAnimationTextureKey(state)).toBe(key);
        let completed = 0;
        expect(unit.playOneShotAnimation(state, () => completed++)).toBe(true);
        for (let tick = 0; tick < 11; tick++) {
            unit.stepOneShotAnimation(50);
            unit.ensureVisual(root, grid);
            expect(view.sprite.texture.width).toBe(1024);
            expect(view.sprite.scale.x).toBeCloseTo(scale.x, 8);
            expect(view.sprite.scale.y).toBeCloseTo(scale.y, 8);
        }
        expect(completed).toBe(0);
        unit.stepOneShotAnimation(51);
        expect(completed).toBe(1);
        expect(view.oneShotAnim).toBeUndefined();
        expect(view.sprite.texture.width).toBe(768);
        expect(view.sprite.scale.x).toBeCloseTo(scale.x, 8);
    }
    root.destroy({ children: true });
});

test("Wyvern attack material samples match idle and original bookends bypass grading", async () => {
    const { wyvernLabAttackPose } = await import("./WyvernLabWalkPalette");
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down"]) {
        for (const frame of [0, 1, 6, 7]) expect(wyvernLabAttackPose(state, frame)).toBeUndefined();
        for (const frame of [2, 3, 4, 5]) {
            const pose = wyvernLabAttackPose(state, frame)!;
            expect(pose).toBeDefined();
            for (const [source, target] of wyvernLabMaterialSamples(pose)) {
                const result = wyvernLabMaterialColor(source, pose);
                result.forEach((channel, i) => expect(Math.abs(channel - target[i])).toBeLessThan(0.01));
            }
        }
    }
    expect(wyvernLabAttackPose("hit", 3)).toBeUndefined();
    expect(wyvernLabAttackPose("death", 3)).toBeUndefined();
});

test("Wyvern approved combat states are enabled without forcePreview", () => {
    for (const state of ["hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"])
        expect(creatureOneShotAnimationEnabledForUnit("Wyvern", state)).toBe(true);
    expect(creatureOneShotAnimationEnabledForUnit("Wyvern", "attack")).toBe(false);
});
