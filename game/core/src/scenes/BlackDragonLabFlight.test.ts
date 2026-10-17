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
import { animationAtlases } from "../generated/animation_atlases";
import { shouldPreloadUnitAnimationAtlas, usesApprovedBaseAnimations } from "../pixi/creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import { creatureWalkAnimationEnabledForUnit, RenderableUnit } from "./RenderableUnit";
import {
    BLACK_DRAGON_LAB_FLIGHT_CANVAS_SCALE,
    BLACK_DRAGON_LAB_FLIGHT_ANCHOR_X,
    BLACK_DRAGON_LAB_TRANSITION_SPEED,
    blackDragonLabFlightAnchorY,
} from "./BlackDragonLabFlight";
import { BLACK_DRAGON_LAB_IDLE_CANVAS_SCALE, blackDragonLabIdleFrame } from "./BlackDragonLabIdle";
import { HIT_REACTION_ADDITIONAL_SPEED } from "../settings/hitTiming";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
});

function fixture() {
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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Chaos", "Black Dragon", "black_dragon_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const atlas = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 5120 }),
    });
    const idle = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    const idleAtlas = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 8192, height: 8192 }),
    });
    const requested: string[] = [];
    const unit = RenderableUnit.fromBase(base, (key) => {
        requested.push(key);
        return /^black_dragon_lab_(idle|hit|death|attack(?:_up|_down)?)_atlas$/.test(key)
            ? idleAtlas
            : key.includes("_atlas")
              ? atlas
              : idle;
    });
    const root = new Container();
    unit.setPosition(0, 1024);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(root, grid);
    const view = unit as unknown as {
        sprite: Sprite;
        selectionAnimFootAnchorY: number;
        selectionAnimationStartedAtMs: number;
        selectionAnimFrameIndex: number;
        walkAnim?: {
            frameIndex: number;
            loopStartFrame: number;
            loopEndFrame: number;
            gaitStartDistanceCells: number;
            completedCycles: number;
        };
    };
    return { unit, root, grid, view, requested };
}

