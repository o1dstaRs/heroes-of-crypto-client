import {
    MANTICORE_LAB_MATERIAL_SAMPLES,
    manticoreLabMaterialColor,
    syncManticoreLabWalkPalette,
} from "./ManticoreLabWalkPalette";
import { syncManticoreLabPoseCalibration } from "./ManticoreLabPoseCalibration";
import { manticoreLabAttackEye } from "./ManticoreLabAttackEyes";
import { MANTICORE_LAB_DEATH_SPEED, MANTICORE_LAB_DEATH_OPENING_MS } from "./ManticoreLabReactionTiming";
import { afterAll, beforeAll, expect, test } from "bun:test";
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
import { animationAtlases } from "../generated/animation_atlases";
import { RenderableUnit, CREATURE_SPRITE_ANIMATION_SETTINGS, COMMON_IDLE_BREATH_SETTINGS } from "./RenderableUnit";
import { shouldPreloadUnitAnimationAtlas } from "../pixi/creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import { creatureWalkAnimationEnabledForUnit } from "./RenderableUnit";
const staged = { meta: animationAtlases["Manticore Lab"].walk };
const settings = { ...CREATURE_SPRITE_ANIMATION_SETTINGS };
const oldBreath = COMMON_IDLE_BREATH_SETTINGS.enabled;
const grid = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const atlasTexture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 4096 }),
});
const texture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
});
beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = false;
    COMMON_IDLE_BREATH_SETTINGS.enabled = false;
});
afterAll(() => {
    Object.assign(CREATURE_SPRITE_ANIMATION_SETTINGS, settings);
    COMMON_IDLE_BREATH_SETTINGS.enabled = oldBreath;
});
function make(labPreview = true) {
    const effects = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Chaos", "Manticore", "manticore_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const unit = RenderableUnit.fromBase(base, (key) => (key.includes("_atlas") ? atlasTexture : texture));
    unit.setPosition(0, 1024);
    const root = new Container();
    unit.ensureVisual(root, grid);
    if (labPreview) unit.setCreatureAnimationLabPreviewEnabled(true);
    return {
        unit,
        root,
        internal: unit as unknown as {
            sprite: import("pixi.js").Sprite;
            oneShotAnim?: { frames: Texture[]; frameIndex: number };
            walkAnim?: {
                frames: Texture[];
                loopStartFrame: number;
                loopEndFrame: number;
                outroFrame: number;
                outroEndFrame: number;
                frameIndex: number;
                gaitStartDistanceCells: number;
                completedCycles: number;
            };
        },
    };
}
test("lab flight takes off once, cycles every 1.3 cells, and completes landing before next action", () => {
    const { unit, internal } = make();
    expect(unit.canFly()).toBe(true);
    unit.startBoardWalkAnimation(1, 8);
    expect(internal.walkAnim!.frames.length).toBe(18);
    expect(internal.walkAnim!.loopStartFrame).toBe(3);
    expect(internal.walkAnim!.loopEndFrame).toBe(13);
    for (let i = 0; i < 3; i++) {
        expect(internal.walkAnim!.frameIndex).toBe(i);
        unit.setBoardWalkDistanceCells(i * 0.1);
        unit.stepSpawnAnimation((staged.meta.frameDurationsMs![i] + 0.01) / (4000 * 1.35 * 1.15));
    }
    const start = internal.walkAnim!.gaitStartDistanceCells;
    for (let i = 0; i <= 22; i++) {
        unit.setBoardWalkDistanceCells(start + (i * 1.3) / 11);
        expect(internal.walkAnim!.frameIndex).toBe(3 + (i % 11));
        unit.stepSpawnAnimation(0.5);
        expect(internal.walkAnim!.frameIndex).toBe(3 + (i % 11));
    }
    expect(internal.walkAnim!.completedCycles).toBe(2);
    let complete = 0;
    expect(unit.finishBoardWalkAnimationAfterFullCycle(() => complete++)).toBe(true);
    for (let i = 14; i < 18; i++) {
        expect(internal.walkAnim!.frameIndex).toBe(i);
        expect(complete).toBe(0);
        unit.stepSpawnAnimation((staged.meta.frameDurationsMs![i] + 0.01) / (4000 * 1.35 * 1.15));
    }
    expect(complete).toBe(1);
    expect(internal.walkAnim).toBeUndefined();
});
test("short move still lands once and uses lab-only full resolution atlas", () => {
    expect(creatureWalkAnimationEnabledForUnit("Manticore", true)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Manticore", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("manticore_lab_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("manticore_lab_walk_atlas")).toBe(false);
    const { unit, internal } = make();
    unit.startBoardWalkAnimation(-1, 0.025);
    let complete = 0;
    unit.finishBoardWalkAnimationAfterFullCycle(() => complete++);
    for (let i = 14; i < 18; i++) {
        expect(internal.walkAnim!.frameIndex).toBe(i);
        unit.stepSpawnAnimation((staged.meta.frameDurationsMs![i] + 0.01) / (4000 * 1.35 * 1.15));
    }
    unit.stepSpawnAnimation(0.5);
    expect(complete).toBe(1);
});
test("original bookends preserve combat size and registration through both facings and lab exit", () => {
    const { unit, root, internal } = make();
    const initialHeight = internal.sprite.height;
    const initialWidth = internal.sprite.width;
    const idle = internal.sprite.texture;
    for (const direction of [1, -1]) {
        unit.startBoardWalkAnimation(direction, 8);
        expect(internal.sprite.height / initialHeight).toBeCloseTo(768 / 630);
        unit.ensureVisual(root, grid);
        expect(internal.sprite.height / initialHeight).toBeCloseTo(768 / 630);
        expect(internal.sprite.anchor.x).toBeCloseTo((83 + (384 * 630) / 768) / 768);
        expect(internal.sprite.anchor.y).toBeCloseTo((92 + (730 * 630) / 768) / 768);
        unit.stopBoardWalkAnimation();
        expect(internal.sprite.texture).toBe(idle);
        expect(internal.sprite.height).toBeCloseTo(initialHeight);
        expect(internal.sprite.width).toBeCloseTo(initialWidth);
        expect(internal.sprite.anchor.x).toBe(0.5);
    }
    unit.startBoardWalkAnimation(1, 1);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(internal.walkAnim).toBeUndefined();
    expect(internal.sprite.height).toBeCloseTo(initialHeight);
});

