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

test("boar lab actions keep idle registration, interrupt gait, restore idle and hold death", () => {
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
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Might", "Frenzied Boar", "frenzied_boar_512", 1),
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
        const actions = ["hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"];
        const atlases = Object.fromEntries(
            ["idle", "walk", ...actions].map((state) => {
                const meta = animationAtlases["Frenzied Boar Lab"][state];
                return [`frenzied_boar_lab_${state}_atlas`, texture(meta.atlasWidth, meta.atlasHeight)];
            }),
        );
        const unit = RenderableUnit.fromBase(base, (key) => atlases[key] ?? fallback);
        const state = unit as unknown as {
            sprite: {
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
        for (const reaction of actions) {
            const key = `frenzied_boar_lab_${reaction}_atlas`;
            expect(unit.hasAnimationState(reaction)).toBe(true);
            expect(unit.getAnimationTextureKey(reaction)).toBe(key);
            expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
            expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
            expect(getSplitBundles({ animationsEnabled: false }).animations[key]).toBeDefined();
            const meta = animationAtlases["Frenzied Boar Lab"][reaction];
            const paddedAttack = reaction.startsWith("melee_attack");
            expect(meta.frameWidth).toBe(paddedAttack ? 1152 : 768);
            expect(meta.frameHeight).toBe(paddedAttack ? 1152 : 768);
            const fullBodyAttackFrameCounts: Record<string, number> = {
                melee_attack: 13,
                melee_attack_up: 16,
                melee_attack_down: 13,
            };
            if (reaction in fullBodyAttackFrameCounts) {
                expect(meta.frameCount).toBe(fullBodyAttackFrameCounts[reaction]);
            }
            expect(meta.totalDurationSec).toBeCloseTo(
                reaction === "hit" ? 650 / 1.33 / 1.3 / 1000 : reaction === "death" ? 1530 / 1.33 / 1.3 / 1000 : 0.73,
                10,
            );
            expect(meta.frameDurationsMs).toHaveLength(meta.frameCount);
            expect(meta.frameDurationsMs!.reduce((a, b) => a + b, 0)).toBeCloseTo(meta.totalDurationSec * 1000, 8);
            expect(meta.footAnchorY).toBe(paddedAttack ? 935 / 1152 : 743 / 768);
            unit.startBoardWalkAnimation(1, 3);
            let callbacks = 0;
            expect(unit.playOneShotAnimation(reaction, () => callbacks++)).toBe(true);
            expect(state.walkAnim).toBeUndefined();
            const attackTransform = [...idleTransform];
            if (paddedAttack) attackTransform[5] = 935 / 1152;
            // Padding is layout only: source pixels keep the exact idle world scale,
            // including the synchronous texture swap before the next render tick.
            transform().forEach((value, index) => expect(value).toBeCloseTo(attackTransform[index], 12));
            unit.ensureVisual(world, grid);
            transform().forEach((value, index) => expect(value).toBeCloseTo(attackTransform[index], 12));
            expect(state.oneShotAnim!.authoredRealTime).toBe(true);
            for (let frame = 0; frame < meta.frameCount; frame++) {
                expect(state.oneShotAnim!.frameIndex).toBe(frame);
                expect(state.sprite.texture.source).toBe(atlases[key].source);
                transform().forEach((value, index) => expect(value).toBeCloseTo(attackTransform[index], 12));
                unit.stepOneShotAnimation(meta.frameDurationsMs![frame] / (reaction === "hit" ? 1.17 : 1));
            }
            expect(callbacks).toBe(1);
            if (reaction !== "death") {
                expect(unit.isPlayingOneShotAnimation()).toBe(false);
                expect(state.sprite.texture.source).toBe(atlases.frenzied_boar_lab_idle_atlas.source);
                expect(transform()).toEqual(idleTransform);
            } else {
                const corpse = state.sprite.texture;
                expect(state.oneShotAnim!.finished).toBe(true);
                for (const delta of [1, 5000, 60000]) {
                    unit.stepOneShotAnimation(delta);
                    unit.ensureVisual(world, grid);
                    expect(state.sprite.texture).toBe(corpse);
                    expect(transform()).toEqual(idleTransform);
                    expect(callbacks).toBe(1);
                }
            }
            unit.returnToIdleAnimation(true);
        }
        for (const [alias, canonical] of [
            ["attack", "melee_attack"],
            ["attack_up", "melee_attack_up"],
            ["attack_down", "melee_attack_down"],
        ]) {
            expect(unit.getAnimationTextureKey(alias)).toBe(`frenzied_boar_lab_${canonical}_atlas`);
            let callbacks = 0;
            expect(unit.playOneShotAnimation(alias, () => callbacks++)).toBe(true);
            unit.ensureVisual(world, grid);
            const aliasTransform = [...idleTransform];
            aliasTransform[5] = 935 / 1152;
            transform().forEach((value, index) => expect(value).toBeCloseTo(aliasTransform[index], 12));
            unit.stepOneShotAnimation(1000);
            expect(callbacks).toBe(1);
            expect(unit.isPlayingOneShotAnimation()).toBe(false);
            expect(state.sprite.texture.source).toBe(atlases.frenzied_boar_lab_idle_atlas.source);
            unit.returnToIdleAnimation(true);
        }
        unit.applyHitReaction(20, 10);
        expect(unit.isPlayingOneShotAnimation("hit")).toBe(true);
        expect(state.recoilStartMs).toBe(0);
        unit.returnToIdleAnimation(true);
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(unit.getAnimationTextureKey("hit")).toBe("frenzied_boar_lab_hit_atlas");
        expect(unit.getAnimationTextureKey("death")).toBe("frenzied_boar_lab_death_atlas");
        for (const action of actions.slice(2)) {
            expect(unit.getAnimationTextureKey(action)).toBe(`frenzied_boar_lab_${action}_atlas`);
        }
    } finally {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = previous;
    }
});
