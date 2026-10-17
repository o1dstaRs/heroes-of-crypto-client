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
import { images } from "../imageAssets";
import { RenderableUnit, creatureWalkAnimationEnabledForUnit } from "../scenes/RenderableUnit";
import { CREATURE_SPRITE_ANIMATION_SETTINGS, shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "./imageAssetTiers";
import { getSplitBundles } from "./PixiTextureLoader";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Frenzied Boar lab loads native frames, advances by distance and restores idle scale", () => {
    const previous = CREATURE_SPRITE_ANIMATION_SETTINGS.enabled;
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    try {
        expect(creatureWalkAnimationEnabledForUnit("Frenzied Boar", false)).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Frenzied Boar", true)).toBe(true);
        const meta = animationAtlases["Frenzied Boar Lab"].walk;
        expect(meta.frameCount).toBe(8);
        expect(meta.frameWidth).toBe(1024);
        expect(shouldPreloadUnitAnimationAtlas("frenzied_boar_lab_walk_atlas", false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey("frenzied_boar_lab_walk_atlas")).toBe(false);
        expect(shouldPreloadUnitAnimationAtlas("frenzied_boar_lab_idle_atlas", false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey("frenzied_boar_lab_idle_atlas")).toBe(false);
        expect(animationAtlases["Frenzied Boar Lab"].idle.frameCount).toBe(48);
        expect(animationAtlases["Frenzied Boar Lab"].idle.totalDurationSec).toBe(6.4);
        expect(animationAtlases["Frenzied Boar Lab"].idle.fps).toBe(7.5);
        expect(animationAtlases["Frenzied Boar Lab"].idle.frameDurationsMs).toHaveLength(48);
        expect(animationAtlases["Frenzied Boar Lab"].idle.frameDurationsMs?.[0]).toBeCloseTo(1000 / 7.5, 8);
        expect(images.frenzied_boar_lab_walk_atlas).toContain("267d0061b7b9f23e");
        expect(getSplitBundles({ animationsEnabled: false }).animations.frenzied_boar_lab_walk_atlas).toBeDefined();
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
        const idle = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
        });
        const atlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 2048 }),
        });
        const idleAtlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 3840, height: 7680 }),
        });
        const unit = RenderableUnit.fromBase(base, (key) =>
            key === "frenzied_boar_lab_walk_atlas" ? atlas : key === "frenzied_boar_lab_idle_atlas" ? idleAtlas : idle,
        );
        const state = unit as unknown as {
            sprite: {
                scale: { x: number; y: number };
                anchor: { x: number; y: number };
                x: number;
                y: number;
                texture: Texture;
            };
            walkAnim: { frameIndex: number };
            selectionAnimationStartedAtMs: number;
            selectionAnimFrameIndex: number;
        };
        unit.setCreatureAnimationLabPreviewEnabled(true);
        const world = new Container();
        unit.ensureVisual(world, grid);
        expect(unit.hasAnimationState("idle")).toBe(true);
        expect(unit.getAnimationTextureKey("idle")).toBe("frenzied_boar_lab_idle_atlas");
        const idleScale = Math.abs(state.sprite.scale.y);
        for (const elapsed of [0, 134, 3210, 6399, 6401]) {
            unit.stepSelectionAnimation(state.selectionAnimationStartedAtMs + elapsed);
            expect(state.selectionAnimFrameIndex).toBe(Math.floor((elapsed * 7.5) / 1000) % 48);
            expect(state.sprite.texture.source).toBe(idleAtlas.source);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
        }
        const fixedTransform = () => [
            state.sprite.x,
            state.sprite.y,
            state.sprite.scale.x,
            state.sprite.scale.y,
            state.sprite.anchor.x,
            state.sprite.anchor.y,
        ];
        const idleTransform = fixedTransform();
        // Check every authored frame over two loops: runtime placement, scale and anchor must stay fixed.
        for (let frame = 0; frame < 96; frame++) {
            unit.ensureVisual(world, grid);
            unit.stepSelectionAnimation(state.selectionAnimationStartedAtMs + ((frame + 0.25) * 1000) / 7.5);
            expect(state.selectionAnimFrameIndex).toBe(frame % 48);
            expect(fixedTransform()).toEqual(idleTransform);
        }
        unit.startBoardWalkAnimation(1, 3);
        expect(state.sprite.texture.height).toBe(1024);
        for (let step = 0; step <= 16; step++) {
            unit.setBoardWalkDistanceCells((step * 1.3) / 1.15 / 8 + 1e-8);
            expect(state.walkAnim.frameIndex).toBe(step % 8);
        }
        unit.stopBoardWalkAnimation();
        expect(state.sprite.texture.source).toBe(idleAtlas.source);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
    } finally {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = previous;
    }
});
