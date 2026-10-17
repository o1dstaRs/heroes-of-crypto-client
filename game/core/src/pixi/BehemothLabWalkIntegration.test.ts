import { expect, test } from "bun:test";
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
import { CREATURE_SPRITE_ANIMATION_SETTINGS, shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import { BEHEMOTH_LAB_WALK_SCALE_X, BEHEMOTH_LAB_WALK_SCALE_Y } from "../scenes/BehemothLabWalkCalibration";
import { isRedundantFullResolutionUnitAtlasKey } from "./imageAssetTiers";
import { getSplitBundles } from "./PixiTextureLoader";

test.each([false, true])("Behemoth preserves its full approved package in production=%s", (production) => {
    expect(BEHEMOTH_LAB_WALK_SCALE_X).toBe(BEHEMOTH_LAB_WALK_SCALE_Y);
    const previous = CREATURE_SPRITE_ANIMATION_SETTINGS.enabled;
    const previousApproved = CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled;
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = production;
    try {
        expect(creatureWalkAnimationEnabledForUnit("Behemoth", false)).toBe(production);
        expect(creatureWalkAnimationEnabledForUnit("Behemoth", true)).toBe(true);
        const meta = animationAtlases["Behemoth Lab"].walk;
        expect(meta.frameCount).toBe(40);
        expect(meta.frameWidth).toBe(1024);
        expect(meta.footAnchorY).toBe(988.5 / 1024);
        expect(animationAtlases["Behemoth Lab"].death.totalDurationSec).toBeCloseTo(1.76 / 1.2 ** 2, 8);
        expect(shouldPreloadUnitAnimationAtlas("behemoth_lab_walk_atlas", false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey("behemoth_lab_walk_atlas")).toBe(false);
        expect(images.behemoth_lab_walk_atlas).toContain("98892f83e6e82da3");
        expect(getSplitBundles({ animationsEnabled: false }).animations.behemoth_lab_walk_atlas).toBeDefined();
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
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Might", "Behemoth", "behemoth_512", 1),
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
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 10240 }),
        });
        const idleAtlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 3840, height: 7680 }),
        });
        const hitAtlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 3072, height: 1536 }),
        });
        const deathAtlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 3072, height: 2304 }),
        });
        const actionStates = ["melee_attack_up", "melee_attack", "melee_attack_down", "cast"] as const;
        const actionTextures = Object.fromEntries(
            actionStates.map((action) => {
                const actionMeta = animationAtlases["Behemoth Lab"][action];
                return [
                    `behemoth_lab_${action}_atlas`,
                    new Texture({
                        source: new BufferImageSource({
                            resource: new Uint8Array(4),
                            width: actionMeta.atlasWidth,
                            height: actionMeta.atlasHeight,
                        }),
                    }),
                ];
            }),
        );
        const unit = RenderableUnit.fromBase(base, (key) =>
            key === "behemoth_lab_walk_atlas"
                ? atlas
                : key === "behemoth_lab_idle_atlas"
                  ? idleAtlas
                  : key === "behemoth_lab_hit_atlas"
                    ? hitAtlas
                    : key === "behemoth_lab_death_atlas"
                      ? deathAtlas
                      : (actionTextures[key] ?? idle),
        );
        const state = unit as unknown as {
            sprite: {
                x: number;
                y: number;
                scale: { x: number; y: number };
                anchor: { x: number; y: number };
                texture: Texture;
            };
            walkAnim: { frameIndex: number };
            oneShotAnim?: { frameIndex: number; authoredRealTime: boolean; finished?: boolean };
        };
        unit.setCreatureAnimationLabPreviewEnabled(!production);
        const root = new Container();
        unit.ensureVisual(root, grid);
        const neutral = state.sprite.texture;
        expect(unit.hasAnimationState("idle")).toBe(true);
        const idleScale = Math.abs(state.sprite.scale.y);
        const idleScaleX = Math.abs(state.sprite.scale.x);
        unit.startBoardWalkAnimation(1, 3);
        expect(state.sprite.texture.height).toBe(1024);
        const walkScaleX = ((idleScaleX * 768) / 1024) * BEHEMOTH_LAB_WALK_SCALE_X;
        const walkScaleY = ((idleScale * 768) / 1024) * BEHEMOTH_LAB_WALK_SCALE_Y;
        // Transparent padding must never reduce the creature's actual pixel scale.
        expect(walkScaleX).toBeCloseTo(idleScaleX, 8);
        expect(walkScaleY).toBeCloseTo(idleScale, 8);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(walkScaleX, 8);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(walkScaleY, 8);
        unit.startBoardWalkAnimation(1, 3);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(walkScaleX, 8);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(walkScaleY, 8);
        for (let step = 0; step <= 80; step++) {
            unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
            expect(state.walkAnim.frameIndex).toBe(step % 40);
            unit.ensureVisual(root, grid);
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(walkScaleX, 8);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(walkScaleY, 8);
        }
        unit.stopBoardWalkAnimation();
        expect(state.sprite.texture.source).toBe(neutral.source);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
        // An impact can interrupt a gait without inheriting a gait scale or stale anchor.
        unit.startBoardWalkAnimation(1, 3);
        let hitCompleted = 0;
        expect(unit.playOneShotAnimation("hit", () => hitCompleted++)).toBe(true);
        expect(state.walkAnim).toBeUndefined();
        expect(state.oneShotAnim?.authoredRealTime).toBe(true);
        expect(unit.getAnimationTextureKey("hit")).toBe("behemoth_lab_hit_atlas");
        expect(state.sprite.texture.source).toBe(hitAtlas.source);
        for (const [frame, duration] of animationAtlases["Behemoth Lab"].hit.frameDurationsMs!.entries()) {
            expect(state.oneShotAnim?.frameIndex).toBe(frame);
            unit.ensureVisual(root, grid);
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
            unit.stepOneShotAnimation(duration / 1.17 + 0.00001);
        }
        expect(hitCompleted).toBe(1);
        expect(state.oneShotAnim).toBeUndefined();
        expect(state.sprite.texture.source).toBe(neutral.source);
        unit.ensureVisual(root, grid);
        const plantedPosition = { x: state.sprite.x, y: state.sprite.y };
        for (const action of actionStates) {
            const actionMeta = animationAtlases["Behemoth Lab"][action];
            const key = `behemoth_lab_${action}_atlas`;
            let completed = 0;
            unit.startBoardWalkAnimation(1, 3);
            expect(unit.hasAnimationState(action)).toBe(true);
            expect(unit.playOneShotAnimation(action, () => completed++)).toBe(true);
            expect(state.walkAnim).toBeUndefined();
            expect(unit.getAnimationTextureKey(action)).toBe(key);
            expect(state.sprite.texture.source).toBe(actionTextures[key].source);
            expect(state.oneShotAnim?.authoredRealTime).toBe(true);
            expect(state.sprite.texture.height).toBe(1280);
            // Adding transparent room for a swing must keep the body at the same scale.
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
            for (const [frame, duration] of actionMeta.frameDurationsMs!.entries()) {
                expect(state.oneShotAnim?.frameIndex).toBe(frame);
                unit.ensureVisual(root, grid);
                expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
                expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
                expect(state.sprite.anchor.x).toBe(0.5);
                expect(state.sprite.anchor.y).toBe(actionMeta.footAnchorY!);
                expect(state.sprite.x).toBeCloseTo(plantedPosition.x, 8);
                expect(state.sprite.y).toBeCloseTo(plantedPosition.y, 8);
                // The authored idle entry/exit is padded by (256, 503). Its ground
                // contact must map to the same world point on either canvas.
                if (frame === 0 || frame === actionMeta.frameCount - 1) {
                    const actionContactX = 344 - state.sprite.anchor.x * actionMeta.frameWidth;
                    const idleContactX = 88 - 0.5 * 768;
                    const actionContactY = 1178 - state.sprite.anchor.y * actionMeta.frameHeight;
                    const idleContactY = 675 - animationAtlases["Behemoth Lab"].idle.footAnchorY! * 768;
                    expect(actionContactX).toBeCloseTo(idleContactX, 8);
                    expect(actionContactY).toBeCloseTo(idleContactY, 8);
                }
                unit.stepOneShotAnimation(duration + 0.00001);
            }
            expect(completed).toBe(1);
            expect(state.oneShotAnim).toBeUndefined();
            expect(state.sprite.texture.source).toBe(neutral.source);
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
            unit.ensureVisual(root, grid);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
            expect(state.sprite.x).toBeCloseTo(plantedPosition.x, 8);
            expect(state.sprite.y).toBeCloseTo(plantedPosition.y, 8);
            expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
            expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
            expect(getSplitBundles({ animationsEnabled: false }).animations[key]).toBeDefined();
        }
        // Switching actions mid-cast must neither multiply canvas compensation nor leave a stale pose.
        expect(unit.playOneShotAnimation("cast")).toBe(true);
        unit.stepOneShotAnimation(300);
        expect(unit.playOneShotAnimation("attack_up")).toBe(true);
        expect(unit.getAnimationTextureKey("attack_up")).toBe("behemoth_lab_melee_attack_up_atlas");
        unit.ensureVisual(root, grid);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
        unit.stepOneShotAnimation(10000);
        expect(state.oneShotAnim).toBeUndefined();
        expect(state.sprite.texture.source).toBe(neutral.source);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
        let deathCompleted = 0;
        expect(unit.playOneShotAnimation("death", () => deathCompleted++)).toBe(true);
        expect(unit.getAnimationTextureKey("death")).toBe("behemoth_lab_death_atlas");
        for (const [frame, duration] of animationAtlases["Behemoth Lab"].death.frameDurationsMs!.entries()) {
            expect(state.oneShotAnim?.frameIndex).toBe(frame);
            unit.ensureVisual(root, grid);
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
            unit.stepOneShotAnimation(duration + 0.00001);
        }
        expect(deathCompleted).toBe(1);
        expect(state.oneShotAnim?.finished).toBe(true);
        expect(state.oneShotAnim?.frameIndex).toBe(11);
        const corpse = state.sprite.texture;
        unit.stepOneShotAnimation(10000);
        unit.ensureVisual(root, grid);
        expect(deathCompleted).toBe(1);
        expect(state.sprite.texture).toBe(corpse);
        unit.returnToIdleAnimation();
        unit.ensureVisual(root, grid);
        expect(state.sprite.texture.source).toBe(neutral.source);
        for (const key of ["behemoth_lab_hit_atlas", "behemoth_lab_death_atlas"]) {
            expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
            expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
            expect(getSplitBundles({ animationsEnabled: false }).animations[key]).toBeDefined();
        }
    } finally {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = previous;
        CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = previousApproved;
    }
});
