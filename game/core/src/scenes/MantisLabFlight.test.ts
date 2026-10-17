import { afterEach, beforeAll, expect, test } from "bun:test";
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
import { shouldPreloadUnitAnimationAtlas } from "../pixi/creatureAnimationSettings";
import {
    isIdleAtlasKey,
    isProductionOmittedAssetKey,
    isRedundantFullResolutionUnitAtlasKey,
} from "../pixi/imageAssetTiers";
import { creatureWalkAnimationEnabledForUnit, RenderableUnit } from "./RenderableUnit";
import {
    mantisLabFlightSettings,
    MANTIS_LAB_FLIGHT_DEFAULTS,
    setMantisLabFlightSetting,
    mantisLabWalkAnchorY,
} from "./MantisLabFlight";
import { VALKYRIE_LAB_TRANSITION_SPEED } from "./ValkyrieLabWalk";
import { MantisEyeGlowFilter } from "./MantisLabIdleVisuals";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
});
afterEach(() => Object.assign(mantisLabFlightSettings, MANTIS_LAB_FLIGHT_DEFAULTS));

function makeUnit() {
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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Nature", "Mantis", "mantis_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const atlas = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 2048, height: 2048 }),
    });
    const idle = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    const labIdle = new Texture({
        source: new BufferImageSource({
            resource: new Uint8Array(4),
            width: animationAtlases["Mantis Lab"].idle.atlasWidth,
            height: animationAtlases["Mantis Lab"].idle.atlasHeight,
        }),
    });
    const reactions = Object.fromEntries(
        (["hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"] as const).map((state) => {
            const meta = animationAtlases["Mantis Lab"][state];
            return [
                `mantis_lab_${state}_atlas`,
                new Texture({
                    source: new BufferImageSource({
                        resource: new Uint8Array(4),
                        width: meta.atlasWidth,
                        height: meta.atlasHeight,
                    }),
                }),
            ];
        }),
    );
    const requested: string[] = [];
    const unit = RenderableUnit.fromBase(base, (key) => {
        requested.push(key);
        return (
            reactions[key] ??
            (key === "mantis_lab_walk_atlas" ? atlas : key === "mantis_lab_idle_atlas" ? labIdle : idle)
        );
    });
    const root = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(root, grid);
    const view = unit as unknown as {
        sprite: import("pixi.js").Sprite;
        walkAnim?: {
            frameIndex: number;
            loopStartFrame: number;
            loopEndFrame: number;
            gaitStartDistanceCells: number;
            completedCycles: number;
        };
    };
    return { unit, root, grid, view, requested };
}

