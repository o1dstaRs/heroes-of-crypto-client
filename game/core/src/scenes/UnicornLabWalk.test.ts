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

test("Unicorn combat retains full-resolution frames and advances eight poses by distance only", () => {
    expect(creatureWalkAnimationEnabledForUnit("Unicorn", false)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Unicorn", true)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("unicorn_lab_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("unicorn_lab_walk_atlas")).toBe(false);
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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Nature", "Unicorn", "unicorn_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 8192, height: 8192 }),
    });
    const idle = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    const keys: string[] = [];
    const unit = RenderableUnit.fromBase(base, (key) => {
        keys.push(key);
        return key.includes("atlas") ? texture : idle;
    });
    const world = new Container();
    const state = unit as unknown as {
        walkAnim?: { frames: Texture[]; frameIndex: number };
        selectionAnimFrames: Texture[];
        selectionAnimFrameIndex: number;
        selectionAnimationStartedAtMs: number;
        sprite: Sprite;
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, grid);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("idle")).toBe("unicorn_lab_idle_atlas");
    expect(state.selectionAnimFrames).toHaveLength(6);
    expect(unit.getAnimationTextureKey("walk")).toBe("unicorn_lab_walk_atlas");
    unit.ensureVisual(world, grid);
    const idleScale = Math.abs(state.sprite.scale.y);
    // Exact frame boundaries need an integer clock origin: fractional performance.now() subtraction can round down.
    const animationStartMs = 1000;
    state.selectionAnimationStartedAtMs = animationStartMs;
    for (const [elapsed, expected] of [
        [0, 0],
        [2100, 1],
        [2250, 2],
        [2400, 3],
        [2650, 4],
        [2850, 5],
        [3000, 0],
    ]) {
        unit.stepSelectionAnimation(animationStartMs + elapsed);
        expect(state.selectionAnimFrameIndex).toBe(expected);
        expect(state.sprite.texture).toBe(state.selectionAnimFrames[expected]);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale);
    }
    unit.startBoardWalkAnimation(1, 4);
    expect(keys).toContain("unicorn_lab_walk_atlas");
    expect(state.walkAnim?.frames).toHaveLength(8);
    expect(state.walkAnim?.frames[0].width).toBe(768);
    for (let step = 0; step <= 16; step++) {
        unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
        const heights = [636, 627, 624, 615, 621, 648, 654, 633];
        expect(Math.abs(state.sprite.scale.y) * heights[step % 8]).toBeCloseTo(idleScale * 680);
        unit.ensureVisual(world, grid);
        expect(Math.abs(state.sprite.scale.y) * heights[step % 8]).toBeCloseTo(idleScale * 680);
        unit.stepSpawnAnimation(0.5);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
        if (step === 5) unit.setBoardFacingFromMovement(-1);
    }
    unit.setBoardWalkDistanceCells(2.6 + Math.SQRT2);
    expect(state.walkAnim?.frameIndex).toBe(Math.floor((2.6 + Math.SQRT2) / (1.3 / 8)) % 8);
    unit.stopBoardWalkAnimation();
    expect(state.walkAnim).toBeUndefined();
    unit.ensureVisual(world, grid);
    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.startBoardWalkAnimation(1, 0.2);
    expect(state.walkAnim?.frames).toHaveLength(8);
    unit.destroyVisuals();
    world.destroy({ children: true });
});
