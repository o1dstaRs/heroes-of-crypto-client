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
import { BufferImageSource, Container, DOMAdapter, Texture } from "pixi.js";
import { animationAtlases } from "../generated/animation_atlases";
import { RenderableUnit } from "../scenes/RenderableUnit";
import { CREATURE_SPRITE_ANIMATION_SETTINGS, shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "./imageAssetTiers";
import { getSplitBundles } from "./PixiTextureLoader";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
    test(`Gargantuan ${team}: hit restores idle and padded death holds without changing source-pixel scale`, () => {
        const previous = CREATURE_SPRITE_ANIMATION_SETTINGS.enabled;
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        try {
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
                HoCConfig.getCreatureConfig(team, "Nature", "Gargantuan", "gargantuan_512", 1),
                grid,
                team,
                UnitVals.CREATURE,
                new AbilityFactory(effects),
                effects,
                false,
            );
            const texture = (width: number, height: number) =>
                new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width, height }) });
            const fallback = texture(768, 768);
            const atlases = Object.fromEntries(
                ["idle", "walk", "hit", "death"].map((state) => {
                    const meta = animationAtlases["Gargantuan Lab"][state];
                    return [`gargantuan_lab_${state}_atlas`, texture(meta.atlasWidth, meta.atlasHeight)];
                }),
            );
            const unit = RenderableUnit.fromBase(base, (key) => atlases[key] ?? fallback);
            const internals = unit as unknown as {
                sprite: {
                    x: number;
                    y: number;
                    rotation: number;
                    scale: { x: number; y: number };
                    anchor: { x: number; y: number };
                    texture: Texture;
                };
                oneShotAnim?: {
                    frameIndex: number;
                    authoredRealTime: boolean;
                    finished?: boolean;
                    frameDurationsMs: number[];
                };
                walkAnim?: unknown;
                recoilStartMs: number;
            };
            unit.setCreatureAnimationLabPreviewEnabled(true);
            const world = new Container();
            unit.ensureVisual(world, grid);
            const transform = () => [
                internals.sprite.x,
                internals.sprite.y,
                internals.sprite.scale.x,
                internals.sprite.scale.y,
                internals.sprite.anchor.x,
                internals.sprite.anchor.y,
            ];
            const idleTransform = transform();
            for (const reaction of ["hit", "death"] as const) {
                const key = `gargantuan_lab_${reaction}_atlas`;
                const meta = animationAtlases["Gargantuan Lab"][reaction];
                expect(unit.hasAnimationState(reaction)).toBe(true);
                expect(unit.getAnimationTextureKey(reaction)).toBe(key);
                expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
                expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
                expect(getSplitBundles({ animationsEnabled: false }).animations[key]).toBeDefined();
                expect(meta.frameCount).toBe(12);
                const canvas = reaction === "death" ? 1024 : 768;
                const pad = (canvas - 768) / 2;
                expect(meta.frameWidth).toBe(canvas);
                expect(meta.footAnchorY).toBe((720 + pad) / canvas);
                expect(meta.frameDurationsMs).toHaveLength(12);
                expect(meta.frameDurationsMs!.reduce((a, b) => a + b, 0)).toBeCloseTo(meta.totalDurationSec * 1000, 8);
                const checkSupport = () => {
                    transform()
                        .slice(0, 5)
                        .forEach((v, i) => expect(v).toBeCloseTo(idleTransform[i], 8));
                    for (const [x, y] of [
                        [335.5, 720],
                        [465, 680],
                    ]) {
                        expect((x + pad - canvas * internals.sprite.anchor.x) * internals.sprite.scale.x).toBeCloseTo(
                            (x - 768 * idleTransform[4]) * idleTransform[2],
                            8,
                        );
                        expect((y + pad - canvas * internals.sprite.anchor.y) * internals.sprite.scale.y).toBeCloseTo(
                            (y - 768 * idleTransform[5]) * idleTransform[3],
                            8,
                        );
                    }
                    expect(internals.sprite.rotation).toBe(0);
                };
                unit.startBoardWalkAnimation(Math.sign(idleTransform[2]), 3);
                let callbacks = 0;
                expect(unit.playOneShotAnimation(reaction, () => callbacks++)).toBe(true);
                expect(internals.walkAnim).toBeUndefined();
                expect(internals.oneShotAnim!.authoredRealTime).toBe(true);
                for (let frame = 0; frame < meta.frameCount; frame++) {
                    expect(internals.oneShotAnim!.frameIndex).toBe(frame);
                    expect(internals.sprite.texture.source).toBe(atlases[key].source);
                    checkSupport();
                    unit.ensureVisual(world, grid);
                    checkSupport();
                    expect(internals.oneShotAnim!.frameDurationsMs[frame]).toBeCloseTo(
                        meta.frameDurationsMs![frame] / 1.495 / (reaction === "hit" ? 1.17 : 1),
                        8,
                    );
                    unit.stepOneShotAnimation(meta.frameDurationsMs![frame] / 1.495 / (reaction === "hit" ? 1.17 : 1));
                }
                expect(callbacks).toBe(1);
                if (reaction === "death") {
                    const corpse = internals.sprite.texture;
                    expect(internals.oneShotAnim!.finished).toBe(true);
                    for (const dt of [5000, 60000]) {
                        unit.stepOneShotAnimation(dt);
                        unit.ensureVisual(world, grid);
                        expect(internals.sprite.texture).toBe(corpse);
                        expect(callbacks).toBe(1);
                        checkSupport();
                    }
                } else {
                    expect(unit.isPlayingOneShotAnimation()).toBe(false);
                    expect(internals.sprite.texture.source).toBe(atlases.gargantuan_lab_idle_atlas.source);
                }
                unit.returnToIdleAnimation(true);
                transform().forEach((v, i) => expect(v).toBeCloseTo(idleTransform[i], 8));
            }
            unit.applyHitReaction(20, 10);
            expect(unit.isPlayingOneShotAnimation("hit")).toBe(true);
            expect(internals.recoilStartMs).toBe(0);
            unit.returnToIdleAnimation(true);
            unit.setCreatureAnimationLabPreviewEnabled(false);
            // Approved lab packages now also render in normal battles.
            expect(unit.getAnimationTextureKey("hit")).toBe("gargantuan_lab_hit_atlas");
        } finally {
            CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = previous;
        }
    });
}
