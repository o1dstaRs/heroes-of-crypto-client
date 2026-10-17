import { expectApprovedAtlasRevision } from "./approvedAtlasRevision.assert";
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
import { BufferImageSource, Container, Texture, type Filter } from "pixi.js";
import {
    hydraLabWalkColor,
    hydraLabIdleColor,
    HYDRA_LAB_WALK_WIDTH_SCALE,
    HYDRA_LAB_WALK_HEIGHT_SCALE,
    HYDRA_LAB_SCALE_SAMPLES,
} from "../scenes/HydraLabWalkPalette";
import { animationAtlases } from "../generated/animation_atlases";
import { images } from "../imageAssets";
import { RenderableUnit, creatureWalkAnimationEnabledForUnit } from "../scenes/RenderableUnit";
import { CREATURE_SPRITE_ANIMATION_SETTINGS, shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "./imageAssetTiers";
import { getSplitBundles } from "./PixiTextureLoader";

beforeAll(() => {
    if (typeof document === "undefined") {
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
            querySelector: () => null,
        };
    }
});

test("Hydra HD walk is shared by combat and the lab, retains eight native frames and follows board distance", () => {
    const previous = CREATURE_SPRITE_ANIMATION_SETTINGS.enabled;
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    try {
        expect(creatureWalkAnimationEnabledForUnit("Hydra", false)).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Hydra", true)).toBe(true);
        const meta = animationAtlases["Hydra Lab"].walk;
        expect(meta.frameCount).toBe(8);
        expect(meta.frameWidth).toBe(768);
        expect(shouldPreloadUnitAnimationAtlas("hydra_lab_walk_atlas", false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey("hydra_lab_walk_atlas")).toBe(false);
        expectApprovedAtlasRevision(
            images.hydra_lab_walk_atlas,
            "animations/output/hydra_lab_walk/atlas/hydra_lab_walk_atlas.webp",
            "d2647ef98b72c4be02d2541062e1e1165adc53cdac1a4950dfca4f911a7be9b8",
        );
        expect(getSplitBundles({ animationsEnabled: false }).animations.hydra_lab_walk_atlas).toBeDefined();
        expect(animationAtlases["Hydra Lab"].idle.frameCount).toBe(64);
        expect(animationAtlases["Hydra Lab"].idle.frameWidth).toBe(768);
        expect(shouldPreloadUnitAnimationAtlas("hydra_lab_idle_atlas", false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey("hydra_lab_idle_atlas")).toBe(false);
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
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Chaos", "Hydra", "hydra_512", 1),
            grid,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        );
        const idle = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
        });
        const atlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 3840, height: 1536 }),
        });
        const idleAtlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 6144, height: 6144 }),
        });
        const unit = RenderableUnit.fromBase(base, (key) =>
            key === "hydra_lab_walk_atlas" ? atlas : key === "hydra_lab_idle_atlas" ? idleAtlas : idle,
        );
        const state = unit as unknown as {
            sprite: { texture: Texture; scale: { x: number; y: number }; filters: Filter[] | null };
            walkAnim?: { frameIndex: number; frames: Texture[] };
            selectionAnimFrames: Texture[];
            selectionAnimationStartedAtMs: number;
            selectionAnimFrameIndex: number;
        };
        unit.setCreatureAnimationLabPreviewEnabled(true);
        const world = new Container();
        unit.ensureVisual(world, grid);
        const scale = Math.abs(state.sprite.scale.y);
        const widthScale = Math.abs(state.sprite.scale.x);
        const idleFilters = [...(state.sprite.filters ?? [])];
        expect(state.selectionAnimFrames).toHaveLength(64);
        expect(state.sprite.texture.source).toBe(idleAtlas.source);
        for (const [elapsed, frame] of [
            [0, 0],
            [62.5, 1],
            [1937.5, 31],
            [2000, 32],
            [3937.5, 63],
            [4000, 0],
            [6000, 32],
            [8000, 0],
        ]) {
            unit.stepSelectionAnimation(state.selectionAnimationStartedAtMs + elapsed / 1.2);
            expect(state.selectionAnimFrameIndex).toBe(frame);
            expect(state.sprite.texture).toBe(state.selectionAnimFrames[frame]);
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(widthScale, 8);
        }
        unit.startBoardWalkAnimation(1, 3);
        const walkFilters = [...(state.sprite.filters ?? [])];
        // Walking uses its authored tail and baked reference palette, with no second color grade.
        expect(idleFilters).toHaveLength(1);
        expect(walkFilters).toHaveLength(0);
        expect(walkFilters).not.toContain(idleFilters[0]);
        expect(walkFilters).not.toEqual(idleFilters);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(widthScale * HYDRA_LAB_WALK_WIDTH_SCALE, 8);
        expect(state.walkAnim?.frames).toHaveLength(8);
        expect(state.sprite.texture.source).toBe(atlas.source);
        expect(state.sprite.texture.height).toBe(768);
        for (let step = 0; step <= 16; step++) {
            unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
            expect(state.walkAnim?.frameIndex).toBe(step % 8);
            unit.ensureVisual(world, grid);
            expect(state.sprite.filters ?? []).toEqual(walkFilters);
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(widthScale * HYDRA_LAB_WALK_WIDTH_SCALE, 8);
            expect(state.walkAnim?.frameIndex).toBe(step % 8);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(scale * HYDRA_LAB_WALK_HEIGHT_SCALE, 8);
        }
        unit.setBoardWalkDistanceCells(Math.SQRT2);
        const phase = Math.floor((Math.SQRT2 / 1.3) * 8) % 8;
        expect(state.walkAnim?.frameIndex).toBe(phase);
        unit.setBoardFacingFromMovement(-1);
        unit.ensureVisual(world, grid);
        expect(state.walkAnim?.frameIndex).toBe(phase);
        unit.startBoardWalkAnimation(-1, 2);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(widthScale * HYDRA_LAB_WALK_WIDTH_SCALE, 8);
        unit.stopBoardWalkAnimation();
        expect(state.sprite.filters ?? []).toEqual(idleFilters);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(widthScale, 8);
        expect(state.walkAnim).toBeUndefined();
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(scale, 8);
        unit.startBoardWalkAnimation(-1, 0.1);
        unit.setBoardWalkDistanceCells(0.1);
        unit.stopBoardWalkAnimation();
        expect(state.sprite.filters ?? []).toEqual(idleFilters);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(widthScale, 8);
        expect(state.walkAnim).toBeUndefined();
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(scale, 8);
    } finally {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = previous;
    }
});

