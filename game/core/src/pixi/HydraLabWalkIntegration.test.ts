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
import { HYDRA_LAB_WALK_WIDTH_SCALE, HYDRA_LAB_WALK_HEIGHT_SCALE } from "../scenes/HydraLabWalkPalette";
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
