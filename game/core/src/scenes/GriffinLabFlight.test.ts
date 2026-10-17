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
import { GRIFFIN_IDLE_FRAME_COUNT, GRIFFIN_PREEN_START_MS, GRIFFIN_PREEN_FEATHER_RELEASE_MS } from "./GriffinLabIdle";
import { shouldPreloadUnitAnimationAtlas, usesApprovedBaseAnimations } from "../pixi/creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import { getSplitBundles } from "../pixi/PixiTextureLoader";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../pixi/productionImageAssetPolicy";
import {
    creatureOneShotAnimationEnabledForUnit,
    creatureWalkAnimationEnabledForUnit,
    RenderableUnit,
} from "./RenderableUnit";
import {
    griffinLabFlightSettings,
    GRIFFIN_LAB_FLIGHT_DEFAULTS,
    setGriffinLabFlightSetting,
    GRIFFIN_LAB_WALK_ANCHOR_X,
    GRIFFIN_LAB_TRANSITION_SPEED,
    GRIFFIN_LAB_LANDING_SPEED,
    GRIFFIN_LAB_TAKEOFF_SPEED,
    GRIFFIN_LAB_SOURCE_SIZE,
    GRIFFIN_LAB_SOURCE_X,
    GRIFFIN_LAB_SOURCE_Y,
    griffinLabWalkAnchorY,
    readGriffinLabFlightSettings,
    GRIFFIN_FLIGHT_SETTINGS_STORAGE_KEY,
} from "./GriffinLabFlight";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
});
afterEach(() => Object.assign(griffinLabFlightSettings, GRIFFIN_LAB_FLIGHT_DEFAULTS));

test("Griffin saved flight settings survive reload and reject corrupt or out-of-range values", () => {
    const read = (value: string) => readGriffinLabFlightSettings({ getItem: () => value });
    expect(read("invalid json")).toEqual(GRIFFIN_LAB_FLIGHT_DEFAULTS);
    expect(read('{"takeoffSpeed":0.1,"travelSpeed":20,"landingSpeed":"fast"}')).toEqual({
        takeoffSpeed: 0.25,
        travelSpeed: 3,
        landingSpeed: 1,
    });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const saved = new Map<string, string>();
    const storage = {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => saved.set(key, value),
    };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    try {
        setGriffinLabFlightSetting("takeoffSpeed", 1.4);
        setGriffinLabFlightSetting("travelSpeed", 0.8);
        setGriffinLabFlightSetting("landingSpeed", 1.6);
        expect(saved.has(GRIFFIN_FLIGHT_SETTINGS_STORAGE_KEY)).toBe(true);
        expect(readGriffinLabFlightSettings(storage)).toEqual(griffinLabFlightSettings);
        setGriffinLabFlightSetting("landingSpeed", Number.NaN);
        expect(readGriffinLabFlightSettings(storage).landingSpeed).toBe(1.6);
    } finally {
        if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
        else Reflect.deleteProperty(globalThis, "localStorage");
    }
});

test("The complete approved Griffin package resolves in ordinary gameplay without enabling the lab", () => {
    const { unit, root } = makeUnit();
    expect(usesApprovedBaseAnimations("Griffin")).toBe(true);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("idle")).toBe("griffin_lab_idle_atlas");
    expect(unit.getAnimationTextureKey("walk")).toBe("griffin_flight_walk_atlas");
    const bundles = getSplitBundles({ animationsEnabled: false });
    expect(bundles.idleAtlases.griffin_lab_idle_atlas).toBeDefined();
    expect(bundles.animations.griffin_flight_walk_atlas).toBeDefined();
    for (const state of ["hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"]) {
        expect(creatureOneShotAnimationEnabledForUnit("Griffin", state)).toBe(true);
        expect(unit.getAnimationTextureKey(state)).toBe(`griffin_lab_${state}_atlas`);
        expect(unit.hasAnimationState(state)).toBe(true);
        expect(bundles.animations[`griffin_lab_${state}_atlas`]).toBeDefined();
        expect(isProductionOmittedDisabledUnitAnimationAssetKey(`griffin_lab_${state}_atlas`)).toBe(false);
    }
    root.destroy({ children: true });
});