test("Mantis authored flight plays in combat and the lab, holds its gait while stationary, and lands once", () => {
    expect(creatureWalkAnimationEnabledForUnit("Mantis", false)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Mantis", true)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("mantis_lab_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("mantis_lab_walk_atlas")).toBe(false);
    const { unit, root, grid, view, requested } = makeUnit();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(root, grid);
    const initialScaleY = view.sprite.scale.y;
    const initialAnchorY = view.sprite.anchor.y;
    unit.startBoardWalkAnimation(1, 8);
    const flightCanvasHeight = view.sprite.height;
    unit.ensureVisual(root, grid);
    expect(view.sprite.height).toBeCloseTo(flightCanvasHeight);
    const meta = animationAtlases["Mantis Lab"].walk;
    expect(meta.frameWidth).toBe(512);
    expect(view.sprite.anchor.y).toBeCloseTo(mantisLabWalkAnchorY(initialAnchorY));
    expect(MANTIS_LAB_FLIGHT_DEFAULTS.takeoffSpeed).toBe(VALKYRIE_LAB_TRANSITION_SPEED * 1.25);
    expect(MANTIS_LAB_FLIGHT_DEFAULTS.landingSpeed).toBe(VALKYRIE_LAB_TRANSITION_SPEED * 1.25);
    expect(requested).toContain("mantis_lab_walk_atlas");
    expect(view.walkAnim?.loopStartFrame).toBe(4);
    expect(view.walkAnim?.loopEndFrame).toBe(11);
    for (let i = 0; i < 4; i++) {
        expect(view.walkAnim?.frameIndex).toBe(i);
        unit.stepSpawnAnimation((meta.frameDurationsMs![i] + 0.01) / (4000 * MANTIS_LAB_FLIGHT_DEFAULTS.takeoffSpeed));
    }
    const start = view.walkAnim!.gaitStartDistanceCells;
    for (let i = 0; i <= 16; i++) {
        unit.setBoardWalkDistanceCells(start + (i * 1.3) / 8);
        expect(view.walkAnim?.frameIndex).toBe(4 + (i % 8));
        unit.stepSpawnAnimation(1 / 240);
        expect(view.walkAnim?.frameIndex).toBe(4 + (i % 8));
        unit.ensureVisual(root, grid);
        expect(view.sprite.height).toBeCloseTo(flightCanvasHeight);
    }
    expect(view.walkAnim?.completedCycles).toBe(2);
    // A diagonal followed by a corner contributes actual path length without resetting the cycle.
    unit.setBoardWalkDistanceCells(start + 2.6 + Math.SQRT2);
    unit.setBoardWalkDistanceCells(start + 2.6 + Math.SQRT2 + 0.4);
    let completed = 0;
    expect(unit.finishBoardWalkAnimationAfterFullCycle(() => completed++)).toBe(true);
    for (let i = 12; i < 16; i++) {
        expect(view.walkAnim?.frameIndex).toBe(i);
        expect(completed).toBe(0);
        unit.stepSpawnAnimation((meta.frameDurationsMs![i] + 0.01) / (4000 * MANTIS_LAB_FLIGHT_DEFAULTS.landingSpeed));
    }
    expect(completed).toBe(1);
    expect(view.walkAnim).toBeUndefined();
    expect(view.sprite.scale.y).toBeCloseTo(initialScaleY);
    unit.ensureVisual(root, grid);
    expect(view.sprite.scale.y).toBeCloseTo(initialScaleY);
    root.destroy({ children: true });
});

test("Mantis lab idle keeps its authored wing episode and registration through every frame", () => {
    const { unit, root, grid, requested } = makeUnit();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    const view = unit as unknown as {
        sprite: import("pixi.js").Sprite;
        selectionAnimationStartedAtMs: number;
        selectionAnimFrameIndex: number;
    };
    const meta = animationAtlases["Mantis Lab"].idle;
    expect(unit.getAnimationTextureKey("idle")).toBe("mantis_lab_idle_atlas");
    expect(requested).toContain("mantis_lab_idle_atlas");
    expect(meta.frameCount).toBe(31);
    expect(meta.frameDurationsMs!.reduce((a, b) => a + b, 0)).toBeCloseTo(3805);
    expect(meta.totalDurationSec).toBeCloseTo(3.805);
    expect(7.61 / meta.totalDurationSec).toBeCloseTo(2);
    unit.ensureVisual(root, grid, view.selectionAnimationStartedAtMs);
    const scale = { x: view.sprite.scale.x, y: view.sprite.scale.y };
    const position = { x: view.sprite.x, y: view.sprite.y };
    let elapsedMs = 0;
    for (let frame = 0; frame < meta.frameCount; frame++) {
        unit.ensureVisual(root, grid, view.selectionAnimationStartedAtMs + elapsedMs + 1);
        expect(view.selectionAnimFrameIndex).toBe(frame);
        expect(view.sprite.scale.x).toBeCloseTo(scale.x);
        expect(view.sprite.scale.y).toBeCloseTo(scale.y);
        expect(view.sprite.x).toBeCloseTo(position.x);
        expect(view.sprite.y).toBeCloseTo(position.y);
        expect(view.sprite.anchor.y).toBeCloseTo(730 / 768);
        elapsedMs += meta.frameDurationsMs![frame];
    }
    unit.ensureVisual(root, grid, view.selectionAnimationStartedAtMs + elapsedMs + 1);
    expect(view.selectionAnimFrameIndex).toBe(0);
    unit.stepSpawnAnimation(0);
    expect(view.sprite.filters?.filter((filter) => filter instanceof MantisEyeGlowFilter)).toHaveLength(1);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.stepSpawnAnimation(0);
    expect(view.sprite.filters?.some((filter) => filter instanceof MantisEyeGlowFilter) ?? false).toBe(true);
    unit.ensureVisual(root, grid);
    expect(unit.getAnimationTextureKey("idle")).toBe("mantis_lab_idle_atlas");
    expect(view.sprite.texture.height).toBe(512);
    expect(view.sprite.anchor.y).toBeCloseTo(730 / 768);
    root.destroy({ children: true });
});

