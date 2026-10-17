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
import { RenderableUnit } from "./RenderableUnit";

beforeAll(() => {
    if (typeof document === "undefined") {
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
            querySelector: () => null,
        };
    }
});

test("Ogre Mage lab idle runs at 85% speed using native sprite frames", () => {
    const meta = animationAtlases["Ogre Mage"].idle;
    const durations = meta.frameDurationsMs!;
    expect(meta.frameWidth).toBe(768);
    expect(meta.frameCount).toBe(15);
    expect(durations.reduce((sum, duration) => sum + duration, 0)).toBe(5882);
    expect(shouldPreloadUnitAnimationAtlas("ogre_mage_idle_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("ogre_mage_idle_atlas")).toBe(false);
    expect(getSplitBundles({ animationsEnabled: false }).animations.ogre_mage_idle_atlas).toBeDefined();

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
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, grid);
    const state = unit as unknown as {
        sprite: { texture: Texture };
        selectionAnimFrames: Texture[];
        selectionAnimFrameIndex: number;
        selectionAnimationStartedAtMs: number;
    };

    unit.setCreatureAnimationLabPreviewEnabled(true);
    expect(keys).toContain("ogre_mage_idle_atlas");
    expect(state.selectionAnimFrames).toHaveLength(15);
    expect(state.selectionAnimFrames[0].width).toBe(768);

    const start = state.selectionAnimationStartedAtMs;
    const at = (elapsedMs: number) => {
        unit.stepSelectionAnimation(start + elapsedMs);
        expect(state.sprite.texture).toBe(state.selectionAnimFrames[state.selectionAnimFrameIndex]);
        return state.selectionAnimFrameIndex;
    };
    expect(at(0)).toBe(0);
    expect(at(529)).toBe(1);
    expect(at(3800)).toBe(9); // free hand rises
    expect(at(4100)).toBe(10); // fingers meet the beard
    expect(at(4400)).toBe(11); // downward stroke
    expect(at(5882)).toBe(0);
    expect(at(11764)).toBe(0);

    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(state.selectionAnimFrames).toHaveLength(1);
    unit.destroyVisuals();
    world.destroy({ children: true });
});
