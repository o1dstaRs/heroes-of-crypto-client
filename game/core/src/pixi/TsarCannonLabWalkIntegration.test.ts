import { afterAll, beforeAll, expect, test } from "bun:test";
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
import { BufferImageSource, Container, DOMAdapter, Sprite, Texture } from "pixi.js";
import { animationAtlases } from "../generated/animation_atlases";
import { images } from "../imageAssets";
import { RenderableUnit, creatureWalkAnimationEnabledForUnit } from "../scenes/RenderableUnit";
import { CREATURE_SPRITE_ANIMATION_SETTINGS, shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import {
    CANNON_REACTION_DURATIONS,
    CANNON_ATTACK_DURATIONS,
    CANNON_SHOT_RELEASE_FRAME,
    cannonReactionAtlasKey,
    cannonReactionAnchorY,
} from "../scenes/TsarCannonReactions";
import { isRedundantFullResolutionUnitAtlasKey } from "./imageAssetTiers";
import { getSplitBundles } from "./PixiTextureLoader";
import { HIT_REACTION_ADDITIONAL_SPEED } from "../settings/hitTiming";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Tsar Cannon keeps the idle artwork and effects while rolling, preserving distance cadence and stop scale", () => {
    const previous = CREATURE_SPRITE_ANIMATION_SETTINGS.enabled;
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    try {
        expect(creatureWalkAnimationEnabledForUnit("Tsar Cannon", false)).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Tsar Cannon", true)).toBe(true);
        const meta = animationAtlases["Tsar Cannon Lab"].walk;
        expect(meta.frameCount).toBe(8);
        expect(meta.frameWidth).toBe(768);
        expect(images.tsar_cannon_lab_walk_atlas).toContain("449785cd4f4268a5");
        expect(shouldPreloadUnitAnimationAtlas("tsar_cannon_lab_walk_atlas", false)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas("tsar_cannon_bronze_v14_walk_atlas", false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey("tsar_cannon_bronze_v14_walk_atlas")).toBe(false);
        expect(isRedundantFullResolutionUnitAtlasKey("tsar_cannon_lab_walk_atlas")).toBe(false);
        expect(getSplitBundles({ animationsEnabled: false }).animations.tsar_cannon_lab_walk_atlas).toBeDefined();
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
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Tsar Cannon", "tsar_cannon_512", 1),
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
        const wheelAtlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 6144, height: 6144 }),
        });
        const hitAtlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 2048 }),
        });
        const deathAtlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 3072 }),
        });
        const attackAtlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 6144 }),
        });
        const unit = RenderableUnit.fromBase(base, (key) =>
            key === "tsar_cannon_lab_walk_atlas"
                ? atlas
                : key === "tsar_cannon_bronze_v14_walk_atlas"
                  ? wheelAtlas
                  : key === "tsar_cannon_lab_v21_hit_atlas"
                    ? hitAtlas
                    : key === "tsar_cannon_lab_v21_death_atlas"
                      ? deathAtlas
                      : /^tsar_cannon_lab_v(?:26_attack|25_melee_attack)/.test(key)
                        ? attackAtlas
                        : idle,
        );
        const state = unit as unknown as {
            sprite: Sprite;
            walkAnim?: { frameIndex: number; frames: Texture[] };
            oneShotAnim?: { frameIndex: number; frames: Texture[]; finished?: boolean };
        };
        const world = new Container();
        unit.setCreatureAnimationLabPreviewEnabled(true);
        unit.ensureVisual(world, grid);
        const idleScale = Math.abs(state.sprite.scale.y);
        const smoke = world.children.find((child) => child.label === "tsar-cannon-muzzle-smoke")!;
        expect(smoke.visible).toBe(true);
        expect(unit.getAnimationTextureKey("walk")).toBe("tsar_cannon_lab_walk_atlas");
        unit.startBoardWalkAnimation(1, 4);
        expect(state.walkAnim?.frames).toHaveLength(8);
        expect(smoke.visible).toBe(false);
        expect(state.sprite.texture.source).toBe(wheelAtlas.source);
        expect(state.sprite.texture.height).toBe(768);
        for (let step = 0; step <= 16; step++) {
            unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
            expect(state.walkAnim?.frameIndex).toBe(step % 8);
            unit.ensureVisual(world, grid);
            expect(state.walkAnim?.frameIndex).toBe(step % 8);
            expect(smoke.visible).toBe(false);
            expect(state.sprite.texture.source).toBe(wheelAtlas.source);
            const spriteFrame = state.sprite.texture.frame;
            expect(spriteFrame.x / 768 + (spriteFrame.y / 768) * 8).toBe((step * 8) % 64);
        }
        unit.setBoardWalkDistanceCells(Math.SQRT2);
        const frame = Math.floor((Math.SQRT2 / 1.3) * 8) % 8;
        unit.setBoardFacingFromMovement(-1);
        unit.ensureVisual(world, grid);
        expect(state.walkAnim?.frameIndex).toBe(frame);
        unit.stopBoardWalkAnimation();
        unit.ensureVisual(world, grid);
        expect(state.walkAnim).toBeUndefined();
        expect(smoke.visible).toBe(true);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 6);
        unit.startBoardWalkAnimation(-1, 0.1);
        unit.setBoardWalkDistanceCells(0.1);
        unit.stopBoardWalkAnimation();
        unit.ensureVisual(world, grid);
        expect(state.walkAnim).toBeUndefined();
        expect(smoke.visible).toBe(true);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 6);
        const anchor = state.sprite.anchor.y;
        expect(unit.getCannonballDiameter(grid)).toBeCloseTo(Math.abs(state.sprite.scale.x) * 112 * 1.1, 6);
        for (const action of ["attack", "attack_up", "attack_down"] as const) {
            let released = 0,
                cancelled = 0;
            expect(unit.getAnimationTextureKey(action)).toBe(cannonReactionAtlasKey(action));
            expect(
                unit.playCannonLabRangedShot(
                    action,
                    () => released++,
                    () => cancelled++,
                ),
            ).toBe(true);
            unit.ensureVisual(world, grid);
            expect(state.sprite.texture.source).toBe(attackAtlas.source);
            expect(state.sprite.anchor.y).toBeCloseTo(cannonReactionAnchorY(anchor));
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 6);
            for (let i = 0; i < CANNON_ATTACK_DURATIONS.length; i++) {
                unit.ensureVisual(world, grid);
                expect(state.sprite.texture.source).toBe(attackAtlas.source);
                expect(state.sprite.anchor.y).toBeCloseTo(cannonReactionAnchorY(anchor));
                expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 6);
                expect(
                    state.sprite.filters?.some((filter) => filter.resources.uBase === wheelAtlas.source) ?? false,
                ).toBe(false);
                expect(released).toBe(i >= CANNON_SHOT_RELEASE_FRAME ? 1 : 0);
                unit.stepOneShotAnimation(CANNON_ATTACK_DURATIONS[i]);
            }
            expect(released).toBe(1);
            expect(cancelled).toBe(0);
            unit.returnToIdleAnimation();
            unit.ensureVisual(world, grid);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 6);
            expect(
                unit.playCannonLabRangedShot(
                    action,
                    () => released++,
                    () => cancelled++,
                ),
            ).toBe(true);
            unit.returnToIdleAnimation();
            expect(released).toBe(1);
            expect(cancelled).toBe(1);
            unit.ensureVisual(world, grid);
        }
        for (const action of ["melee_attack", "melee_attack_up", "melee_attack_down"] as const) {
            const key = cannonReactionAtlasKey(action);
            expect(key).toContain("v25_melee_attack");
            expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
            expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
            expect(unit.playOneShotAnimation(action, undefined, true)).toBe(true);
            for (let frame = 0; frame < CANNON_ATTACK_DURATIONS.length; frame++) {
                unit.ensureVisual(world, grid);
                expect(state.sprite.texture.source).toBe(attackAtlas.source);
                expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 6);
                expect(state.sprite.anchor.y).toBeCloseTo(cannonReactionAnchorY(anchor));
                unit.stepOneShotAnimation(CANNON_ATTACK_DURATIONS[frame]);
            }
            unit.returnToIdleAnimation();
            unit.ensureVisual(world, grid);
        }
        for (const action of ["hit", "death"] as const) {
            const reactionAtlas = action === "hit" ? hitAtlas : deathAtlas;
            const key = cannonReactionAtlasKey(action);
            expect(unit.getAnimationTextureKey(action)).toBe(key);
            expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
            expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
            expect(unit.playOneShotAnimation(action, undefined, true)).toBe(true);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 6);
            expect(state.sprite.anchor.y).toBeCloseTo(cannonReactionAnchorY(anchor));
            unit.ensureVisual(world, grid);
            expect(state.sprite.texture.source).toBe(reactionAtlas.source);
            expect(state.sprite.anchor.y).toBeCloseTo(cannonReactionAnchorY(anchor));
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 6);
            expect(state.sprite.filters?.some((filter) => filter.resources.uBase === wheelAtlas.source) ?? false).toBe(
                false,
            );
            const durations = CANNON_REACTION_DURATIONS[action];
            expect(durations.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(
                action === "hit" ? 400 / 2.25 / 1.4 : 1150 / 2.25 / 1.3 / 1.2,
                6,
            );
            expect(state.oneShotAnim?.frames.length).toBe(durations.length);
            const runtimeDurations = durations.map((ms) => ms / (action === "hit" ? HIT_REACTION_ADDITIONAL_SPEED : 1));
            for (let frame = 0; frame < durations.length - 1; frame++) {
                unit.stepOneShotAnimation(runtimeDurations[frame]);
                expect(state.sprite.texture.source).toBe(reactionAtlas.source);
                expect(state.oneShotAnim?.frameIndex).toBe(frame + 1);
                unit.ensureVisual(world, grid);
                expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 6);
                expect(state.sprite.anchor.y).toBeCloseTo(cannonReactionAnchorY(anchor));
            }
            unit.stepOneShotAnimation(runtimeDurations.at(-1)! + 10);
            if (action === "death") {
                expect(state.oneShotAnim?.finished).toBe(true);
                const corpse = state.sprite.texture;
                unit.stepOneShotAnimation(5000);
                unit.ensureVisual(world, grid);
                expect(state.sprite.texture).toBe(corpse);
            } else {
                expect(unit.isPlayingOneShotAnimation()).toBe(false);
                expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 6);
                expect(state.sprite.anchor.y).toBeCloseTo(anchor);
                unit.ensureVisual(world, grid);
                expect(state.sprite.texture.source).toBe(wheelAtlas.source);
            }
            unit.returnToIdleAnimation();
            unit.ensureVisual(world, grid);
        }
    } finally {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = previous;
    }
});
