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
import { shouldPreloadUnitAnimationAtlas, usesAuthoredRangedRelease } from "./creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "./imageAssetTiers";
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
    test(`Gargantuan ${team}: all directions release on the empty-hand cel and preserve body scale`, () => {
        const gs = new GridSettings(
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
            gs,
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
            [
                "idle",
                "walk",
                "hit",
                "death",
                "attack",
                "attack_up",
                "attack_down",
                "melee_attack",
                "melee_attack_up",
                "melee_attack_down",
            ].map((state) => {
                const m = animationAtlases["Gargantuan Lab"][state];
                return [`gargantuan_lab_${state}_atlas`, texture(m.atlasWidth, m.atlasHeight)];
            }),
        );
        const unit = RenderableUnit.fromBase(base, (key) => atlases[key] ?? fallback);
        const inner = unit as unknown as {
            sprite: {
                scale: { x: number; y: number };
                anchor: { x: number; y: number };
                texture: Texture;
                rotation: number;
            };
            oneShotAnim?: { frameIndex: number };
        };
        const world = new Container();
        unit.ensureVisual(world, gs);
        const idleScale = { x: inner.sprite.scale.x, y: inner.sprite.scale.y };
        expect(usesAuthoredRangedRelease("Gargantuan")).toBe(true);
        for (const state of ["attack", "attack_up", "attack_down"]) {
            const key = `gargantuan_lab_${state}_atlas`;
            const m = animationAtlases["Gargantuan Lab"][state];
            expect(unit.getAnimationTextureKey(state)).toBe(key);
            expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
            expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
            expect(m.releaseFrameIndex).toBe(4);
            expect(m.frameCount).toBe(8);
            let released = 0;
            let cancelled = 0;
            expect(
                unit.playGargantuanRangedThrow(
                    state,
                    () => released++,
                    () => cancelled++,
                ),
            ).toBe(true);
            for (let i = 0; i < m.frameCount; i++) {
                expect(inner.oneShotAnim?.frameIndex).toBe(i);
                expect(released).toBe(i >= 4 ? 1 : 0);
                for (const refresh of [false, true]) {
                    if (refresh) unit.ensureVisual(world, gs);
                    expect(inner.sprite.scale.x).toBeCloseTo(idleScale.x, 8);
                    expect(inner.sprite.scale.y).toBeCloseTo(idleScale.y, 8);
                    expect(inner.sprite.anchor.y).toBe(848 / 1024);
                    expect(inner.sprite.rotation).toBe(0);
                }
                unit.stepOneShotAnimation(m.frameDurationsMs![i] / 1.534);
            }
            expect(released).toBe(1);
            expect(cancelled).toBe(0);
            expect(inner.oneShotAnim).toBeUndefined();
            expect(inner.sprite.scale.x).toBeCloseTo(idleScale.x, 8);
            expect(inner.sprite.scale.y).toBeCloseTo(idleScale.y, 8);
            expect(inner.sprite.anchor.y).toBe(720 / 768);
            expect(
                unit.playGargantuanRangedThrow(
                    state,
                    () => released++,
                    () => cancelled++,
                ),
            ).toBe(true);
            unit.stepOneShotAnimation(100);
            unit.returnToIdleAnimation();
            unit.stepOneShotAnimation(3000);
            expect(released).toBe(1);
            expect(cancelled).toBe(1);
        }
        for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down"]) {
            const key = `gargantuan_lab_${state}_atlas`;
            const m = animationAtlases["Gargantuan Lab"][state];
            expect(unit.getAnimationTextureKey(state)).toBe(key);
            expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
            expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
            expect(m.releaseFrameIndex).toBeUndefined();
            expect(unit.playOneShotAnimation(state, undefined, true)).toBe(true);
            for (let i = 0; i < m.frameCount; i++) {
                expect(inner.oneShotAnim?.frameIndex).toBe(i);
                unit.ensureVisual(world, gs);
                expect(inner.sprite.scale.x).toBeCloseTo(idleScale.x, 8);
                expect(inner.sprite.scale.y).toBeCloseTo(idleScale.y, 8);
                expect(inner.sprite.anchor.y).toBe(848 / 1024);
                expect(inner.sprite.rotation).toBe(0);
                expect(inner.sprite.texture.source).toBe(atlases[key].source);
                unit.stepOneShotAnimation(m.frameDurationsMs![i] / 1.593);
            }
            expect(inner.oneShotAnim).toBeUndefined();
            expect(inner.sprite.anchor.y).toBe(720 / 768);
        }
    });
}
