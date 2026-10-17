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
import { HYDRA_LAB_REACTION_SPEED, hydraLabAtlasState } from "../scenes/HydraLabReactions";
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

test("Hydra combat preserves world-space supports through actions, refreshes and return to idle", () => {
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
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Chaos", "Hydra", "hydra_512", 1),
            grid,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        );
        const texture = (width: number, height: number) =>
            new Texture({
                source: new BufferImageSource({ resource: new Uint8Array(4), width, height }),
            });
        const fallback = texture(768, 768);
        const atlases = Object.fromEntries(
            ["idle", "walk", "hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"].map((state) => {
                const meta = animationAtlases["Hydra Lab"][state];
                return [`hydra_lab_${state}_atlas`, texture(meta.atlasWidth, meta.atlasHeight)];
            }),
        );
        const unit = RenderableUnit.fromBase(base, (key) => atlases[key] ?? fallback);
        const state = unit as unknown as {
            sprite: {
                filters: readonly unknown[] | null;
                x: number;
                y: number;
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
            state.sprite.x,
            state.sprite.y,
            state.sprite.scale.x,
            state.sprite.scale.y,
            state.sprite.anchor.x,
            state.sprite.anchor.y,
        ];
        const idleTransform = transform();
        for (const reaction of ["hit", "melee_attack", "melee_attack_up", "melee_attack_down", "death"] as const) {
            const key = `hydra_lab_${hydraLabAtlasState(reaction)}_atlas`;
            expect(unit.hasAnimationState(reaction)).toBe(true);
            expect(unit.getAnimationTextureKey(reaction)).toBe(key);
            expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
            expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
            expect(getSplitBundles({ animationsEnabled: false }).animations[key]).toBeDefined();
            const meta = animationAtlases["Hydra Lab"][hydraLabAtlasState(reaction)];
            const attack = reaction.startsWith("melee_attack");
            const speed =
                reaction === "hit" || reaction === "death"
                    ? HYDRA_LAB_REACTION_SPEED[reaction]
                    : HYDRA_LAB_REACTION_SPEED.melee_attack;
            const expectTransform = () => {
                transform()
                    .slice(0, 5)
                    .forEach((v, i) => expect(v).toBeCloseTo(idleTransform[i], 8));
                const canvas = attack ? 1024 : 768;
                const pad = attack ? 128 : 0;
                // Compare actual source-pixel supports in world space, including padding/anchor compensation.
                for (const [x, y] of [
                    [213, 703],
                    [410, 715],
                    [580, 699],
                ]) {
                    expect((x + pad - canvas * state.sprite.anchor.x) * state.sprite.scale.x).toBeCloseTo(
                        (x - 768 * idleTransform[4]) * idleTransform[2],
                        8,
                    );
                    expect((y + pad - canvas * state.sprite.anchor.y) * state.sprite.scale.y).toBeCloseTo(
                        (y - 768 * idleTransform[5]) * idleTransform[3],
                        8,
                    );
                }
            };
            expect(meta.frameWidth).toBe(attack ? 1024 : 768);
            expect(meta.frameDurationsMs).toHaveLength(meta.frameCount);
            expect(meta.frameDurationsMs!.reduce((a, b) => a + b, 0)).toBeCloseTo(meta.totalDurationSec * 1000, 8);
            expect(meta.footAnchorY).toBe(attack ? 858 / 1024 : 730 / 768);
            if (attack) {
                expect(unit.getAnimationTextureKey(reaction.replace("melee_", ""))).toBe(key);
                expect(meta.frameCount).toBe(18);
                expect(speed / 1.13).toBeCloseTo(1.77, 10);
            }
            unit.startBoardWalkAnimation(1, 3);
            let callbacks = 0;
            expect(unit.playOneShotAnimation(reaction, () => callbacks++)).toBe(true);
            expect(state.walkAnim).toBeUndefined();
            unit.ensureVisual(world, grid);
            expectTransform();
            expect(state.oneShotAnim!.authoredRealTime).toBe(true);
            expect(state.sprite.filters ?? []).toHaveLength(0);
            for (let frame = 0; frame < meta.frameCount; frame++) {
                expect(state.oneShotAnim!.frameIndex).toBe(frame);
                expect(state.sprite.texture.source).toBe(atlases[key].source);
                expectTransform();
                // Frame registration is baked; render refreshes must never resize the figure.
                unit.ensureVisual(world, grid);
                expectTransform();
                expect(state.oneShotAnim!.frameDurationsMs[frame]).toBeCloseTo(
                    meta.frameDurationsMs![frame] / speed,
                    9,
                );
                unit.stepOneShotAnimation(state.oneShotAnim!.frameDurationsMs[frame]);
            }
            expect(callbacks).toBe(1);
            if (reaction !== "death") {
                expect(unit.isPlayingOneShotAnimation()).toBe(false);
                expect(state.sprite.filters ?? []).toHaveLength(1);
                expect(state.sprite.texture.source).toBe(atlases.hydra_lab_idle_atlas.source);
            } else {
                const corpse = state.sprite.texture;
                expect(state.oneShotAnim!.finished).toBe(true);
                for (const delta of [1, 5000, 60000]) {
                    unit.stepOneShotAnimation(delta);
                    unit.ensureVisual(world, grid);
                    expect(state.sprite.texture).toBe(corpse);
                    expect(state.sprite.filters ?? []).toHaveLength(0);
                    expectTransform();
                    expect(callbacks).toBe(1);
                }
            }
            unit.returnToIdleAnimation(true);
            transform().forEach((v, i) => expect(v).toBeCloseTo(idleTransform[i], 8));
        }
        unit.applyHitReaction(20, 10);
        expect(unit.isPlayingOneShotAnimation("hit")).toBe(true);
        expect(state.recoilStartMs).toBe(0);
        unit.returnToIdleAnimation(true);
        unit.setCreatureAnimationLabPreviewEnabled(false);
        // Approved creature animations now remain active in combat as well as the lab.
        expect(unit.getAnimationTextureKey("hit")).toBe("hydra_lab_hit_atlas");
        expect(unit.getAnimationTextureKey("death")).toBe("hydra_lab_death_atlas");
        for (const attack of ["attack", "attack_up", "attack_down"]) {
            expect(unit.getAnimationTextureKey(attack)).toBe("hydra_lab_melee_attack_atlas");
        }
    } finally {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = previous;
    }
});