test("Mantis transition sliders affect authored timing and short routes still land", () => {
    const { unit, root, view } = makeUnit();
    setMantisLabFlightSetting("takeoffSpeed", 2);
    setMantisLabFlightSetting("landingSpeed", 0.5);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.startBoardWalkAnimation(1, 0.25);
    unit.stepSpawnAnimation(140 / 8000);
    expect(view.walkAnim?.frameIndex).toBe(1);
    unit.setBoardWalkDistanceCells(0.25);
    let completed = 0;
    unit.finishBoardWalkAnimationAfterFullCycle(() => completed++);
    expect(view.walkAnim?.frameIndex).toBe(12);
    unit.stepSpawnAnimation(100 / 4000);
    expect(view.walkAnim?.frameIndex).toBe(12);
    unit.stepSpawnAnimation(101 / 4000);
    expect(view.walkAnim?.frameIndex).toBe(13);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(view.walkAnim).toBeDefined();
    for (let tick = 0; tick < 30; tick++) unit.stepSpawnAnimation(0.1);
    expect(view.walkAnim).toBeUndefined();
    expect(completed).toBe(1);
    root.destroy({ children: true });
});

test("Mantis hit interrupts flight, preserves pixel scale and returns to idle on the authored tick", () => {
    const { unit, root, grid, view, requested } = makeUnit();
    expect(unit.getAnimationTextureKey("hit")).toBe("mantis_lab_hit_atlas");
    expect(unit.getAnimationTextureKey("death")).toBe("mantis_lab_death_atlas");
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.setBoardFacing(-1);
    unit.ensureVisual(root, grid);
    const idleScale = { x: view.sprite.scale.x, y: view.sprite.scale.y };
    const idleY = view.sprite.y;
    const eyeY = idleY + view.sprite.scale.y * (141.8 - view.sprite.anchor.y * 512);
    unit.startBoardWalkAnimation(-1, 2);
    let completed = 0;
    expect(unit.playOneShotAnimation("hit", () => completed++)).toBe(true);
    expect(view.walkAnim).toBeUndefined();
    expect(unit.getAnimationTextureKey("hit")).toBe("mantis_lab_hit_atlas");
    expect(requested).toContain("mantis_lab_hit_atlas");
    for (const state of ["hit", "death"]) {
        const key = `mantis_lab_${state}_atlas`;
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(isProductionOmittedAssetKey(key)).toBe(true);
        expect(isIdleAtlasKey(key)).toBe(false);
    }
    const action = unit as unknown as {
        oneShotAnim?: { frameIndex: number; authoredRealTime: boolean; frameDurationsMs: readonly number[] };
    };
    expect(action.oneShotAnim?.authoredRealTime).toBe(true);
    expect(action.oneShotAnim?.frameDurationsMs).toEqual([35, 65, 85, 95, 90, 45].map((ms) => ms / 1.17));
    expect(view.sprite.filters?.some((f) => f instanceof MantisEyeGlowFilter) ?? false).toBe(false);
    const meta = animationAtlases["Mantis Lab"].hit;
    const padding = (meta.frameHeight - 512) / 2;
    for (let frame = 0; frame < meta.frameCount; frame++) {
        expect(action.oneShotAnim?.frameIndex).toBe(frame);
        unit.ensureVisual(root, grid);
        expect(view.sprite.scale.x).toBeCloseTo(idleScale.x);
        expect(view.sprite.scale.y).toBeCloseTo(idleScale.y);
        expect(view.sprite.y).toBeCloseTo(idleY);
        expect(view.sprite.anchor.y).toBeCloseTo(((730 / 768) * 512 + padding) / meta.frameHeight);
        if (frame === 0)
            expect(
                view.sprite.y + view.sprite.scale.y * (141.8 + padding - view.sprite.anchor.y * meta.frameHeight),
            ).toBeCloseTo(eyeY);
        expect(completed).toBe(0);
        unit.stepOneShotAnimation(meta.frameDurationsMs![frame] / 1.17);
    }
    expect(completed).toBe(1);
    expect(unit.isPlayingOneShotAnimation()).toBe(false);
    // Return is synchronous; the padded action cannot use idle registration for one frame.
    expect(view.sprite.texture.height).toBe(512);
    expect(view.sprite.scale.x).toBeCloseTo(idleScale.x);
    expect(view.sprite.scale.y).toBeCloseTo(idleScale.y);
    expect(view.sprite.anchor.y).toBeCloseTo(730 / 768);
    expect(view.sprite.filters?.some((f) => f instanceof MantisEyeGlowFilter)).toBe(true);
    root.destroy({ children: true });
});