test("Griffin neutral bookends preserve source pixel positions across the canvas change", () => {
    const { unit, root, grid, view } = makeUnit();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(root, grid);
    const sprite = view.sprite;
    const scale = { x: sprite.scale.x, y: sprite.scale.y };
    const anchor = { x: sprite.anchor.x, y: sprite.anchor.y };
    const points = [
        [384, 380],
        [638, 214],
        [754, 257],
        [540, 720],
    ];
    unit.startBoardWalkAnimation(1, 8);
    expect(sprite.anchor.y).toBeCloseTo(griffinLabWalkAnchorY(anchor.y));
    for (const [x, y] of points) {
        const walkX = GRIFFIN_LAB_SOURCE_X + (x * GRIFFIN_LAB_SOURCE_SIZE) / 768;
        const walkY = GRIFFIN_LAB_SOURCE_Y + (y * GRIFFIN_LAB_SOURCE_SIZE) / 768;
        expect((walkX - sprite.anchor.x * 1024) * sprite.scale.x).toBeCloseTo((x - anchor.x * 768) * scale.x);
        expect((walkY - sprite.anchor.y * 1024) * sprite.scale.y).toBeCloseTo((y - anchor.y * 768) * scale.y);
    }
    unit.stopBoardWalkAnimation();
    expect(sprite.scale.x).toBeCloseTo(scale.x);
    expect(sprite.scale.y).toBeCloseTo(scale.y);
    expect(sprite.anchor.y).toBeCloseTo(anchor.y);
    root.destroy({ children: true });
});

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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Griffin", "griffin_512", 1),
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
    const requested: string[] = [];
    const idleAtlas = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 6144, height: 14592 }),
    });
    const reactionAtlas = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 3840, height: 2304 }),
    });
    const attackAtlas = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 5120 }),
    });
    const unit = RenderableUnit.fromBase(base, (key) => {
        requested.push(key);
        return key === "griffin_flight_walk_atlas"
            ? atlas
            : key === "griffin_lab_idle_atlas"
              ? idleAtlas
              : key === "griffin_lab_hit_atlas" || key === "griffin_lab_death_atlas"
                ? reactionAtlas
                : /^griffin_lab_melee_attack(?:_up|_down)?_atlas$/.test(key)
                  ? attackAtlas
                  : idle;
    });
    const root = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(root, grid);
    const view = unit as unknown as {
        sprite: import("pixi.js").Sprite;
        selectionAnimationStartedAtMs: number;
        selectionAnimFrameIndex: number;
        oneShotAnim?: {
            frames: Texture[];
            frameIndex: number;
            finished?: boolean;
            holdLastFrame?: boolean;
            frameDurationsMs?: readonly number[];
            authoredRealTime?: boolean;
        };
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

test("Griffin approved flight plays in combat, holds its gait while stationary, and lands once", () => {
    expect(creatureWalkAnimationEnabledForUnit("Griffin", false)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Griffin", true)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("griffin_flight_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("griffin_flight_walk_atlas")).toBe(false);
    const { unit, root, grid, view, requested } = makeUnit();
    const initialScaleY = view.sprite.scale.y;
    unit.startBoardWalkAnimation(1, 8);
    const flightCanvasHeight = view.sprite.height;
    expect(view.sprite.anchor.x).toBeCloseTo(GRIFFIN_LAB_WALK_ANCHOR_X);
    unit.ensureVisual(root, grid);
    expect(view.sprite.height).toBeCloseTo(flightCanvasHeight);
    expect(view.sprite.anchor.x).toBeCloseTo(GRIFFIN_LAB_WALK_ANCHOR_X);
    const meta = animationAtlases["Griffin Flight"].walk;
    expect(requested).toContain("griffin_flight_walk_atlas");
    expect(view.walkAnim?.loopStartFrame).toBe(4);
    expect(view.walkAnim?.loopEndFrame).toBe(11);
    for (let i = 0; i < 4; i++) {
        expect(view.walkAnim?.frameIndex).toBe(i);
        unit.stepSpawnAnimation(
            (meta.frameDurationsMs![i] + 0.01) / (4000 * GRIFFIN_LAB_TRANSITION_SPEED * GRIFFIN_LAB_TAKEOFF_SPEED),
        );
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
        unit.stepSpawnAnimation(
            (meta.frameDurationsMs![i] + 0.01) / (4000 * GRIFFIN_LAB_TRANSITION_SPEED * GRIFFIN_LAB_LANDING_SPEED),
        );
    }
    expect(completed).toBe(1);
    expect(view.walkAnim).toBeUndefined();
    expect(view.sprite.anchor.x).toBe(0.5);
    expect(view.sprite.scale.y).toBeCloseTo(initialScaleY);
    unit.ensureVisual(root, grid);
    expect(view.sprite.scale.y).toBeCloseTo(initialScaleY);
    root.destroy({ children: true });
});

test("Griffin grooming yields immediately to flight and remains enabled outside the lab", () => {
    const { unit, root, grid, view, requested } = makeUnit();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.stepSelectionAnimation(
        view.selectionAnimationStartedAtMs + GRIFFIN_PREEN_START_MS + GRIFFIN_PREEN_FEATHER_RELEASE_MS,
    );
    expect(view.selectionAnimFrameIndex).toBe(GRIFFIN_IDLE_FRAME_COUNT + 24);
    expect(requested).toContain("griffin_lab_idle_atlas");
    const idleScaleY = view.sprite.scale.y;
    unit.startBoardWalkAnimation(1, 2);
    unit.ensureVisual(root, grid);
    unit.stepSelectionAnimation(view.selectionAnimationStartedAtMs + GRIFFIN_PREEN_START_MS + 600);
    expect(view.sprite.texture.width).toBe(1024);
    unit.stopBoardWalkAnimation();
    unit.ensureVisual(root, grid);
    expect(view.sprite.texture.width).toBe(768);
    expect(view.sprite.scale.y).toBeCloseTo(idleScaleY);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("idle")).toBe("griffin_lab_idle_atlas");
    expect(view.sprite.texture.width).toBe(768);
    expect(view.sprite.scale.y).toBeCloseTo(idleScaleY);
    root.destroy({ children: true });
});