test("Hydra walk matches olive scales while retaining flame and darkening rust-red tassels", () => {
    for (const [source, target] of HYDRA_LAB_SCALE_SAMPLES) {
        const graded = hydraLabWalkColor(source);
        for (let channel = 0; channel < 3; channel++) expect(graded[channel]).toBeCloseTo(target[channel], 1);
    }
    expect(hydraLabWalkColor([255, 145, 8])).toEqual([255, 145, 8]);
    const tassel = hydraLabWalkColor([94, 19, 13]);
    expect(tassel[0]).toBeLessThan(94);
    expect(tassel[1]).toBeGreaterThan(19);
    expect(hydraLabWalkColor([0, 0, 0])).toEqual([0, 0, 0]);
});

test("Hydra idle scales match walk's dark olive midtones without grading fire twice", () => {
    const color = hydraLabIdleColor([52, 50, 27]);
    expect(color[0]).toBeCloseTo(37, 0);
    expect(color[1]).toBeCloseTo(39, 0);
    expect(color[2]).toBeCloseTo(16, 0);
    expect(hydraLabIdleColor([255, 145, 8])).toEqual([255, 145, 8]);
    expect(hydraLabIdleColor([94, 19, 13])).toEqual([94, 19, 13]);
    for (const height of [559, 574, 580, 586, 568, 562, 571, 571]) {
        expect(height * HYDRA_LAB_WALK_HEIGHT_SCALE).toBeGreaterThanOrEqual(594);
    }
    for (const width of [661, 664, 676, 688, 715, 715, 676, 658]) {
        expect(width * HYDRA_LAB_WALK_WIDTH_SCALE).toBeGreaterThanOrEqual(723);
    }
});
