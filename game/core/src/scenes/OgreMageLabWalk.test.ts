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
import { getSplitBundles } from "../pixi/PixiTextureLoader";
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

test("Ogre Mage lab walk uses eight full-resolution poses at the board's 1.3-cell cadence", () => {
    expect(creatureWalkAnimationEnabledForUnit("Ogre Mage", false)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Ogre Mage", true)).toBe(true);
    expect(animationAtlases["Ogre Mage"].walk.frameCount).toBe(8);
    expect(animationAtlases["Ogre Mage"].walk.frameWidth).toBe(768);
    expect(shouldPreloadUnitAnimationAtlas("ogre_mage_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("ogre_mage_walk_atlas")).toBe(false);
    expect(getSplitBundles({ animationsEnabled: false }).animations.ogre_mage_walk_atlas).toBeDefined();

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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Might", "Ogre Mage", "ogre_mage_512", 1),
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
    const keys: string[] = [];
    const unit = RenderableUnit.fromBase(base, (key) => {
        keys.push(key);
        return texture;
    });
    const world = new Container();
    const state = unit as unknown as { walkAnim?: { frames: Texture[]; frameIndex: number } };
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, grid);
    unit.startBoardWalkAnimation(1, 4);
    expect(state.walkAnim).toBeDefined();
    unit.stopBoardWalkAnimation();

    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.startBoardWalkAnimation(1, 4);
    expect(keys).toContain("ogre_mage_walk_atlas");
    expect(state.walkAnim?.frames).toHaveLength(8);
    expect(state.walkAnim?.frames[0].width).toBe(768);
    for (let step = 0; step <= 16; step++) {
        unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
        unit.stepSpawnAnimation(0.5);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
    }
    unit.stopBoardWalkAnimation();
    expect(state.walkAnim).toBeUndefined();
    unit.destroyVisuals();
    world.destroy({ children: true });
});