test("Griffin transition sliders affect authored timing and short routes still land", () => {
    const { unit, root, view } = makeUnit();
    setGriffinLabFlightSetting("takeoffSpeed", 2);
    setGriffinLabFlightSetting("landingSpeed", 0.5);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.startBoardWalkAnimation(1, 0.25);
    unit.stepSpawnAnimation(101 / (8000 * GRIFFIN_LAB_TRANSITION_SPEED * GRIFFIN_LAB_TAKEOFF_SPEED));
    expect(view.walkAnim?.frameIndex).toBe(1);
    unit.setBoardWalkDistanceCells(0.25);
    let completed = 0;
    unit.finishBoardWalkAnimationAfterFullCycle(() => completed++);
    expect(view.walkAnim?.frameIndex).toBe(12);
    unit.stepSpawnAnimation(100 / (4000 * GRIFFIN_LAB_TRANSITION_SPEED));
    expect(view.walkAnim?.frameIndex).toBe(12);
    unit.stepSpawnAnimation(101 / (4000 * GRIFFIN_LAB_TRANSITION_SPEED));
    expect(view.walkAnim?.frameIndex).toBe(13);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(view.walkAnim).toBeDefined();
    for (let i = 13; i < 16; i++) {
        expect(view.walkAnim?.frameIndex).toBe(i);
        unit.stepSpawnAnimation(
            (animationAtlases["Griffin Flight"].walk.frameDurationsMs![i] + 0.01) /
                (4000 * GRIFFIN_LAB_TRANSITION_SPEED * GRIFFIN_LAB_LANDING_SPEED * 0.5),
        );
    }
    expect(view.walkAnim).toBeUndefined();
    expect(completed).toBe(1);
    root.destroy({ children: true });
});

test("Griffin retains Valkyrie authored timing with 20% faster takeoff and landing", () => {
    const griffin = animationAtlases["Griffin Flight"].walk;
    const valkyrie = animationAtlases["Valkyrie Lab Current"].walk;
    expect(griffin.frameDurationsMs?.slice(0, 4)).toEqual(valkyrie.frameDurationsMs?.slice(0, 4));
    expect(griffin.frameDurationsMs?.slice(12)).toEqual(valkyrie.frameDurationsMs?.slice(12));
    expect(GRIFFIN_LAB_TRANSITION_SPEED).toBeCloseTo(1.3 * 1.15 * 1.2);
    expect(GRIFFIN_LAB_LANDING_SPEED).toBe(1.2);
    expect(GRIFFIN_LAB_TAKEOFF_SPEED).toBe(1.2);
});

