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
import { BufferImageSource, Container, Texture } from "pixi.js";

import { animationAtlases } from "../generated/animation_atlases";
import { images } from "../imageAssets";
import { RenderableUnit, creatureWalkAnimationEnabledForUnit } from "../scenes/RenderableUnit";
import { GARGANTUAN_LAB_WALK_SCALE_X, GARGANTUAN_LAB_WALK_SCALE_Y } from "../scenes/GargantuanLabWalkVisuals";
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

test("Gargantuan lab loads native frames, advances by distance and restores idle scale", () => {
    const previous = CREATURE_SPRITE_ANIMATION_SETTINGS.enabled;
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    try {
        expect(creatureWalkAnimationEnabledForUnit("Gargantuan", false)).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Gargantuan", true)).toBe(true);
        const meta = animationAtlases["Gargantuan Lab"].walk;
        expect(meta.frameCount).toBe(8);
        expect(meta.frameWidth).toBe(768);
        expect(meta.frameHeight).toBe(768);
        expect(meta.footAnchorY).toBe(0.9251302083333334);
        expect(shouldPreloadUnitAnimationAtlas("gargantuan_lab_walk_atlas", false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey("gargantuan_lab_walk_atlas")).toBe(false);
        expectApprovedAtlasRevision(
            images.gargantuan_lab_walk_atlas,
            "animations/output/gargantuan_lab_walk/atlas/gargantuan_lab_walk_atlas.webp",
            "626748017bd92150643d7b92c10d95228064bc9485a54e90b4f95d87df003dd4",
        );
        expect(getSplitBundles({ animationsEnabled: false }).animations.gargantuan_lab_walk_atlas).toBeDefined();
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
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Nature", "Gargantuan", "gargantuan_512", 1),
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
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 3072, height: 1536 }),
        });
        const idleAtlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 3072, height: 3072 }),
        });
        const unit = RenderableUnit.fromBase(base, (key) =>
            key === "gargantuan_lab_walk_atlas" ? atlas : key === "gargantuan_lab_idle_atlas" ? idleAtlas : idle,
        );
        const state = unit as unknown as {
            sprite: {
                scale: { x: number; y: number };
                anchor: { x: number; y: number };
                texture: Texture;
                filters: unknown[] | null;
            };
            walkAnim: { frameIndex: number };
            selectionAnimationStartedAtMs: number;
            selectionAnimFrameIndex: number;
            selectionAnimFrames: Texture[];
        };
        unit.setCreatureAnimationLabPreviewEnabled(true);
        const world = new Container();
        unit.ensureVisual(world, grid);
        const idleScale = Math.abs(state.sprite.scale.y);
        const idleScaleX = Math.abs(state.sprite.scale.x);
        const idleMeta = animationAtlases["Gargantuan Lab"].idle;
        expect(shouldPreloadUnitAnimationAtlas("gargantuan_lab_idle_atlas", false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey("gargantuan_lab_idle_atlas")).toBe(false);
        expect(getSplitBundles({ animationsEnabled: false }).idleAtlases.gargantuan_lab_idle_atlas).toBeDefined();
        expect(unit.getAnimationTextureKey("idle")).toBe("gargantuan_lab_idle_atlas");
        expect(unit.hasAnimationState("idle")).toBe(true);
        expect(idleMeta.frameCount).toBe(16);
        const durations = idleMeta.frameDurationsMs!;
        const loopDurationMs = durations.reduce((total, ms) => total + ms, 0);
        expect(loopDurationMs).toBeCloseTo(2560 / 0.7, 8);
        expect(durations.every((duration) => Math.abs(duration - 160 / 0.7) < 1e-9)).toBe(true);
        let elapsed = 0;
        for (let cycle = 0; cycle < 2; cycle++) {
            for (let frame = 0; frame < durations.length; frame++) {
                unit.stepSelectionAnimation(state.selectionAnimationStartedAtMs + elapsed + 0.1);
                expect(state.selectionAnimFrameIndex).toBe(frame);
                expect(state.sprite.texture.width).toBe(768);
                expect(state.sprite.texture.height).toBe(768);
                expect(state.sprite.anchor.y).toBe(idleMeta.footAnchorY!);
                expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
                expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
                elapsed += durations[frame];
            }
        }
        unit.startBoardWalkAnimation(1, 3);
        expect(state.sprite.texture.height).toBe(768);
        // Guard against an idle-to-walk enlargement, not merely against changing calibration values.
        expect(Math.abs(state.sprite.scale.y) * 768).toBeCloseTo(idleScale * idle.height, 8);
        expect(Math.abs(state.sprite.scale.x) * 768).toBeCloseTo(idleScaleX * idle.width, 8);
        expect(GARGANTUAN_LAB_WALK_SCALE_X).toBe(1);
        expect(GARGANTUAN_LAB_WALK_SCALE_Y).toBe(1);
        expect(state.sprite.filters?.length).toBe(1);
        const walkScaleY = Math.abs(state.sprite.scale.y);
        const walkScaleX = Math.abs(state.sprite.scale.x);
        for (let step = 0; step <= 16; step++) {
            unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
            expect(state.walkAnim.frameIndex).toBe(step % 8);
            unit.ensureVisual(world, grid);
            expect(state.walkAnim.frameIndex).toBe(step % 8);
            expect(state.sprite.anchor.x).toBe(0.5);
            expect(state.sprite.anchor.y).toBe(meta.footAnchorY!);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(walkScaleY, 8);
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(walkScaleX, 8);
        }
        unit.startBoardWalkAnimation(-1, 1);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(walkScaleY, 8);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(walkScaleX, 8);
        unit.setBoardWalkDistanceCells(Math.SQRT2);
        const diagonalPhase = Math.floor((Math.SQRT2 / 1.3) * 8) % 8;
        expect(state.walkAnim.frameIndex).toBe(diagonalPhase);
        unit.setBoardFacingFromMovement(1);
        unit.ensureVisual(world, grid);
        expect(state.walkAnim.frameIndex).toBe(diagonalPhase);
        unit.stopBoardWalkAnimation();
        expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
        expect(state.sprite.filters?.length ?? 0).toBe(0);
        // Repeated route changes must neither accumulate scale nor enlarge the next walk.
        for (let move = 0; move < 6; move++) {
            unit.startBoardWalkAnimation(move % 2 ? -1 : 1, 2);
            unit.setBoardWalkDistanceCells(0.65);
            unit.ensureVisual(world, grid);
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
            unit.startBoardWalkAnimation(move % 2 ? 1 : -1, 2);
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
            unit.stopBoardWalkAnimation();
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
        }
        unit.startBoardWalkAnimation(1, 1);
        unit.returnToIdleAnimation();
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
        expect(state.sprite.filters?.length ?? 0).toBe(0);
    } finally {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = previous;
    }
});
