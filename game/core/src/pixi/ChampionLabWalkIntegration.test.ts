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
import { isRedundantFullResolutionUnitAtlasKey } from "./imageAssetTiers";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Champion uses the detailed eight-frame walk in combat and the lab, at 1.3 cells per cycle", () => {
    const previous = CREATURE_SPRITE_ANIMATION_SETTINGS.enabled;
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    try {
        expect(creatureWalkAnimationEnabledForUnit("Champion", false)).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Champion", true)).toBe(true);
        expect(animationAtlases["Champion Lab"].walk.frameCount).toBe(8);
        expect(shouldPreloadUnitAnimationAtlas("champion_lab_walk_atlas", false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey("champion_lab_walk_atlas")).toBe(false);
        expect(images.champion_lab_walk_atlas).toContain("7988e22411ef51c8");
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
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Champion", "champion_512", 1),
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
        const idleAtlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 4096 }),
        });
        const plume = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 512, height: 512 }),
        });
        const unit = RenderableUnit.fromBase(base, (key) =>
            key === "champion_lab_walk_atlas"
                ? atlas
                : key === "champion_lab_idle_atlas"
                  ? idleAtlas
                  : key === "champion_lab_plume"
                    ? plume
                    : idle,
        );
        unit.setCreatureAnimationLabPreviewEnabled(false);
        const container = new Container();
        unit.ensureVisual(container, grid);
        expect(unit.getAnimationTextureKey("walk")).toBe("champion_lab_walk_atlas");
        const state = unit as unknown as {
            sprite: Sprite;
            walkAnim?: { frameIndex: number };
            selectionAnimFrameIndex: number;
            selectionAnimationStartedAtMs: number;
        };
        const neutral = state.sprite.texture;
        const idleScaleY = state.sprite.scale.y;
        const idleScaleX = state.sprite.scale.x;
        const idleAnchorY = state.sprite.anchor.y;
        // Independently measured alpha bounds from the actual 768px source artwork.
        const visibleWalkHeights = [609, 609, 603, 597, 603, 603, 606, 600];
        const visibleWalkWidths = [654, 669, 681, 669, 654, 654, 663, 654];
        const walkBottoms = [696, 696, 696, 696, 696, 690, 696, 696];
        const expectStableHeight = () => {
            const frame = state.walkAnim?.frameIndex ?? 0;
            expect(Math.abs(state.sprite.scale.y) * visibleWalkHeights[frame]).toBeCloseTo(
                Math.abs(idleScaleY) * 617,
                6,
            );
            expect(Math.abs(state.sprite.scale.x) * visibleWalkWidths[frame]).toBeCloseTo(
                Math.abs(idleScaleX) * 683,
                6,
            );
            expect((state.sprite.anchor.y * 768 - walkBottoms[frame]) * Math.abs(state.sprite.scale.y)).toBeCloseTo(
                (idleAnchorY * 1024 - 826) * Math.abs(idleScaleY),
                6,
            );
        };
        unit.startBoardWalkAnimation(1, 4);
        expect(state.sprite.texture.source).toBe(atlas.source);
        expect(state.sprite.texture.width).toBe(768);
        expectStableHeight();
        for (let step = 0; step <= 16; step++) {
            const distance = (step * 1.3) / 8;
            unit.setBoardWalkDistanceCells(distance + 1e-8);
            expect(state.walkAnim?.frameIndex).toBe(step % 8);
            expectStableHeight();
            unit.setBoardWalkDistanceCells(distance + 1e-8);
            expect(state.walkAnim?.frameIndex).toBe(step % 8);
            expectStableHeight();
            unit.ensureVisual(container, grid);
            expectStableHeight();
        }
        unit.setBoardWalkDistanceCells(2.6 + Math.SQRT2);
        expect(state.walkAnim?.frameIndex).toBe(Math.floor((2.6 + Math.SQRT2) / (1.3 / 8)) % 8);
        expectStableHeight();
        // Restarting a route from a different cel must not accumulate the height correction.
        unit.startBoardWalkAnimation(1, 4);
        expectStableHeight();
        unit.stopBoardWalkAnimation();
        expect(state.sprite.texture.source).toBe(neutral.source);
        expect(state.sprite.scale.y).toBeCloseTo(idleScaleY, 6);
        expect(state.sprite.scale.x).toBeCloseTo(idleScaleX, 6);
        expect(state.sprite.anchor.y).toBe(idleAnchorY);
        for (let frame = 0; frame < 8; frame++) {
            unit.startBoardWalkAnimation(1, 4);
            unit.setBoardWalkDistanceCells((frame * 1.3) / 8 + 1e-8);
            expectStableHeight();
            unit.stopBoardWalkAnimation();
            expect(state.sprite.scale.y).toBeCloseTo(idleScaleY, 6);
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(Math.abs(idleScaleX), 6);
            unit.ensureVisual(container, grid);
            expect(state.sprite.scale.y).toBeCloseTo(idleScaleY, 6);
        }
        expect(unit.getAnimationTextureKey("idle")).toBe("champion_lab_idle_atlas");
        const epoch = state.selectionAnimationStartedAtMs;
        for (const [offset, frame] of [
            [5999, 12],
            [6000, 4],
            [6625, 8],
            [7290, 4],
            [7667, 9],
            [12000, 4],
        ]) {
            unit.stepSelectionAnimation(epoch + offset);
            expect(state.selectionAnimFrameIndex).toBe(frame);
            expect(state.sprite.texture.source).toBe(idleAtlas.source);
            expect(state.sprite.texture.height).toBe(1024);
            expect(state.sprite.filters?.length ?? 0).toBe(1);
        }
        unit.startBoardWalkAnimation(1, 4);
        expectStableHeight();
        expect(state.sprite.filters?.length ?? 0).toBe(1);
        unit.stopBoardWalkAnimation();
        expect(state.sprite.scale.y).toBeCloseTo(idleScaleY, 6);
    } finally {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = previous;
    }
});
