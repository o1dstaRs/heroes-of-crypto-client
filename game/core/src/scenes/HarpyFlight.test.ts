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
import { shouldPreloadUnitAnimationAtlas, usesApprovedBaseAnimations } from "../pixi/creatureAnimationSettings";
import { isIdleAtlasKey, isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import { getSplitBundles } from "../pixi/PixiTextureLoader";
import {
    CREATURE_WALK_CYCLE_DISTANCE_CELLS,
    creatureOneShotAnimationEnabledForUnit,
    RenderableUnit,
} from "./RenderableUnit";

const HARPY_TRANSITION_TIME_SCALE = 4 * 1.35 * 1.15;
const HARPY_CYCLE_DISTANCE_CELLS = CREATURE_WALK_CYCLE_DISTANCE_CELLS / 1.3;

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
});

test("Harpy preloads authored idle and flight without enabling legacy attacks", () => {
    expect(shouldPreloadUnitAnimationAtlas("harpy_flight_walk_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("harpy_attack_atlas_quarter", false)).toBe(false);
    expect(usesApprovedBaseAnimations("Harpy")).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("harpy_idle_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("harpy_hit_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("harpy_death_atlas", false)).toBe(true);
    expect(creatureOneShotAnimationEnabledForUnit("Harpy", "hit")).toBe(true);
    expect(creatureOneShotAnimationEnabledForUnit("Harpy", "death")).toBe(true);
    expect(creatureOneShotAnimationEnabledForUnit("Harpy", "attack")).toBe(false);
    for (const state of [
        "idle",
        "flight_walk",
        "hit",
        "death",
        "melee_attack",
        "melee_attack_up",
        "melee_attack_down",
    ]) {
        expect(isRedundantFullResolutionUnitAtlasKey(`harpy_${state}_atlas`)).toBe(false);
    }
    expect(isIdleAtlasKey("harpy_idle_atlas")).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("harpy_attack_atlas")).toBe(true);
    const bundles = getSplitBundles({ animationsEnabled: false });
    expect(bundles.idleAtlases.harpy_idle_atlas).toBeDefined();
    for (const state of [
        "flight_walk",
        "hit",
        "death",
        "cast",
        "melee_attack",
        "melee_attack_up",
        "melee_attack_down",
    ]) {
        const key = `harpy_${state}_atlas`;
        expect(bundles.animations[key]).toBeDefined();
        expect(bundles.excludedFullResolutionUnitAtlases[key]).toBeUndefined();
    }
});

test.each([false, true])("Harpy reactions in lab=%s restore flight scale, recover and hold death", (lab) => {
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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Might", "Harpy", "harpy_512", 1),
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
    const staticTexture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    const requested: string[] = [];
    const unit = RenderableUnit.fromBase(base, (key) => {
        requested.push(key);
        return /^harpy_(idle|hit|death|cast|flight_walk|melee_attack(?:_up|_down)?)_atlas$/.test(key)
            ? atlas
            : staticTexture;
    });
    const root = new Container();
    const view = unit as unknown as {
        sprite: Sprite;
        walkAnim?: unknown;
        oneShotAnim?: {
            frames: Texture[];
            frameIndex: number;
            frameDurationsMs: number[];
            authoredRealTime: boolean;
            finished?: boolean;
        };
    };
    unit.setPosition(0, 1024);
    unit.setCreatureAnimationLabPreviewEnabled(lab);
    unit.ensureVisual(root, grid);
    const scale = view.sprite.scale.y;
    const anchor = view.sprite.anchor.y;
    unit.startBoardWalkAnimation(1, 4);
    let hits = 0;
    expect(unit.playOneShotAnimation("hit", () => hits++)).toBe(true);
    expect(view.walkAnim).toBeUndefined();
    expect(requested).toContain("harpy_hit_atlas");
    expect(view.oneShotAnim?.frames).toHaveLength(5);
    expect(view.oneShotAnim?.authoredRealTime).toBe(true);
    expect(view.sprite.scale.y).toBeCloseTo(scale, 5);
    expect(view.sprite.anchor.y).toBeCloseTo(794 / 896, 5);
    unit.stepOneShotAnimation(39 / 1.17);
    expect(view.oneShotAnim?.frameIndex).toBe(0);
    unit.stepOneShotAnimation(2 / 1.17);
    expect(view.oneShotAnim?.frameIndex).toBe(1);
    unit.stepOneShotAnimation(1000 / 1.17);
    expect(hits).toBe(1);
    expect(view.oneShotAnim).toBeUndefined();
    unit.ensureVisual(root, grid);
    expect(view.sprite.scale.y).toBeCloseTo(scale, 5);
    expect(view.sprite.anchor.y).toBeCloseTo(anchor, 5);
    for (const attack of ["melee_attack", "melee_attack_up", "melee_attack_down"]) {
        let completed = 0;
        expect(creatureOneShotAnimationEnabledForUnit("Harpy", attack)).toBe(true);
        expect(unit.playOneShotAnimation(attack, () => completed++)).toBe(true);
        expect(requested).toContain(`harpy_${attack}_atlas`);
        expect(view.oneShotAnim?.frames).toHaveLength(5);
        expect(view.oneShotAnim?.authoredRealTime).toBe(true);
        for (const duration of [...view.oneShotAnim!.frameDurationsMs]) {
            unit.ensureVisual(root, grid);
            expect(view.sprite.scale.y).toBeCloseTo(scale, 5);
            expect(view.sprite.anchor.y).toBeCloseTo(794 / 896, 5);
            unit.stepOneShotAnimation(duration);
        }
        expect(completed).toBe(1);
        expect(view.oneShotAnim).toBeUndefined();
        unit.ensureVisual(root, grid);
        expect(view.sprite.scale.y).toBeCloseTo(scale, 5);
        expect(view.sprite.anchor.y).toBeCloseTo(anchor, 5);
    }
    expect(unit.setHarpyCastFrame(2)).toBe(true);
    expect(requested).toContain("harpy_cast_atlas");
    unit.ensureVisual(root, grid);
    expect(view.sprite.scale.y).toBeCloseTo(scale, 5);
    expect(view.sprite.anchor.y).toBeCloseTo(1018 / 1344, 5);
    unit.stepOneShotAnimation(10000 / 1.17);
    expect(view.oneShotAnim?.frameIndex).toBe(2);
    const groundY = view.sprite.y;
    unit.setTransportVisual(75);
    unit.ensureVisual(root, grid);
    expect(view.sprite.y).toBeCloseTo(groundY + 75, 5);
    expect(view.sprite.scale.y).toBeCloseTo(scale, 5);
    const passengerShoulder = { x: 123, y: 456 };
    unit.setTransportVisual(75, { getCastlingShoulderPoint: () => passengerShoulder } as unknown as RenderableUnit);
    unit.ensureVisual(root, grid);
    expect(view.sprite.x).toBe(123);
    expect(view.sprite.y).toBe(456);
    expect(view.sprite.scale.y).toBeCloseTo(scale, 5);
    unit.setTransportVisual(0);
    unit.returnToIdleAnimation();
    unit.ensureVisual(root, grid);
    expect(view.sprite.scale.y).toBeCloseTo(scale, 5);
    expect(view.sprite.anchor.y).toBeCloseTo(anchor, 5);
    let deaths = 0;
    expect(unit.playOneShotAnimation("death", () => deaths++)).toBe(true);
    expect(requested).toContain("harpy_death_atlas");
    expect(view.oneShotAnim?.frames).toHaveLength(5);
    const deathDurations = [...view.oneShotAnim!.frameDurationsMs];
    for (let frame = 0; frame < deathDurations.length; frame++) {
        expect(view.oneShotAnim?.frameIndex).toBe(frame);
        unit.ensureVisual(root, grid);
        expect(view.sprite.scale.y).toBeCloseTo(scale, 5);
        expect(view.sprite.anchor.y).toBeCloseTo(794 / 896, 5);
        unit.stepOneShotAnimation(deathDurations[frame]);
    }
    expect(deaths).toBe(1);
    expect(view.oneShotAnim?.finished).toBe(true);
    expect(view.oneShotAnim?.frameIndex).toBe(4);
    const corpse = view.sprite.texture;
    unit.stepOneShotAnimation(2000);
    expect(view.sprite.texture).toBe(corpse);
    expect(deaths).toBe(1);
    unit.returnToIdleAnimation();
    unit.ensureVisual(root, grid);
    expect(view.sprite.scale.y).toBeCloseTo(scale, 5);
    expect(view.sprite.anchor.y).toBeCloseTo(anchor, 5);
    root.destroy({ children: true });
});

test.each([false, true])("Harpy flight in lab=%s preserves scale, loops by distance, then lands", (lab) => {
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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Might", "Harpy", "harpy_512", 1),
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
    const baseTexture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    const requested: string[] = [];
    const unit = RenderableUnit.fromBase(base, (key) => {
        requested.push(key);
        return key === "harpy_flight_walk_atlas" || key === "harpy_idle_atlas" ? atlas : baseTexture;
    });
    const root = new Container();
    const view = unit as unknown as {
        sprite: Sprite;
        selectionAnimFrames: Texture[];
        selectionAnimFrameIndex: number;
        selectionAnimationStartedAtMs: number;
        walkAnim?: { frames: Texture[]; frameIndex: number; gaitDistanceCells: number; completedCycles: number };
    };
    unit.setPosition(0, 1024);
    unit.setCreatureAnimationLabPreviewEnabled(lab);
    unit.ensureVisual(root, grid);
    const initial = {
        scaleX: view.sprite.scale.x,
        scaleY: view.sprite.scale.y,
        anchorX: view.sprite.anchor.x,
        anchorY: view.sprite.anchor.y,
    };
    expect(requested).toContain("harpy_idle_atlas");
    expect(view.selectionAnimFrames).toHaveLength(20);
    const idleStart = view.selectionAnimationStartedAtMs;
    unit.stepSelectionAnimation(idleStart + 1400 / 1.15 - 1);
    expect(view.selectionAnimFrameIndex).toBe(0);
    unit.stepSelectionAnimation(idleStart + 1400 / 1.15 + 1);
    expect(view.selectionAnimFrameIndex).toBe(1);
    // Scratch starts only after the long neutral/look sequence, then returns to neutral.
    unit.stepSelectionAnimation(idleStart + 10060 / 1.15 + 1);
    expect(view.selectionAnimFrameIndex).toBe(12);
    unit.stepSelectionAnimation(idleStart + 13020 / 1.15 + 1);
    expect(view.selectionAnimFrameIndex).toBe(0);
    unit.startBoardWalkAnimation(1, 4);
    expect(requested).toContain("harpy_flight_walk_atlas");
    expect(requested).not.toContain("harpy_walk_atlas_quarter");
    expect(view.walkAnim?.frames).toHaveLength(10);
    expect(view.sprite.scale.x).toBeCloseTo(initial.scaleX, 5);
    expect(view.sprite.scale.y).toBeCloseTo(initial.scaleY, 5);
    expect(view.sprite.anchor.x).toBeCloseTo(0.5, 5);
    expect(view.sprite.anchor.y).toBeCloseTo((288 + 742) / 1344, 5);
    expect(view.walkAnim?.frameIndex).toBe(0);
    unit.ensureVisual(root, grid);
    // The original 768px body is embedded unchanged inside every 1344px cel.
    // A board draw must preserve its visible size rather than fit the empty wing margin.
    expect(view.sprite.scale.y).toBeCloseTo(initial.scaleY, 5);
    expect(view.sprite.scale.x).toBeCloseTo(initial.scaleX, 5);

    for (let frame = 0; frame < view.walkAnim!.frames.length; frame++) {
        view.walkAnim!.frameIndex = frame;
        view.sprite.texture = view.walkAnim!.frames[frame];
        unit.ensureVisual(root, grid);
        expect(view.sprite.scale.x).toBeCloseTo(initial.scaleX, 5);
        expect(view.sprite.scale.y).toBeCloseTo(initial.scaleY, 5);
    }
    view.walkAnim!.frameIndex = 0;
    view.sprite.texture = view.walkAnim!.frames[0];

    unit.stepSpawnAnimation(0.101 / HARPY_TRANSITION_TIME_SCALE);
    expect(view.walkAnim?.frameIndex).toBe(1);
    unit.stepSpawnAnimation(0.141 / HARPY_TRANSITION_TIME_SCALE);
    expect(view.walkAnim?.frameIndex).toBe(2);
    unit.stepSpawnAnimation(0.091 / HARPY_TRANSITION_TIME_SCALE);
    expect(view.walkAnim?.frameIndex).toBe(3);
    for (let boundary = 0; boundary <= 8; boundary++) {
        const distance = (boundary * HARPY_CYCLE_DISTANCE_CELLS) / 4;
        unit.setBoardWalkDistanceCells(distance);
        expect(view.walkAnim?.frameIndex).toBe(3 + (boundary % 4));
        expect(view.walkAnim?.completedCycles).toBe(Math.floor(boundary / 4));
        unit.ensureVisual(root, grid);
        expect(view.sprite.scale.y).toBeCloseTo(initial.scaleY, 5);
        const texture = view.sprite.texture;
        unit.stepSpawnAnimation(0.3);
        expect(view.sprite.texture).toBe(texture);
    }
    unit.setBoardWalkDistanceCells(2 * HARPY_CYCLE_DISTANCE_CELLS + Math.SQRT2);
    unit.setBoardFacingFromMovement(-1);
    expect(view.walkAnim?.frameIndex).toBe(3 + (Math.floor(Math.SQRT2 / (HARPY_CYCLE_DISTANCE_CELLS / 4)) % 4));
    let landed = 0;
    unit.finishBoardWalkAnimationAfterFullCycle(() => landed++);
    expect(view.walkAnim?.frameIndex).toBe(7);
    unit.stepSpawnAnimation(0.111 / HARPY_TRANSITION_TIME_SCALE);
    expect(view.walkAnim?.frameIndex).toBe(8);
    unit.stepSpawnAnimation(0.131 / HARPY_TRANSITION_TIME_SCALE);
    expect(view.walkAnim?.frameIndex).toBe(9);
    unit.stepSpawnAnimation(0.141 / HARPY_TRANSITION_TIME_SCALE);
    expect(view.walkAnim).toBeUndefined();
    expect(landed).toBe(1);
    expect(view.sprite.scale.x).toBeCloseTo(initial.scaleX, 5);
    expect(view.sprite.scale.y).toBeCloseTo(initial.scaleY, 5);
    expect(view.sprite.anchor.x).toBeCloseTo(initial.anchorX, 5);
    expect(view.sprite.anchor.y).toBeCloseTo(initial.anchorY, 5);
    unit.ensureVisual(root, grid);
    expect(Math.abs(view.sprite.scale.x)).toBeCloseTo(Math.abs(initial.scaleX), 5);
    expect(view.sprite.scale.y).toBeCloseTo(initial.scaleY, 5);
    root.destroy({ children: true });
});