test("Griffin hit and death add 15% speed without changing registration", () => {
    for (const [state, originalMs, speed] of [
        ["hit", 410, 1.15 * 1.15],
        ["death", 910, 1.22 * 1.15 * 1.15],
    ] as const) {
        const meta = animationAtlases["Griffin Lab"][state];
        const durationMs = meta.frameDurationsMs!.reduce((sum, time) => sum + time, 0);
        expect(durationMs).toBeCloseTo(originalMs / speed, 6);
        expect(meta.totalDurationSec * 1000).toBeCloseTo(durationMs, 6);
        expect(meta.frameDurationSec * meta.frameCount * 1000).toBeCloseTo(durationMs, 6);
        expect(meta.fps * meta.totalDurationSec).toBeCloseTo(meta.frameCount, 6);
        expect(meta.frameWidth).toBe(768);
        expect(meta.frameHeight).toBe(768);
        expect(meta.footAnchorY).toBeCloseTo(730 / 768, 6);
    }
});

test("Griffin hit interrupts flight on the idle canvas and completes once in authored real time", () => {
    const { unit, root, grid, view, requested } = makeUnit();
    expect(unit.getAnimationTextureKey("hit")).toBe("griffin_lab_hit_atlas");
    unit.ensureVisual(root, grid);
    const scale = { x: view.sprite.scale.x, y: view.sprite.scale.y };
    const anchorY = view.sprite.anchor.y;
    unit.startBoardWalkAnimation(1, 8);
    let completed = 0;
    expect(unit.hasAnimationState("hit")).toBe(true);
    expect(unit.playOneShotAnimation("hit", () => completed++)).toBe(true);
    expect(requested).toContain("griffin_lab_hit_atlas");
    expect(view.walkAnim).toBeUndefined();
    expect(view.sprite.texture.width).toBe(768);
    expect(view.sprite.anchor.x).toBe(0.5);
    expect(view.sprite.anchor.y).toBeCloseTo(anchorY);
    expect(view.sprite.scale.x).toBeCloseTo(scale.x);
    expect(view.sprite.scale.y).toBeCloseTo(scale.y);
    expect(view.oneShotAnim?.authoredRealTime).toBe(true);
    const times = animationAtlases["Griffin Lab"].hit.frameDurationsMs!;
    const supportToeXs = [706, 719, 732, 740, 749, 740, 732, 729, 726, 716, 706];
    for (let i = 0; i < times.length; i++) {
        unit.ensureVisual(root, grid);
        expect(view.oneShotAnim?.frameIndex).toBe(i);
        expect(completed).toBe(0);
        expect(view.sprite.texture.width).toBe(768);
        expect(view.sprite.texture.height).toBe(768);
        expect(view.sprite.scale.x).toBeCloseTo(scale.x);
        expect(view.sprite.scale.y).toBeCloseTo(scale.y);
        expect(view.sprite.anchor.y).toBeCloseTo(anchorY);
        expect((supportToeXs[i] - view.sprite.anchor.x * 768) * view.sprite.scale.x).toBeCloseTo(
            (supportToeXs[0] - 384) * scale.x,
        );
        unit.stepSpawnAnimation((times[i] + 0.001) / 4000);
    }
    expect(completed).toBe(1);
    expect(view.oneShotAnim).toBeUndefined();
    expect(view.sprite.texture.width).toBe(768);
    expect(view.sprite.scale.y).toBeCloseTo(scale.y);
    expect(view.sprite.anchor.x).toBe(0.5);
    unit.stepSpawnAnimation(1);
    expect(completed).toBe(1);
    root.destroy({ children: true });
});