test("authored transitions retain the 35 percent speedup plus another 15 percent", () => {
    const { unit, internal } = make();
    unit.startBoardWalkAnimation(1, 3);
    unit.stepSpawnAnimation(99 / (4000 * 1.35 * 1.15));
    expect(internal.walkAnim!.frameIndex).toBe(0);
    unit.stepSpawnAnimation(1.01 / (4000 * 1.35 * 1.15));
    expect(internal.walkAnim!.frameIndex).toBe(1);
});

test("material correction matches source samples while canonical bookends stay unfiltered", () => {
    for (const [source, target] of MANTICORE_LAB_MATERIAL_SAMPLES) {
        const actual = manticoreLabMaterialColor(source);
        actual.forEach((value, i) => expect(Math.abs(value - target[i])).toBeLessThan(1));
    }
    const { unit, internal } = make();
    const idleFilter = internal.sprite.filters![0];
    unit.startBoardWalkAnimation(1, 3);
    const originalFilters = [...(internal.sprite.filters ?? [])];
    expect(internal.sprite.filters ?? []).toEqual(originalFilters);
    unit.stepSpawnAnimation(101 / (4000 * 1.35 * 1.15));
    expect(internal.sprite.filters!.length).toBe(originalFilters.length + 3);
    syncManticoreLabWalkPalette(internal.sprite, 17);
    syncManticoreLabPoseCalibration(internal.sprite, 17, -1);
    expect(internal.sprite.filters ?? []).toEqual(originalFilters);
    unit.stopBoardWalkAnimation();
    expect(internal.sprite.filters!.length).toBe(1);
    expect(internal.sprite.filters![0]).toBe(idleFilter);
});

