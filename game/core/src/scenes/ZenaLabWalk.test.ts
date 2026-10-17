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
import { RenderableUnit, creatureWalkAnimationEnabledForUnit } from "./RenderableUnit";

beforeAll(() => {
    if (typeof document === "undefined") {
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
            querySelector: () => null,
        };
    }
});

test("Zena lab retains full-resolution frames and advances eight poses by distance only", () => {
    expect(creatureWalkAnimationEnabledForUnit("Zena", false)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Zena", true)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("zena_lab_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("zena_lab_walk_atlas")).toBe(false);
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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Might", "Zena", "zena_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 3072, height: 1536 }),
    });
    const keys: string[] = [];
    const unit = RenderableUnit.fromBase(base, (key) => {
        keys.push(key);
        return texture;
    });
    const world = new Container();
    const state = unit as unknown as {
        walkAnim?: { frames: Texture[]; frameIndex: number };
        selectionAnimFrames: Texture[];
        selectionAnimFrameIndex: number;
        zenaIdleRestStartedAtMs?: number;
        sprite: { texture: Texture };
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, grid);
    unit.startBoardWalkAnimation(1, 4);
    expect(state.walkAnim).toBeDefined();
    unit.stopBoardWalkAnimation();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    expect(unit.getAnimationTextureKey("idle")).toBe("zena_lab_idle_atlas");
    expect(state.selectionAnimFrames).toHaveLength(52);
    expect(state.selectionAnimFrames[0].width).toBe(768);
    expect(shouldPreloadUnitAnimationAtlas("zena_lab_idle_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("zena_lab_idle_atlas")).toBe(false);
    const idleStart = state.zenaIdleRestStartedAtMs!;
    unit.stepSelectionAnimation(idleStart + 5000.001);
    expect(state.selectionAnimFrameIndex).toBe(24);
    unit.stepSelectionAnimation(idleStart + 5480.001);
    expect(state.selectionAnimFrameIndex).toBe(30);
    unit.startBoardWalkAnimation(1, 4);
    expect(keys).toContain("zena_lab_walk_atlas");
    expect(state.walkAnim?.frames).toHaveLength(8);
    expect(state.walkAnim?.frames[0].width).toBe(768);
    for (const [i, frame] of state.walkAnim!.frames.entries()) {
        expect(frame.frame.x).toBe((i % 4) * 768);
        expect(frame.frame.y).toBe(Math.floor(i / 4) * 768);
        expect(frame.frame.right).toBeLessThanOrEqual(3072);
        expect(frame.frame.bottom).toBeLessThanOrEqual(1536);
    }
    const walkingTexture = state.sprite.texture;
    unit.stepSelectionAnimation(idleStart + 5640);
    expect(state.sprite.texture).toBe(walkingTexture);
    expect(state.zenaIdleRestStartedAtMs).toBeUndefined();
    for (let step = 0; step <= 16; step++) {
        unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
        unit.stepSpawnAnimation(0.5);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
        if (step === 5) unit.setBoardFacingFromMovement(-1);
    }
    unit.setBoardWalkDistanceCells(2.6 + Math.SQRT2);
    expect(state.walkAnim?.frameIndex).toBe(Math.floor((2.6 + Math.SQRT2) / (1.3 / 8)) % 8);
    unit.stopBoardWalkAnimation();
    expect(state.walkAnim).toBeUndefined();
    expect(state.selectionAnimFrameIndex).toBeLessThan(24);
    unit.stepSelectionAnimation(state.zenaIdleRestStartedAtMs! + 5000.001);
    expect(state.selectionAnimFrameIndex).toBe(24);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.startBoardWalkAnimation(1, 0.2);
    expect(state.walkAnim).toBeDefined();
    unit.stopBoardWalkAnimation();
    unit.destroyVisuals();
    world.destroy({ children: true });
});