test("Griffin death holds the corpse outside the lab until an explicit return to idle", () => {
    const { unit, root, grid, view } = makeUnit();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(root, grid);
    const scaleY = view.sprite.scale.y;
    const scaleX = view.sprite.scale.x;
    const anchorY = view.sprite.anchor.y;
    let completed = 0;
    expect(unit.getAnimationTextureKey("death")).toBe("griffin_lab_death_atlas");
    expect(unit.playOneShotAnimation("death", () => completed++)).toBe(true);
    const meta = animationAtlases["Griffin Lab"].death;
    for (const time of meta.frameDurationsMs!) {
        expect(view.sprite.texture.width).toBe(768);
        expect(view.sprite.texture.height).toBe(768);
        expect(view.sprite.scale.x).toBeCloseTo(scaleX);
        expect(view.sprite.scale.y).toBeCloseTo(scaleY);
        expect(view.sprite.anchor.y).toBeCloseTo(anchorY);
        unit.stepSpawnAnimation((time + 0.001) / 4000);
    }
    expect(completed).toBe(1);
    expect(view.oneShotAnim?.holdLastFrame).toBe(true);
    expect(view.oneShotAnim?.frameIndex).toBe(meta.frameCount - 1);
    const corpse = view.sprite.texture;
    unit.stepSelectionAnimation(view.selectionAnimationStartedAtMs + 50000);
    unit.stepSpawnAnimation(1);
    unit.ensureVisual(root, grid);
    expect(view.sprite.texture).toBe(corpse);
    expect(completed).toBe(1);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(view.sprite.texture).toBe(corpse);
    expect(view.oneShotAnim?.holdLastFrame).toBe(true);
    unit.returnToIdleAnimation();
    expect(view.oneShotAnim).toBeUndefined();
    expect(view.sprite.texture.width).toBe(768);
    expect(view.sprite.scale.y).toBeCloseTo(scaleY);
    for (const key of ["griffin_lab_hit_atlas", "griffin_lab_death_atlas"]) {
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
    }
    root.destroy({ children: true });
});