test("limb correction is local to transitions, isolated per unit, and removed for flight and idle", () => {
    const first = make();
    const second = make();
    const originalScale = [first.internal.sprite.scale.x, first.internal.sprite.scale.y];
    for (const frame of [1, 2, 14, 15, 16]) {
        syncManticoreLabWalkPalette(first.internal.sprite, frame);
        syncManticoreLabWalkPalette(second.internal.sprite, frame);
        expect(first.internal.sprite.filters!.length).toBe(3);
        expect(first.internal.sprite.filters![1]).not.toBe(second.internal.sprite.filters![1]);
        expect([first.internal.sprite.scale.x, first.internal.sprite.scale.y]).toEqual(originalScale);
    }
    for (const frame of [3, 8, 13]) {
        syncManticoreLabWalkPalette(first.internal.sprite, frame);
        expect(first.internal.sprite.filters!.length).toBe(2);
    }
    for (const frame of [0, 17, -1]) {
        syncManticoreLabWalkPalette(first.internal.sprite, frame);
        expect(first.internal.sprite.filters!.length).toBe(1);
    }
    expect(second.internal.sprite.filters!.length).toBe(3);
});

test("redrawn hit advances actual sprite poses without deformation and returns to idle exactly once", () => {
    for (const direction of [1, -1]) {
        const { unit, internal, root } = make();
        const idle = internal.sprite.texture;
        const height = internal.sprite.height;
        const width = internal.sprite.width;
        expect(unit.getAnimationTextureKey("hit")).toBe("manticore_lab_hit_atlas");
        expect(shouldPreloadUnitAnimationAtlas("manticore_lab_hit_atlas", false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey("manticore_lab_hit_atlas")).toBe(false);
        unit.startBoardWalkAnimation(direction, 3);
        unit.stepSpawnAnimation(0.02);
        let completed = 0;
        expect(unit.playOneShotAnimation("hit", () => completed++, true)).toBe(true);
        expect(internal.walkAnim).toBeUndefined();
        expect(internal.sprite.height).toBeCloseTo(height);
        expect(internal.sprite.anchor.x).toBe(0.5);
        expect(internal.oneShotAnim!.frames).toHaveLength(9);
        const durations = animationAtlases["Manticore Lab"].hit.frameDurationsMs!;
        for (let i = 0; i < durations.length; i++) {
            expect(internal.oneShotAnim!.frameIndex).toBe(i);
            expect(internal.sprite.texture).toBe(internal.oneShotAnim!.frames[i]);
            // Every phase is drawn artwork: no idle, recoil, or geometry filter is installed.
            expect(internal.sprite.filters ?? []).toHaveLength(0);
            unit.ensureVisual(root, grid);
            expect(internal.sprite.height).toBeCloseTo(height);
            expect(internal.sprite.width).toBeCloseTo(width);
            unit.stepSpawnAnimation((durations[i] + 0.001) / 4000);
        }
        expect(completed).toBe(1);
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        expect(internal.sprite.texture).toBe(idle);
        expect(internal.sprite.height).toBeCloseTo(height);
        unit.stepSpawnAnimation(1);
        expect(completed).toBe(1);
        unit.playOneShotAnimation("hit", undefined, true);
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        expect(internal.sprite.texture).toBe(idle);
    }
});

test("death holds its last pose, fires completion once, and clears on idle or lab exit", () => {
    const { unit, internal, root } = make();
    expect(unit.getAnimationTextureKey("death")).toBe("manticore_lab_death_atlas");
    expect(shouldPreloadUnitAnimationAtlas("manticore_lab_death_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("manticore_lab_death_atlas")).toBe(false);
    const idle = internal.sprite.texture,
        height = internal.sprite.height;
    let completed = 0;
    unit.startBoardWalkAnimation(-1, 3);
    expect(unit.playOneShotAnimation("death", () => completed++, true)).toBe(true);
    expect(internal.sprite.height).toBeCloseTo(height);
    unit.stepSpawnAnimation(170 / 4000);
    expect(internal.sprite.filters ?? []).toHaveLength(1);
    expect(internal.sprite.filters![0].resources.pose).toBeDefined();
    unit.stepSpawnAnimation(1000 / 4000);
    const corpse = internal.sprite.texture;
    expect(completed).toBe(1);
    expect(unit.isPlayingOneShotAnimation("death")).toBe(true);
    unit.stepSpawnAnimation(2);
    unit.ensureVisual(root, grid);
    expect(completed).toBe(1);
    expect(internal.sprite.texture).toBe(corpse);
    expect(internal.sprite.height).toBeCloseTo(height);
    unit.returnToIdleAnimation();
    expect(internal.sprite.texture).toBe(idle);
    expect(internal.sprite.filters!).toHaveLength(1);
    unit.playOneShotAnimation("death", undefined, true);
    unit.stepSpawnAnimation(2);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.isPlayingOneShotAnimation()).toBe(false);
    expect(internal.sprite.texture).toBe(idle);
    expect(internal.sprite.filters ?? []).toHaveLength(0);
    expect(unit.getAnimationTextureKey("death")).not.toBe("manticore_lab_death_atlas");
});

test("death opening bends the source figure without a damage flash or size change", () => {
    const { unit, internal } = make();
    const initialScale = internal.sprite.scale.clone();
    unit.playOneShotAnimation("death", undefined, true);
    unit.stepSpawnAnimation(MANTICORE_LAB_DEATH_OPENING_MS / 2 / 4000);
    const uniforms = internal.sprite.filters![0].resources.idle.uniforms;
    expect(uniforms.uReaction[2]).toBe(0);
    expect(uniforms.uReaction[3]).toBeCloseTo(0.5);
    expect(uniforms.uMotion[0]).toBeCloseTo(19);
    expect(internal.sprite.scale.x).toBe(initialScale.x);
    expect(internal.sprite.scale.y).toBe(initialScale.y);
    unit.stepSpawnAnimation(100 / 4000);
    const calibration = internal.sprite.filters![0].resources.pose.uniforms;
    expect(calibration.uRegistration[2]).toBeLessThan(1);
    expect(calibration.uBronze[0]).toBeLessThan(1);
    expect(calibration.uRed[0]).toBeLessThan(1);
    unit.returnToIdleAnimation();
    expect(internal.sprite.filters!).toHaveLength(1);
    expect(internal.sprite.filters![0].resources.pose).toBeUndefined();
});

test("death retains all three requested 15 percent increases including opening and final hold", () => {
    const { unit, internal } = make();
    const original = [160, 100, 90, 100, 115, 140, 170, 220];
    const durations = animationAtlases["Manticore Lab"].death.frameDurationsMs!;
    original.forEach((duration, i) => expect(durations[i]).toBeCloseTo(duration / MANTICORE_LAB_DEATH_SPEED));
    expect(durations[0]).toBeCloseTo(MANTICORE_LAB_DEATH_OPENING_MS);
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    expect(total).toBeCloseTo(1095 / (1.15 * 1.15 * 1.15));
    let completed = 0;
    unit.playOneShotAnimation("death", () => completed++, true);
    unit.stepSpawnAnimation((total - 1) / 4000);
    expect(completed).toBe(0);
    expect(internal.oneShotAnim!.frameIndex).toBe(7);
    unit.stepSpawnAnimation(2 / 4000);
    expect(completed).toBe(1);
    unit.stepSpawnAnimation(1);
    expect(completed).toBe(1);
});

test("three drawn claw attacks preserve source pixel scale through mirrored playback and return to idle", () => {
    const states = ["melee_attack", "melee_attack_up", "melee_attack_down"] as const;
    const textures = new Set<Texture>();
    for (const direction of [1, -1]) {
        const { unit, internal, root } = make();
        const idle = internal.sprite.texture;
        const idleScale = Math.abs(internal.sprite.scale.x);
        const idleHeight = internal.sprite.height;
        for (const state of states) {
            const key = `manticore_lab_${state}_atlas`;
            expect(unit.getAnimationTextureKey(state)).toBe(key);
            expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
            expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
            unit.startBoardWalkAnimation(direction, 3);
            unit.stepSpawnAnimation(0.02);
            let completed = 0;
            expect(unit.playOneShotAnimation(state, () => completed++, true)).toBe(true);
            expect(internal.walkAnim).toBeUndefined();
            expect(internal.oneShotAnim!.frames).toHaveLength(8);
            textures.add(internal.oneShotAnim!.frames[4]);
            const durations = animationAtlases["Manticore Lab"][state].frameDurationsMs!;
            for (let i = 0; i < 8; i++) {
                expect(internal.oneShotAnim!.frameIndex).toBe(i);
                expect(internal.sprite.filters ?? []).toHaveLength(1);
                const uniforms = internal.sprite.filters![0].resources.idle.uniforms;
                expect(Array.from(uniforms.uEye)).toEqual([...manticoreLabAttackEye(state, i)!, 896, 1]);
                expect(Array.from(uniforms.uMotion).slice(0, 3)).toEqual([0, 0, 0]);
                expect(Array.from(uniforms.uReaction)).toEqual([0, 0, 0, 1]);
                expect(Math.abs(internal.sprite.scale.x)).toBeCloseTo(idleScale);
                expect(internal.sprite.height).toBeCloseTo((idleHeight * 896) / 768);
                expect(internal.sprite.anchor.y).toBeCloseTo(794 / 896);
                unit.ensureVisual(root, grid);
                expect(Math.abs(internal.sprite.scale.x)).toBeCloseTo(idleScale);
                unit.stepSpawnAnimation((durations[i] + 0.001) / 4000);
            }
            expect(completed).toBe(1);
            expect(internal.sprite.texture).toBe(idle);
            expect(internal.sprite.height).toBeCloseTo(idleHeight);
            expect(Math.abs(internal.sprite.scale.x)).toBeCloseTo(idleScale);
        }
        unit.playOneShotAnimation("melee_attack_up", undefined, true);
        unit.playOneShotAnimation("hit", undefined, true);
        expect(internal.sprite.height).toBeCloseTo(idleHeight);
        unit.playOneShotAnimation("melee_attack_down", undefined, true);
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(internal.sprite.texture).toBe(idle);
        expect(internal.sprite.height).toBeCloseTo(idleHeight);
        expect(unit.getAnimationTextureKey("melee_attack_down")).not.toBe("manticore_lab_melee_attack_down_atlas");
    }
    expect(textures.size).toBe(3);
});

test("hit and attacks retain their speedups, with another thirteen percent for the forward attack", () => {
    const lab = animationAtlases["Manticore Lab"];
    expect(lab.hit.totalDurationSec).toBeCloseTo(0.62 / 1.1);
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down"] as const) {
        const original = [55, 95, 90, 65, 85, 110, 130, 110];
        const speed = 1.1 * (state === "melee_attack" ? 1.13 : 1);
        original.forEach((duration, i) => expect(lab[state].frameDurationsMs![i]).toBeCloseTo(duration / speed));
        expect(lab[state].totalDurationSec).toBeCloseTo(0.74 / speed);
    }
    expect(lab.death.totalDurationSec).toBeCloseTo(1.095 / 1.15 ** 3);
});

test("approved Manticore plays idle, flight, attacks and reactions in combat without preview overrides", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    try {
        const { unit, internal, root } = make(false);
        const idle = internal.sprite.texture;
        const idleHeight = internal.sprite.height;
        unit.setCreatureAnimationLabPreviewEnabled(false);
        unit.stepSelectionAnimation();
        expect(internal.sprite.filters).toHaveLength(1);
        expect(internal.sprite.filters![0].resources.idle.uniforms.uEye[2]).toBe(768);
        expect(creatureWalkAnimationEnabledForUnit("Manticore")).toBe(true);
        unit.startBoardWalkAnimation(1, 3);
        expect(internal.walkAnim!.frames).toHaveLength(18);
        unit.stopBoardWalkAnimation();
        expect(internal.sprite.height).toBeCloseTo(idleHeight);
        for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down", "hit", "death"] as const) {
            let completed = 0;
            expect(unit.getAnimationTextureKey(state)).toBe(`manticore_lab_${state}_atlas`);
            expect(unit.playOneShotAnimation(state, () => completed++)).toBe(true);
            const durations = animationAtlases["Manticore Lab"][state].frameDurationsMs!;
            for (const duration of durations) {
                unit.ensureVisual(root, grid);
                unit.stepOneShotAnimation(duration + 0.001);
            }
            expect(completed).toBe(1);
            if (state === "death") {
                expect(internal.oneShotAnim!.frameIndex).toBe(durations.length - 1);
                unit.returnToIdleAnimation();
            }
            expect(internal.sprite.texture).toBe(idle);
            expect(internal.sprite.height).toBeCloseTo(idleHeight);
        }
    } finally {
        CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = false;
    }
});
