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
import { BufferImageSource, Container, Texture, type Sprite } from "pixi.js";
import { animationAtlases } from "../generated/animation_atlases";
import { getSplitBundles } from "../pixi/PixiTextureLoader";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import { shouldPreloadUnitAnimationAtlas } from "../pixi/creatureAnimationSettings";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../pixi/productionImageAssetPolicy";
import { RenderableUnit, creatureOneShotAnimationEnabledForUnit } from "./RenderableUnit";

beforeAll(() => {
    if (typeof document === "undefined") {
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
            querySelector: () => null,
        };
    }
});

test("Ogre Mage reactions, melee strikes and cast use full-resolution authored poses", () => {
    const atlas = animationAtlases["Ogre Mage"];
    for (const [reaction, totalMs] of [
        ["hit", 425],
        ["death", 813],
        ["melee_attack", 422],
        ["melee_attack_up", 422],
        ["melee_attack_down", 422],
        ["cast", 675],
    ] as const) {
        const meta = atlas[reaction];
        const key = `ogre_mage_${reaction}_atlas`;
        expect(meta.frameWidth).toBe(768);
        expect(meta.frameCount).toBe(8);
        expect(meta.frameDurationsMs?.reduce((sum, duration) => sum + duration, 0)).toBe(totalMs);
        expect(meta.footAnchorY).toBe(0.953125);
        expect(creatureOneShotAnimationEnabledForUnit("Ogre Mage", reaction)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey(key)).toBe(false);
        expect(getSplitBundles({ animationsEnabled: false }).animations[key]).toBeDefined();
    }

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
    const textures = new Map<string, Texture>();
    const unit = RenderableUnit.fromBase(base, (key) => {
        if (!textures.has(key)) {
            const reaction = /^ogre_mage_(hit|death|cast|melee_attack(?:_up|_down)?)_atlas$/.exec(key)?.[1];
            const meta = reaction ? atlas[reaction] : undefined;
            textures.set(
                key,
                new Texture({
                    source: new BufferImageSource({
                        resource: new Uint8Array(4),
                        width: meta?.atlasWidth ?? 768,
                        height: meta?.atlasHeight ?? 768,
                    }),
                }),
            );
        }
        return textures.get(key)!;
    });
    const root = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(root, grid);
    expect(unit.getAttackAnimationStateForTarget({ x: 1, y: 1024 }, "melee")).toBe("melee_attack");
    expect(unit.getAttackAnimationStateForTarget({ x: 1, y: 1027 }, "melee")).toBe("melee_attack_up");
    expect(unit.getAttackAnimationStateForTarget({ x: 1, y: 1021 }, "melee")).toBe("melee_attack_down");
    const state = unit as unknown as {
        sprite: Sprite;
        oneShotAnim?: {
            frames: Texture[];
            frameIndex: number;
            frameDurationsMs?: readonly number[];
            authoredRealTime?: boolean;
            finished?: boolean;
        };
    };

    for (const reaction of ["hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down", "cast"] as const) {
        expect(unit.hasAnimationState(reaction)).toBe(true);
        expect(unit.getAnimationTextureKey(reaction)).toBe(`ogre_mage_${reaction}_atlas`);
        expect(unit.playOneShotAnimation(reaction)).toBe(true);
        expect(state.oneShotAnim?.authoredRealTime).toBe(true);
        expect(state.oneShotAnim?.frameDurationsMs).toEqual(atlas[reaction].frameDurationsMs);
        expect(state.oneShotAnim?.frames).toHaveLength(8);
        expect(state.sprite.texture.width).toBe(768);
        unit.stepOneShotAnimation(atlas[reaction].frameDurationsMs![0] + 1);
        expect(state.oneShotAnim?.frameIndex).toBe(1);
        if (reaction === "death") {
            expect(state.sprite.anchor.y).toBeCloseTo(0.953125);
            unit.stepOneShotAnimation(atlas.death.frameDurationsMs!.slice(1, 6).reduce((sum, ms) => sum + ms, 0));
            expect(state.oneShotAnim?.frameIndex).toBe(6);
            expect(state.sprite.anchor.y).toBeCloseTo(0.853125);
            unit.stepOneShotAnimation(atlas.death.frameDurationsMs![6]);
            expect(state.oneShotAnim?.frameIndex).toBe(7);
            expect(state.sprite.anchor.y).toBeCloseTo(0.853125);
        }
        unit.stepOneShotAnimation(2000);
        if (reaction !== "death") {
            expect(state.oneShotAnim).toBeUndefined();
        } else {
            expect(state.oneShotAnim?.finished).toBe(true);
            expect(state.oneShotAnim?.frameIndex).toBe(7);
            expect(state.sprite.anchor.y).toBeCloseTo(0.853125);
        }
    }
    unit.destroyVisuals();
});