test("Black Dragon flight is shared by combat and the developer lab and keeps the full-resolution atlas", () => {
    expect(creatureWalkAnimationEnabledForUnit("Black Dragon", true)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Black Dragon", false)).toBe(true);
    expect(usesApprovedBaseAnimations("Black Dragon")).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("black_dragon_lab_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("black_dragon_lab_walk_atlas")).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("black_dragon_lab_idle_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("black_dragon_lab_idle_atlas")).toBe(false);
    expect(BLACK_DRAGON_LAB_TRANSITION_SPEED / (1.35 * 1.15)).toBeCloseTo(1.22);
    expect(animationAtlases["Black Dragon Lab"].walk.frameDurationsMs).toEqual(
        animationAtlases["Wyvern Lab"].walk.frameDurationsMs,
    );
});

test("three fire attacks and their melee aliases keep idle body scale and recover to the same anchor", () => {
    const { unit, root, grid, view } = fixture();
    const idleScale = Math.abs(view.sprite.scale.x);
    const idleAnchor = view.sprite.anchor.y;
    for (const prefix of ["attack", "melee_attack"]) {
        for (const suffix of ["", "_up", "_down"]) {
            const state = `${prefix}${suffix}`;
            expect(unit.getAnimationTextureKey(state)).toBe(`black_dragon_lab_attack${suffix}_atlas`);
            expect(unit.playOneShotAnimation(state, undefined, true)).toBe(true);
            unit.ensureVisual(root, grid, 2000);
            expect(Math.abs(view.sprite.scale.x)).toBeCloseTo(idleScale, 6);
            expect(view.sprite.anchor.y).toBeCloseTo(idleAnchor, 6);
            unit.returnToIdleAnimation();
            unit.ensureVisual(root, grid, 4000);
            expect(Math.abs(view.sprite.scale.x)).toBeCloseTo(idleScale, 6);
            expect(view.sprite.anchor.y).toBeCloseTo(idleAnchor, 6);
        }
    }
});

test("flight preserves registration and cadence while transitions run 22% faster than Wyvern", () => {
    const { unit, root, grid, view, requested } = fixture();
    const meta = animationAtlases["Black Dragon Lab"].walk;
    const width = view.sprite.width,
        height = view.sprite.height;
    const oldScale = view.sprite.scale.clone();
    const oldAnchor = view.sprite.anchor.clone();
    unit.startBoardWalkAnimation(1, 8);
    expect(requested).toContain("black_dragon_lab_walk_atlas");
    const flightToIdle = BLACK_DRAGON_LAB_FLIGHT_CANVAS_SCALE / BLACK_DRAGON_LAB_IDLE_CANVAS_SCALE;
    expect(view.sprite.width).toBeCloseTo(width * flightToIdle);
    expect(view.sprite.height).toBeCloseTo(height * flightToIdle);
    expect(view.sprite.anchor.x).toBe(BLACK_DRAGON_LAB_FLIGHT_ANCHOR_X);
    expect(view.sprite.anchor.y).toBeCloseTo(blackDragonLabFlightAnchorY(730 / 768));
    // Any point in the canonical figure lands at the same position after canvas registration.
    expect((300 + 698 * 0.75 - view.sprite.anchor.x * 1024) * view.sprite.scale.x).toBeCloseTo(
        (128 + 698 - oldAnchor.x * 1024) * oldScale.x,
    );
    expect((350 + 713 * 0.75 - view.sprite.anchor.y * 1024) * view.sprite.scale.y).toBeCloseTo(
        (128 + 713 - oldAnchor.y * 1024) * oldScale.y,
    );
    for (let i = 0; i < 3; i++) {
        expect(view.walkAnim?.frameIndex).toBe(i);
        unit.stepSpawnAnimation((meta.frameDurationsMs![i] + 0.01) / (4000 * BLACK_DRAGON_LAB_TRANSITION_SPEED));
    }
    const start = view.walkAnim!.gaitStartDistanceCells;
    for (let step = 0; step <= 22; step++) {
        unit.setBoardWalkDistanceCells(start + (step * 1.3) / 11);
        expect(view.walkAnim?.frameIndex).toBe(3 + (step % 11));
        unit.stepSpawnAnimation(0.02);
        expect(view.walkAnim?.frameIndex).toBe(3 + (step % 11));
        unit.ensureVisual(root, grid);
        expect(view.sprite.width).toBeCloseTo(width * flightToIdle);
    }
    expect(view.walkAnim?.completedCycles).toBe(2);
    let landed = 0;
    expect(unit.finishBoardWalkAnimationAfterFullCycle(() => landed++)).toBe(true);
    for (let i = 14; i < 18; i++) {
        expect(view.walkAnim?.frameIndex).toBe(i);
        expect(landed).toBe(0);
        unit.stepSpawnAnimation((meta.frameDurationsMs![i] + 0.01) / (4000 * BLACK_DRAGON_LAB_TRANSITION_SPEED));
    }
    expect(landed).toBe(1);
    expect(view.walkAnim).toBeUndefined();
    expect(view.sprite.width).toBeCloseTo(width);
    expect(view.sprite.height).toBeCloseTo(height);
    expect(view.sprite.anchor.x).toBe(oldAnchor.x);
    root.destroy({ children: true });
});

test("a short move lands immediately and restarting or cancelling cannot compound the canvas scale", () => {
    const { unit, root, view } = fixture();
    const width = view.sprite.width;
    unit.startBoardWalkAnimation(1, 0.1);
    unit.startBoardWalkAnimation(1, 0.1);
    expect(view.sprite.width).toBeCloseTo(
        (width * BLACK_DRAGON_LAB_FLIGHT_CANVAS_SCALE) / BLACK_DRAGON_LAB_IDLE_CANVAS_SCALE,
    );
    unit.finishBoardWalkAnimationAfterFullCycle(() => {});
    expect(view.walkAnim?.frameIndex).toBe(14);
    unit.stopBoardWalkAnimation();
    expect(view.sprite.width).toBeCloseTo(width);
    unit.startBoardWalkAnimation(-1, Math.sqrt(2));
    unit.stopBoardWalkAnimation();
    expect(view.sprite.width).toBeCloseTo(width);
    root.destroy({ children: true });
});

test("idle advances without selection, stays at fixed scale, and closing the lab preserves authored motion", () => {
    const { unit, root, grid, view, requested } = fixture();
    expect(requested).toContain("black_dragon_lab_idle_atlas");
    const width = view.sprite.width;
    for (const elapsed of [0, 1200, 6399, 6400, 7200, 8000, 14400, 16000, 17600, 20800]) {
        unit.stepSelectionAnimation(view.selectionAnimationStartedAtMs + elapsed);
        expect(view.selectionAnimFrameIndex).toBe(blackDragonLabIdleFrame(elapsed));
        expect(view.sprite.width).toBeCloseTo(width);
    }
    unit.startBoardWalkAnimation(1, 2);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.ensureVisual(root, grid);
    expect(view.walkAnim).toBeDefined();
    unit.stopBoardWalkAnimation();
    expect(view.sprite.width).toBeCloseTo(width);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(root, grid);
    expect(view.sprite.width).toBeCloseTo(width);
    root.destroy({ children: true });
});

test("lab hit and death keep the idle scale on every frame, recover once, and hold the corpse", () => {
    const { unit, root, grid, view } = fixture();
    const state = unit as unknown as {
        oneShotAnim?: {
            frames: Texture[];
            frameIndex: number;
            frameDurationsMs: number[];
            authoredRealTime: boolean;
            finished?: boolean;
        };
        selectionAnimFrames: Texture[];
    };
    const scale = view.sprite.scale.clone();
    const anchor = view.sprite.anchor.clone();
    const position = view.sprite.position.clone();
    for (const action of ["hit", "death"] as const) {
        const key = `black_dragon_lab_${action}_atlas`;
        expect(unit.getAnimationTextureKey(action)).toBe(key);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        let callbacks = 0;
        expect(unit.playOneShotAnimation(action, () => callbacks++)).toBe(true);
        const anim = state.oneShotAnim!;
        expect(anim.authoredRealTime).toBe(true);
        expect(anim.frames.length).toBe(action === "hit" ? 16 : 24);
        if (action === "death") {
            const previousDurations = [...Array(10).fill(55), ...Array(5).fill(65), ...Array(8).fill(80), 300];
            expect(anim.frameDurationsMs).toEqual(previousDurations.map((duration) => duration / 1.6 / 1.3));
            expect(anim.frameDurationsMs.reduce((sum, duration) => sum + duration, 0)).toBeCloseTo(1134.375 / 1.3);
        } else {
            expect(anim.frameDurationsMs).toEqual(
                animationAtlases["Black Dragon Lab"].hit.frameDurationsMs!.map(
                    (duration) => duration / (1.6 * 1.3) / HIT_REACTION_ADDITIONAL_SPEED,
                ),
            );
            expect(anim.frameDurationsMs.reduce((sum, duration) => sum + duration, 0)).toBeCloseTo(
                450 / 1.3 / HIT_REACTION_ADDITIONAL_SPEED,
            );
        }
        expect(view.sprite.scale.x).toBeCloseTo(scale.x, 8);
        expect(view.sprite.scale.y).toBeCloseTo(scale.y, 8);
        for (let i = 0; i < anim.frames.length; i++) {
            unit.ensureVisual(root, grid);
            expect(view.sprite.scale.x).toBeCloseTo(scale.x, 8);
            expect(view.sprite.scale.y).toBeCloseTo(scale.y, 8);
            expect(view.sprite.anchor.y).toBeCloseTo(anchor.y, 8);
            if (action === "hit") {
                expect(view.sprite.position.x).toBeCloseTo(position.x, 8);
                expect(view.sprite.position.y).toBeCloseTo(position.y, 8);
                expect(view.sprite.anchor.x).toBeCloseTo(anchor.x, 8);
                expect(view.sprite.texture.width).toBe(anim.frames[0].width);
                expect(view.sprite.texture.height).toBe(anim.frames[0].height);
            }
            unit.stepOneShotAnimation(anim.frameDurationsMs[i]);
        }
        expect(callbacks).toBe(1);
        if (action === "hit") {
            expect(state.oneShotAnim).toBeUndefined();
            expect(state.selectionAnimFrames).toContain(view.sprite.texture);
        } else {
            expect(state.oneShotAnim?.finished).toBe(true);
            expect(state.oneShotAnim?.frameIndex).toBe(23);
            unit.stepOneShotAnimation(5000);
            expect(callbacks).toBe(1);
            expect(state.oneShotAnim?.frameIndex).toBe(23);
        }
    }
    unit.returnToIdleAnimation();
    expect(view.sprite.scale.x).toBeCloseTo(scale.x, 8);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("hit")).toBe("black_dragon_lab_hit_atlas");
    unit.destroyVisuals();
    root.destroy({ children: true });
});

test("a hit interrupts flight without inheriting the padded flight scale", () => {
    const { unit, root, grid, view } = fixture();
    const scale = view.sprite.scale.clone();
    unit.startBoardWalkAnimation(1, 4);
    expect(unit.playOneShotAnimation("hit")).toBe(true);
    expect(view.walkAnim).toBeUndefined();
    expect(view.sprite.scale.x).toBeCloseTo(scale.x, 8);
    unit.ensureVisual(root, grid);
    expect(view.sprite.scale.x).toBeCloseTo(scale.x, 8);
    unit.returnToIdleAnimation();
    expect(view.sprite.scale.x).toBeCloseTo(scale.x, 8);
    unit.destroyVisuals();
    root.destroy({ children: true });
});
