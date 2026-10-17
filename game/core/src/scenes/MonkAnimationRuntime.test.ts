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
import { RenderableUnit } from "./RenderableUnit";
import { MonkIdleFilter, MONK_WALK_ORBS } from "./MonkLabIdleVisuals";
import { animationAtlases } from "../generated/animation_atlases";

beforeAll(() => {
    if (typeof document === "undefined") {
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
            querySelector: () => null,
        };
    }
});

test.each([false, true])("Monk preserves all authored animations and scale with lab preview %s", (labPreview) => {
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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Monk", "monk_512", 1),
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
            const atlasState =
                /^monk_lab_(idle|walk|hit|death|attack(?:_up|_down)?|melee_attack(?:_up|_down)?)_atlas$/.exec(key)?.[1];
            const meta = atlasState ? animationAtlases["Monk Lab"][atlasState] : undefined;
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
    unit.setPosition(0, 1024);
    const root = new Container();
    unit.ensureVisual(root, grid);
    const state = unit as unknown as {
        sprite: Sprite;
        selectionAnimFrames: Texture[];
        selectionAnimationStartedAtMs: number;
        selectionAnimFrameIndex: number;
        stepSelectionAnimation(now: number): void;
        walkAnim?: { frames: Texture[]; frameIndex: number };
        oneShotAnim?: {
            frames: Texture[];
            frameIndex: number;
            finished?: boolean;
            authoredRealTime?: boolean;
            frameDurationsMs?: number[];
        };
    };
    const originalScale = state.sprite.scale.y;
    unit.setCreatureAnimationLabPreviewEnabled(labPreview);
    unit.ensureVisual(root, grid);
    expect(state.selectionAnimFrames.length).toBe(animationAtlases["Monk Lab"].idle.frameCount);
    expect(state.sprite.texture.width).toBe(768);
    expect(Math.abs(state.sprite.scale.y / originalScale - 1)).toBeLessThan(0.015);
    const seen = new Set<number>();
    for (let elapsed = 0; elapsed < 3200; elapsed += 100) {
        state.stepSelectionAnimation(state.selectionAnimationStartedAtMs + elapsed);
        seen.add(state.selectionAnimFrameIndex);
    }
    expect(seen.size).toBeGreaterThan(7);
    unit.startBoardWalkAnimation(1, 4);
    expect(state.walkAnim?.frames.length).toBe(8);
    unit.setBoardWalkDistanceCells(0.7);
    expect(state.walkAnim?.frameIndex).toBeGreaterThan(0);
    const walkGlow = state.sprite.filters?.find((filter) => filter instanceof MonkIdleFilter) as MonkIdleFilter;
    expect(walkGlow).toBeDefined();
    expect(walkGlow.resources.monk.uniforms.uReaction).toBe(1);
    expect(walkGlow.resources.monk.uniforms.uPlantFeet).toBe(0);
    expect(walkGlow.resources.monk.uniforms.uOrb[1]).toBeCloseTo(MONK_WALK_ORBS[state.walkAnim!.frameIndex][1]);
    unit.stopBoardWalkAnimation();
    unit.ensureVisual(root, grid);
    expect(state.sprite.texture.width).toBe(768);
    expect(Math.abs(state.sprite.scale.y / originalScale - 1)).toBeLessThan(0.015);
    expect(state.sprite.anchor.y).toBeCloseTo(730 / 768, 5);
    for (const reaction of [
        "hit",
        "death",
        "melee_attack",
        "melee_attack_up",
        "melee_attack_down",
        "attack",
        "attack_up",
        "attack_down",
    ]) {
        expect(unit.hasAnimationState(reaction)).toBe(true);
        expect(unit.getAnimationTextureKey(reaction)).toBe(`monk_lab_${reaction}_atlas`);
        expect(unit.playOneShotAnimation(reaction, undefined, true)).toBe(true);
        expect(state.oneShotAnim?.authoredRealTime).toBe(true);
        if (reaction === "death") {
            expect(state.oneShotAnim?.frameDurationsMs?.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(1360 / 1.44, 4);
        }
        expect(state.oneShotAnim?.frames.length).toBe(animationAtlases["Monk Lab"][reaction].frameCount);
        expect(state.sprite.texture.width).toBe(768);
        expect(Math.abs(state.sprite.scale.y / originalScale - 1)).toBeLessThan(0.015);
        unit.stepOneShotAnimation(180);
        expect(state.oneShotAnim?.frameIndex).toBeGreaterThan(0);
        unit.stepOneShotAnimation(5000);
        if (reaction !== "death") {
            expect(state.oneShotAnim).toBeUndefined();
            expect(state.sprite.anchor.y).toBeCloseTo(730 / 768, 5);
        } else {
            expect(state.oneShotAnim?.finished).toBe(true);
            expect(state.oneShotAnim?.frameIndex).toBe(animationAtlases["Monk Lab"].death.frameCount - 1);
            unit.returnToIdleAnimation(true);
            expect(state.oneShotAnim).toBeUndefined();
        }
    }
    for (const direction of ["attack", "attack_up", "attack_down"]) {
        let releases = 0;
        let cancellations = 0;
        expect(
            unit.playMonkLabRangedThrow(
                direction,
                () => releases++,
                () => cancellations++,
            ),
        ).toBe(true);
        unit.stepOneShotAnimation(240);
        expect(releases).toBe(0);
        unit.stepOneShotAnimation(5);
        expect(releases).toBe(1);
        const glow = state.sprite.filters?.find((filter) => filter instanceof MonkIdleFilter) as MonkIdleFilter;
        expect(glow.resources.monk.uniforms.uGlowStrength).toBe(0);
        unit.stepOneShotAnimation(1000);
        expect(releases).toBe(1);
        expect(cancellations).toBe(0);
        expect(state.oneShotAnim).toBeUndefined();
        expect(
            unit.playMonkLabRangedThrow(
                direction,
                () => releases++,
                () => cancellations++,
            ),
        ).toBe(true);
        unit.stepOneShotAnimation(100);
        unit.returnToIdleAnimation(true);
        expect(cancellations).toBe(1);
        expect(releases).toBe(1);
    }
    unit.destroyVisuals();
});