test("Mantis has three distinct lab attacks with fixed registration and synchronous recovery", () => {
    const states = [
        "melee_attack",
        "melee_attack_up",
        "melee_attack_down",
        "attack",
        "attack_up",
        "attack_down",
    ] as const;
    for (const facing of [-1, 1]) {
        const { unit, root, grid, view, requested } = makeUnit();
        const runtimeKeys = states.map((state) => unit.getAnimationTextureKey(state));
        unit.setCreatureAnimationLabPreviewEnabled(true);
        expect(states.map((state) => unit.getAnimationTextureKey(state))).toEqual(runtimeKeys);
        unit.setBoardFacing(facing);
        unit.ensureVisual(root, grid);
        const scale = { x: view.sprite.scale.x, y: view.sprite.scale.y };
        const position = { x: view.sprite.x, y: view.sprite.y };
        const eyeY = position.y + scale.y * (141.8 - view.sprite.anchor.y * 512);
        const action = unit as unknown as {
            oneShotAnim?: {
                frameIndex: number;
                authoredRealTime: boolean;
                holdLastFrame: boolean;
                frameDurationsMs: number[];
            };
        };
        for (const state of states) {
            const atlasState = state.replace(/^attack/, "melee_attack");
            const key = `mantis_lab_${atlasState}_atlas`;
            expect(unit.hasAnimationState(state)).toBe(true);
            expect(unit.getAnimationTextureKey(state)).toBe(key);
            expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
            expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
            expect(isProductionOmittedAssetKey(key)).toBe(true);
            expect(isIdleAtlasKey(key)).toBe(false);
            const meta = animationAtlases["Mantis Lab"][atlasState];
            const padding = (meta.frameHeight - 512) / 2;
            unit.startBoardWalkAnimation(facing, 2);
            let completed = 0;
            expect(unit.playOneShotAnimation(state, () => completed++)).toBe(true);
            expect(view.walkAnim).toBeUndefined();
            expect(requested).toContain(key);
            expect(action.oneShotAnim?.authoredRealTime).toBe(true);
            expect(action.oneShotAnim?.holdLastFrame).toBe(false);
            expect(view.sprite.y + scale.y * (141.8 + padding - view.sprite.anchor.y * meta.frameHeight)).toBeCloseTo(
                eyeY,
            );
            for (let frame = 0; frame < meta.frameCount; frame++) {
                expect(action.oneShotAnim?.frameIndex).toBe(frame);
                unit.ensureVisual(root, grid);
                expect(view.sprite.scale.x).toBeCloseTo(scale.x);
                expect(view.sprite.scale.y).toBeCloseTo(scale.y);
                expect(view.sprite.x).toBeCloseTo(position.x);
                expect(view.sprite.y).toBeCloseTo(position.y);
                expect(view.sprite.anchor.y).toBeCloseTo(((730 / 768) * 512 + padding) / meta.frameHeight);
                expect(completed).toBe(0);
                unit.stepOneShotAnimation(meta.frameDurationsMs![frame] / 1.17);
            }
            expect(completed).toBe(1);
            expect(unit.isPlayingOneShotAnimation()).toBe(false);
            expect(view.sprite.texture.height).toBe(512);
            expect(view.sprite.scale.x).toBeCloseTo(scale.x);
            expect(view.sprite.scale.y).toBeCloseTo(scale.y);
            expect(view.sprite.anchor.y).toBeCloseTo(730 / 768);
            expect(view.sprite.filters?.some((f) => f instanceof MantisEyeGlowFilter)).toBe(true);
        }
        // Different padded action canvases can interrupt each other without accumulating scale.
        for (const state of ["death", ...states, "hit", "melee_attack_up"]) {
            expect(unit.playOneShotAnimation(state)).toBe(true);
            unit.ensureVisual(root, grid);
            expect(view.sprite.scale.x).toBeCloseTo(scale.x);
            expect(view.sprite.scale.y).toBeCloseTo(scale.y);
        }
        unit.returnToIdleAnimation();
        expect(view.sprite.scale.y).toBeCloseTo(scale.y);
        root.destroy({ children: true });
    }
});

