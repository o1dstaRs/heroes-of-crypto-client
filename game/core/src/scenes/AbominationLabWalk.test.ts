import { afterEach, beforeAll, expect, test } from "bun:test";
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
import { BufferImageSource, ColorMatrixFilter, Container, type Sprite, Texture } from "pixi.js";
import { animationAtlases } from "../generated/animation_atlases";
import { getSplitBundles } from "../pixi/PixiTextureLoader";
import { CREATURE_SPRITE_ANIMATION_SETTINGS, shouldPreloadUnitAnimationAtlas } from "../pixi/creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import { RenderableUnit, creatureWalkAnimationEnabledForUnit } from "./RenderableUnit";
import { abominationIdlePages } from "./AbominationIdlePages";
import { ArbalesterIdlePager, ArbalesterIdlePagePool } from "./ArbalesterIdlePager";

afterEach(() => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
});

beforeAll(() => {
    if (typeof document === "undefined") {
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
            querySelector: () => null,
        };
    }
});

test("Abomination lab walk uses eight full-resolution poses at the board's 1.3-cell cadence", async () => {
    expect(creatureWalkAnimationEnabledForUnit("Abomination", false)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Abomination", true)).toBe(true);
    expect(animationAtlases["Abomination Lab"].walk.frameCount).toBe(8);
    expect(animationAtlases["Abomination"].walk.frameWidth).toBe(768);
    expect(shouldPreloadUnitAnimationAtlas("abomination_lab_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("abomination_lab_walk_atlas")).toBe(false);
    expect(getSplitBundles({ animationsEnabled: false }).animations.abomination_lab_walk_atlas).toBeDefined();

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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Chaos", "Abomination", "abomination_512", 1),
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
    // Exercise the explicit package-disable fallback as well as authored playback.
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = false;
    const unit = RenderableUnit.fromBase(base, (key) => {
        keys.push(key);
        return texture;
    });
    const world = new Container();
    const state = unit as unknown as {
        sprite: Sprite;
        walkAnim?: { frames: Texture[]; frameIndex: number };
        selectionAnimFrames?: Texture[];
        selectionAnimFrameIndex: number;
        selectionAnimationStartedAtMs: number;
        abominationIdlePager?: ArbalesterIdlePager;
        oneShotAnim?: {
            stateName: string;
            frames: Texture[];
            frameIndex: number;
            frameDurationsMs?: number[];
            authoredRealTime?: boolean;
            holdLastFrame?: boolean;
        };
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, grid);
    const baseHasIdle = unit.hasAnimationState("idle");
    const baseGrade = state.sprite.filters![0] as ColorMatrixFilter;
    const baseSkinMean = [139.353518, 100.472456, 44.382254];
    const walkSkinMean = [141.418058, 96.232522, 39.702791];
    [0, 6, 12].forEach((index, channel) => {
        expect(baseSkinMean[channel] * baseGrade.matrix[index]).toBeCloseTo(walkSkinMean[channel], 3);
    });
    expect(baseGrade.matrix[18]).toBe(1);
    const gameplayEffect = new ColorMatrixFilter();
    state.sprite.filters = [baseGrade, gameplayEffect];
    unit.startBoardWalkAnimation(1, 4);
    expect(state.walkAnim).toBeUndefined();

    unit.setCreatureAnimationLabPreviewEnabled(true);
    const idleMeta = animationAtlases["Abomination Lab"].idle;
    expect(idleMeta.frameCount).toBe(96);
    expect(idleMeta.frameDurationsMs).toEqual(Array(96).fill(40 / 1.2));
    expect(shouldPreloadUnitAnimationAtlas("abomination_lab_idle_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("abomination_lab_idle_atlas")).toBe(false);
    expect(getSplitBundles({ animationsEnabled: false }).idleAtlases.abomination_lab_idle_atlas).toBeDefined();
    expect(unit.hasAnimationState("idle")).toBe(true);
    expect(keys).toContain("abomination_lab_idle_atlas");
    expect(state.selectionAnimFrames).toHaveLength(1);
    expect(state.abominationIdlePager?.format.frameCount).toBe(96);
    // Supply decoded native pages without network/browser image APIs in this scene regression.
    state.abominationIdlePager?.dispose();
    const nativeFrames = Array.from(
        { length: 96 },
        () =>
            new Texture({
                source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
            }),
    );
    const pool = new ArbalesterIdlePagePool(async (page) => ({
        frames: nativeFrames.slice(page.firstFrame, page.firstFrame + page.frameCount),
        async unload() {},
    }));
    state.abominationIdlePager = new ArbalesterIdlePager(abominationIdlePages(idleMeta)!, pool);
    // The complete authored loop advances forward, including the hand's return to a fist.
    for (const frame of [0, 1, 23, 24, 47, 48, 71, 72, 95, 96, 97]) {
        const now = state.selectionAnimationStartedAtMs + frame * (40 / 1.2) + 1;
        unit.stepSelectionAnimation(now);
        for (let tick = 0; tick < 12; tick++) await Promise.resolve();
        unit.stepSelectionAnimation(now);
        expect(state.selectionAnimFrameIndex).toBe(frame % 96);
        expect(state.sprite.texture).toBe(nativeFrames[frame % 96]);
        expect(state.sprite.anchor.y).toBe(idleMeta.footAnchorY!);
    }
    expect(state.sprite.filters).toEqual([gameplayEffect]);
    unit.ensureVisual(world, grid);
    const idleScaleX = Math.abs(state.sprite.scale.x);
    const idleScaleY = Math.abs(state.sprite.scale.y);
    const walkHeights = [693, 669, 666, 678, 669, 675, 681, 690];
    const walkSoles = [728, 722, 716, 713, 716, 728, 731, 728];
    const idleSoleOffset = (737 - idleMeta.footAnchorY! * 768) * idleScaleY;
    unit.startBoardWalkAnimation(1, 4);
    expect(keys).toContain("abomination_lab_walk_atlas");
    expect(state.sprite.filters).toContain(gameplayEffect);
    expect(state.sprite.filters).not.toContain(baseGrade);
    expect(state.walkAnim?.frames).toHaveLength(8);
    expect(state.walkAnim?.frames[0].width).toBe(768);
    expect(Math.abs(state.sprite.scale.y) * walkHeights[0]).toBeCloseTo(idleScaleY * 708, 8);
    for (let step = 0; step <= 16; step++) {
        unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
        expect(Math.abs(state.sprite.scale.y) * walkHeights[step % 8]).toBeCloseTo(idleScaleY * 708, 8);
        expect((walkSoles[step % 8] - state.sprite.anchor.y * 768) * Math.abs(state.sprite.scale.y)).toBeCloseTo(
            idleSoleOffset,
            8,
        );
        unit.ensureVisual(world, grid);
        expect(Math.abs(state.sprite.scale.y) * walkHeights[step % 8]).toBeCloseTo(idleScaleY * 708, 8);
        unit.stepSpawnAnimation(0.5);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
    }
    unit.setBoardWalkDistanceCells(Math.SQRT2);
    const diagonalPhase = Math.floor((Math.SQRT2 / 1.3) * 8) % 8;
    expect(state.walkAnim?.frameIndex).toBe(diagonalPhase);
    unit.setBoardFacingFromMovement(-1);
    unit.ensureVisual(world, grid);
    expect(state.walkAnim?.frameIndex).toBe(diagonalPhase);
    unit.startBoardWalkAnimation(-1, 0.5);
    unit.setBoardWalkDistanceCells(0.5);
    expect(state.walkAnim?.frameIndex).toBe(3);
    expect(Math.abs(state.sprite.scale.y) * walkHeights[3]).toBeCloseTo(idleScaleY * 708, 8);
    unit.stopBoardWalkAnimation();
    expect(state.walkAnim).toBeUndefined();
    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScaleY, 8);
    expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
    expect(state.sprite.filters).toEqual([gameplayEffect]);
    expect([...state.selectionAnimFrames!, ...nativeFrames]).toContain(state.sprite.texture);
    unit.ensureVisual(world, grid);
    expect(state.sprite.filters).toEqual([gameplayEffect]);
    const idlePosition = state.sprite.position.clone();
    for (const action of ["hit", "death", "melee_attack_up", "melee_attack", "melee_attack_down"] as const) {
        const meta = animationAtlases["Abomination Lab"][action];
        const attack = action.startsWith("melee_attack");
        expect(meta.loopDurationMs).toBeCloseTo(attack ? 505 : (action === "hit" ? 448 : 1088) / 1.2, 8);
        expect(meta.frameDurationsMs?.reduce((sum, ms) => sum + ms, 0)).toBe(meta.loopDurationMs!);
        if (attack) {
            expect(unit.getAnimationTextureKey(action.replace("melee_attack", "attack"))).toBe(
                `abomination_lab_${action}_atlas`,
            );
        }
        expect(unit.hasAnimationState(action)).toBe(true);
        expect(unit.getAnimationTextureKey(action)).toBe(`abomination_lab_${action}_atlas`);
        expect(shouldPreloadUnitAnimationAtlas(`abomination_lab_${action}_atlas`, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(`abomination_lab_${action}_atlas`)).toBe(false);
        let completed = 0;
        unit.startBoardWalkAnimation(1, 1);
        unit.setBoardWalkDistanceCells(0.5);
        expect(unit.playOneShotAnimation(action, () => completed++)).toBe(true);
        expect(state.walkAnim).toBeUndefined();
        expect(state.oneShotAnim?.frames).toHaveLength(attack ? 13 : action === "hit" ? 6 : 15);
        expect(state.oneShotAnim?.frames[0].width).toBe(attack ? 1024 : 768);
        expect(state.oneShotAnim?.frameDurationsMs).toEqual(meta.frameDurationsMs);
        expect(state.oneShotAnim?.authoredRealTime).toBe(true);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScaleY, 8);
        expect(state.sprite.position.equals(idlePosition)).toBe(true);
        expect(state.sprite.anchor.y).toBe(idleMeta.footAnchorY!);
        unit.ensureVisual(world, grid);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScaleY, 8);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
        if (attack) {
            // Check the entire padded attack, including refresh and a mirrored facing, rather than
            // only the opening pose: no frame may stretch the figure or move its planted anchor.
            const durations = meta.frameDurationsMs!;
            let elapsed = 0;
            for (let index = 0; index < durations.length; index++) {
                const target = durations.slice(0, index).reduce((sum, ms) => sum + ms, 0) + 1;
                unit.stepOneShotAnimation(target - elapsed);
                elapsed = target;
                expect(state.oneShotAnim?.frameIndex).toBe(index);
                for (const facing of [-1, 1]) {
                    unit.setBoardFacingFromMovement(facing);
                    unit.ensureVisual(world, grid);
                    expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScaleX, 8);
                    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScaleY, 8);
                    expect(Math.abs(state.sprite.scale.x / state.sprite.scale.y)).toBeCloseTo(
                        idleScaleX / idleScaleY,
                        8,
                    );
                    expect(state.sprite.position.equals(idlePosition)).toBe(true);
                    expect(state.sprite.anchor.y).toBe(idleMeta.footAnchorY!);
                }
            }
        } else {
            unit.stepOneShotAnimation(80);
        }
        const frame = state.oneShotAnim?.frameIndex;
        unit.stepSelectionAnimation();
        expect(state.oneShotAnim?.frameIndex).toBe(frame);
        unit.stepOneShotAnimation(10000);
        expect(completed).toBe(1);
        if (action === "death") {
            expect(state.oneShotAnim?.holdLastFrame).toBe(true);
            expect(state.oneShotAnim?.frameIndex).toBe(meta.frameCount - 1);
            const corpse = state.sprite.texture;
            unit.stepSelectionAnimation();
            unit.stepOneShotAnimation(10000);
            expect(state.sprite.texture).toBe(corpse);
            expect(completed).toBe(1);
            unit.returnToIdleAnimation();
        }
        expect(state.oneShotAnim).toBeUndefined();
        expect(state.sprite.anchor.y).toBe(idleMeta.footAnchorY!);
        expect(state.sprite.filters).toEqual([gameplayEffect]);
    }
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.ensureVisual(world, grid);
    expect(unit.hasAnimationState("idle")).toBe(baseHasIdle);
    expect(state.sprite.filters).toEqual([baseGrade, gameplayEffect]);
    unit.destroyVisuals();
    world.destroy({ children: true });
});