for (const state of ["melee_attack_up", "melee_attack", "melee_attack_down"]) {
    test(`Griffin ${state} preserves idle pixel scale, support anchor and real-time frame timing`, () => {
        const { unit, root, grid, view, requested } = makeUnit();
        unit.ensureVisual(root, grid);
        const sprite = view.sprite;
        const scale = { x: sprite.scale.x, y: sprite.scale.y };
        const anchor = { x: sprite.anchor.x, y: sprite.anchor.y };
        let completed = 0;
        expect(unit.playOneShotAnimation(state, () => completed++)).toBe(true);
        const imageKey = `griffin_lab_${state}_atlas`;
        expect(requested).toContain(imageKey);
        expect(shouldPreloadUnitAnimationAtlas(imageKey, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(imageKey)).toBe(false);
        const meta = animationAtlases["Griffin Lab"][state];
        expect(meta.frameCount).toBe(17);
        const durationMs = meta.frameDurationsMs!.reduce((sum, duration) => sum + duration, 0);
        expect(durationMs).toBeCloseTo(640 / 1.3, 6);
        expect(meta.totalDurationSec * 1000).toBeCloseTo(durationMs, 6);
        expect(meta.frameDurationSec * meta.frameCount * 1000).toBeCloseTo(durationMs, 6);
        expect(meta.fps * meta.totalDurationSec).toBeCloseTo(meta.frameCount, 6);
        expect(view.oneShotAnim?.authoredRealTime).toBe(true);
        for (let i = 0; i < meta.frameCount; i++) {
            expect(view.oneShotAnim?.frameIndex).toBe(i);
            unit.ensureVisual(root, grid);
            expect(sprite.texture.width).toBe(1024);
            expect(sprite.scale.x).toBeCloseTo(scale.x);
            expect(sprite.scale.y).toBeCloseTo(scale.y);
            for (const [x, y] of [
                [638, 214],
                [540, 720],
            ]) {
                expect((x + 128 - sprite.anchor.x * 1024) * sprite.scale.x).toBeCloseTo((x - anchor.x * 768) * scale.x);
                expect((y + 128 - sprite.anchor.y * 1024) * sprite.scale.y).toBeCloseTo((y - anchor.y * 768) * scale.y);
            }
            expect(completed).toBe(0);
            unit.stepSpawnAnimation((meta.frameDurationsMs![i] + 0.001) / 4000);
        }
        expect(completed).toBe(1);
        expect(view.oneShotAnim).toBeUndefined();
        expect(sprite.texture.width).toBe(768);
        expect(sprite.scale.x).toBeCloseTo(scale.x);
        expect(sprite.scale.y).toBeCloseTo(scale.y);
        expect(sprite.anchor.y).toBeCloseTo(anchor.y);
        unit.stepSpawnAnimation(1);
        expect(completed).toBe(1);
        root.destroy({ children: true });
    });

    test(`Griffin ${state} keeps one frame owner across repeated render passes and uneven ticks`, () => {
        for (const steps of [[1000 / 60], [1000 / 120], [8, 33, 12, 50, 17]]) {
            const { unit, root, grid, view } = makeUnit();
            unit.setCreatureAnimationLabPreviewEnabled(true);
            unit.ensureVisual(root, grid);
            let completed = 0;
            expect(unit.playOneShotAnimation(state, () => completed++)).toBe(true);
            const action = view.oneShotAnim!;
            const durations = animationAtlases["Griffin Lab"][state].frameDurationsMs!;
            const total = durations.reduce((sum, duration) => sum + duration, 0);
            let elapsed = 0;
            let tick = 0;
            while (elapsed < total) {
                let expected = 0;
                let end = durations[0];
                while (elapsed + 1e-8 >= end && expected < durations.length - 1) end += durations[++expected];
                expect(view.oneShotAnim).toBe(action);
                expect(action.frameIndex).toBe(expected);
                for (let render = 0; render < 3; render++) {
                    unit.ensureVisual(root, grid);
                    unit.stepSelectionAnimation(view.selectionAnimationStartedAtMs + GRIFFIN_PREEN_START_MS);
                    expect(view.sprite.texture).toBe(action.frames[expected]);
                    expect(action.frameIndex).toBe(expected);
                    expect(root.children.filter((child) => child === view.sprite)).toHaveLength(1);
                }
                const dtMs = steps[tick++ % steps.length];
                elapsed += dtMs;
                unit.stepSpawnAnimation(dtMs / 4000);
            }
            expect(view.oneShotAnim).toBeUndefined();
            expect(completed).toBe(1);
            unit.stepSpawnAnimation(1);
            expect(completed).toBe(1);
            root.destroy({ children: true });
        }
    });
}

test("Griffin attack interrupted by hit restores the smaller canvas without changing physical size", () => {
    const { unit, root, grid, view } = makeUnit();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(root, grid);
    const scaleY = view.sprite.scale.y;
    unit.startBoardWalkAnimation(1, 8);
    expect(unit.playOneShotAnimation("melee_attack_up")).toBe(true);
    expect(view.walkAnim).toBeUndefined();
    expect(view.sprite.scale.y).toBeCloseTo(scaleY);
    unit.ensureVisual(root, grid);
    expect(unit.playOneShotAnimation("hit")).toBe(true);
    expect(view.sprite.texture.width).toBe(768);
    expect(view.sprite.scale.y).toBeCloseTo(scaleY);
    unit.ensureVisual(root, grid);
    expect(view.sprite.scale.y).toBeCloseTo(scaleY);
    unit.stepSpawnAnimation(0.02);
    expect(view.sprite.anchor.x).toBeGreaterThan(0.5);
    expect(unit.playOneShotAnimation("melee_attack_down")).toBe(true);
    unit.ensureVisual(root, grid);
    expect(view.sprite.anchor.x).toBe(0.5);
    expect(view.sprite.scale.y).toBeCloseTo(scaleY);
    unit.returnToIdleAnimation();
    expect(view.sprite.anchor.x).toBe(0.5);
    root.destroy({ children: true });
});

test("Duplicate Griffins recover from all three attacks to the neutral idle frame", () => {
    const first = makeUnit();
    const second = makeUnit();
    first.unit.setCreatureAnimationLabPreviewEnabled(true);
    second.unit.setCreatureAnimationLabPreviewEnabled(true);
    first.unit.ensureVisual(first.root, first.grid);
    second.unit.ensureVisual(first.root, first.grid);
    for (const state of ["melee_attack_up", "melee_attack", "melee_attack_down"]) {
        expect(second.unit.playOneShotAnimation(state)).toBe(true);
        const duration = animationAtlases["Griffin Lab"][state].frameDurationsMs!.reduce((sum, ms) => sum + ms, 0);
        second.unit.stepOneShotAnimation(duration + 0.01);
        expect(second.view.oneShotAnim).toBeUndefined();
        expect(second.view.selectionAnimFrameIndex).toBe(0);
        second.unit.ensureVisual(first.root, first.grid);
        expect(second.view.selectionAnimFrameIndex).toBe(0);
    }
    first.root.destroy({ children: true });
    second.root.destroy({ children: true });
});