test("Mantis death is another 17% faster, holds the corpse once and resets without growing", () => {
    const { unit, root, grid, view } = makeUnit();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(root, grid);
    const scale = { x: view.sprite.scale.x, y: view.sprite.scale.y };
    let completed = 0;
    expect(unit.playOneShotAnimation("death", () => completed++)).toBe(true);
    const action = unit as unknown as {
        oneShotAnim?: { frameIndex: number; finished?: boolean; frames: Texture[]; frameDurationsMs: number[] };
    };
    const meta = animationAtlases["Mantis Lab"].death;
    const durations = action.oneShotAnim!.frameDurationsMs;
    expect(durations.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(1000 / (1.1 * 1.17));
    expect(meta.frameDurationsMs!.reduce((sum, ms) => sum + ms, 0)).toBe(1000);
    for (let frame = 0; frame < meta.frameCount; frame++) {
        expect(action.oneShotAnim?.frameIndex).toBe(frame);
        unit.ensureVisual(root, grid);
        expect(view.sprite.scale.x).toBeCloseTo(scale.x);
        expect(view.sprite.scale.y).toBeCloseTo(scale.y);
        expect(durations[frame]).toBeCloseTo(meta.frameDurationsMs![frame] / (1.1 * 1.17));
        unit.stepOneShotAnimation(durations[frame]);
    }
    expect(completed).toBe(1);
    expect(action.oneShotAnim?.finished).toBe(true);
    const corpse = view.sprite.texture;
    for (const ms of [1, 1000, 10000]) {
        unit.stepOneShotAnimation(ms);
        unit.ensureVisual(root, grid);
        expect(view.sprite.texture).toBe(corpse);
        expect(action.oneShotAnim?.frameIndex).toBe(7);
        expect(completed).toBe(1);
    }
    expect(view.sprite.filters?.some((f) => f instanceof MantisEyeGlowFilter) ?? false).toBe(false);
    expect(unit.playOneShotAnimation("hit")).toBe(true);
    expect(view.sprite.scale.y).toBeCloseTo(scale.y);
    unit.returnToIdleAnimation();
    expect(view.sprite.texture.height).toBe(512);
    expect(view.sprite.scale.y).toBeCloseTo(scale.y);
    expect(view.sprite.anchor.y).toBeCloseTo(730 / 768);
    expect(unit.playOneShotAnimation("death")).toBe(true);
    unit.stepOneShotAnimation(10000);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.isPlayingOneShotAnimation()).toBe(true);
    unit.returnToIdleAnimation();
    expect(unit.isPlayingOneShotAnimation()).toBe(false);
    expect(unit.getAnimationTextureKey("death")).toBe("mantis_lab_death_atlas");
    unit.ensureVisual(root, grid);
    expect(view.sprite.texture.height).toBe(512);
    expect(view.sprite.anchor.y).toBeCloseTo(730 / 768);
    root.destroy({ children: true });
});
