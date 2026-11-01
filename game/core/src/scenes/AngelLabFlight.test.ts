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
    ANGEL_LAB_FLIGHT_CANVAS_SCALE,
    ANGEL_LAB_FLIGHT_ANCHOR_X,
    ANGEL_LAB_SOURCE_SCALE,
    ANGEL_LAB_OFFSET_X,
    ANGEL_LAB_OFFSET_Y,
    angelLabFlightAnchorY,
} from "./AngelLabFlight";
import { FAIRY_LAB_TRANSITION_SPEED, FAIRY_LAB_WALK_SPEED } from "./FairyLabWalkVisuals";

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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Angel", "angel_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const atlas = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 3072 }),
    });
    const idleAtlas = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 3840, height: 3840 }),
    });
    const idle = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    const actions = Object.fromEntries(
        ["cast", "hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"].map((state) => {
            const meta = animationAtlases["Angel Lab"][state];
            return [
                `angel_lab_${state}_atlas`,
                new Texture({
                    source: new BufferImageSource({
                        resource: new Uint8Array(4),
                        width: meta.atlasWidth,
                        height: meta.atlasHeight,
                    }),
                }),
            ];
        }),
    );
    const requested: string[] = [];
    const unit = RenderableUnit.fromBase(base, (key) => {
        requested.push(key);
        return actions[key] ?? (key === "angel_lab_idle_atlas" ? idleAtlas : key.includes("_atlas") ? atlas : idle);
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
        selectionAnimFrames: Texture[];
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

test("Angel flight is shared by combat and the developer lab and keeps the full-resolution atlas", () => {
    expect(creatureWalkAnimationEnabledForUnit("Angel", true)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Angel", false)).toBe(true);
    expect(usesApprovedBaseAnimations("Angel")).toBe(true);
    for (const state of ["walk", "idle", "cast", "hit", "death"])
        expect(shouldPreloadUnitAnimationAtlas(`angel_lab_${state}_atlas`, false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("angel_lab_walk_atlas")).toBe(false);
    expect(animationAtlases["Angel Lab"].walk.frameDurationsMs).toEqual(
        animationAtlases["Fairy Lab"].walk.frameDurationsMs,
    );
});

test("flight matches Fairy timing and preserves the source registration through two cycles", () => {
    const { unit, root, grid, view, requested } = fixture();
    const meta = animationAtlases["Angel Lab"].walk;
    const width = view.sprite.width,
        height = view.sprite.height;
    const oldScale = view.sprite.scale.clone();
    const oldAnchor = view.sprite.anchor.clone();
    unit.startBoardWalkAnimation(1, 8);
    expect(requested).toContain("angel_lab_walk_atlas");
    expect(view.sprite.width).toBeCloseTo(width * ANGEL_LAB_FLIGHT_CANVAS_SCALE);
    expect(view.sprite.height).toBeCloseTo(height * ANGEL_LAB_FLIGHT_CANVAS_SCALE);
    expect(view.sprite.anchor.x).toBe(ANGEL_LAB_FLIGHT_ANCHOR_X);
    expect(view.sprite.anchor.y).toBeCloseTo(angelLabFlightAnchorY(oldAnchor.y));
    // Any point in the canonical figure lands at the same position after canvas registration.
    expect(
        (ANGEL_LAB_OFFSET_X + 698 * ANGEL_LAB_SOURCE_SCALE - view.sprite.anchor.x * 1024) * view.sprite.scale.x,
    ).toBeCloseTo((698 - oldAnchor.x * 768) * oldScale.x);
    expect(
        (ANGEL_LAB_OFFSET_Y + 713 * ANGEL_LAB_SOURCE_SCALE - view.sprite.anchor.y * 1024) * view.sprite.scale.y,
    ).toBeCloseTo((713 - oldAnchor.y * 768) * oldScale.y);
    for (let i = 0; i < 3; i++) {
        expect(view.walkAnim?.frameIndex).toBe(i);
        unit.stepSpawnAnimation((meta.frameDurationsMs![i] + 0.01) / (4000 * FAIRY_LAB_TRANSITION_SPEED));
    }
    const start = view.walkAnim!.gaitStartDistanceCells;
    for (let step = 0; step <= 12; step++) {
        unit.setBoardWalkDistanceCells(start + (step * 1.3) / FAIRY_LAB_WALK_SPEED / 6);
        expect(view.walkAnim?.frameIndex).toBe(3 + (step % 6));
        unit.stepSpawnAnimation(0.02);
        expect(view.walkAnim?.frameIndex).toBe(3 + (step % 6));
        unit.ensureVisual(root, grid);
        expect(view.sprite.width).toBeCloseTo(width * ANGEL_LAB_FLIGHT_CANVAS_SCALE);
    }
    expect(view.walkAnim?.completedCycles).toBe(2);
    unit.setBoardFacingFromMovement(-1);
    unit.setBoardWalkDistanceCells(start + 2 + Math.SQRT2);
    expect(view.walkAnim?.frameIndex).toBe(3 + (Math.floor((2 + Math.SQRT2) * 6) % 6));
    unit.setBoardFacingFromMovement(1);
    let landed = 0;
    expect(unit.finishBoardWalkAnimationAfterFullCycle(() => landed++)).toBe(true);
    for (let i = 9; i < 12; i++) {
        expect(view.walkAnim?.frameIndex).toBe(i);
        expect(landed).toBe(0);
        // The normal scene refresh runs between every landing cel. It must not squeeze
        // the atlas canvas or move its registration while the authored body pose changes.
        unit.ensureVisual(root, grid);
        expect(view.sprite.width).toBeCloseTo(width * ANGEL_LAB_FLIGHT_CANVAS_SCALE);
        expect(view.sprite.height).toBeCloseTo(height * ANGEL_LAB_FLIGHT_CANVAS_SCALE);
        expect(view.sprite.anchor.x).toBe(ANGEL_LAB_FLIGHT_ANCHOR_X);
        expect(view.sprite.anchor.y).toBeCloseTo(angelLabFlightAnchorY(oldAnchor.y));
        unit.stepSpawnAnimation((meta.frameDurationsMs![i] + 0.01) / (4000 * FAIRY_LAB_TRANSITION_SPEED));
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
    expect(view.sprite.width).toBeCloseTo(width * ANGEL_LAB_FLIGHT_CANVAS_SCALE);
    unit.finishBoardWalkAnimationAfterFullCycle(() => {});
    expect(view.walkAnim?.frameIndex).toBe(9);
    unit.stopBoardWalkAnimation();
    expect(view.sprite.width).toBeCloseTo(width);
    unit.startBoardWalkAnimation(-1, Math.sqrt(2));
    unit.stopBoardWalkAnimation();
    expect(view.sprite.width).toBeCloseTo(width);
    root.destroy({ children: true });
});

test("closing the lab keeps flight active and pressing idle restores the neutral size", () => {
    const { unit, root, grid, view } = fixture();
    const width = view.sprite.width;
    const anchor = view.sprite.anchor.clone();
    unit.startBoardWalkAnimation(1, 2);
    unit.returnToIdleAnimation();
    expect(view.walkAnim).toBeUndefined();
    expect(view.sprite.width).toBeCloseTo(width);
    unit.startBoardWalkAnimation(1, 2);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(view.walkAnim).toBeDefined();
    unit.returnToIdleAnimation();
    unit.ensureVisual(root, grid);
    expect(view.sprite.width).toBeCloseTo(width);
    expect(view.sprite.anchor.x).toBeCloseTo(anchor.x);
    expect(view.sprite.anchor.y).toBeCloseTo(anchor.y);
    root.destroy({ children: true });
});

test("redrawn Angel idle preserves authored cels and registration through flight", () => {
    const { unit, root, grid, view } = fixture();
    expect(view.selectionAnimFrames).toHaveLength(24);
    const width = view.sprite.width;
    const height = view.sprite.height;
    const start = view.selectionAnimationStartedAtMs;
    const durations = animationAtlases["Angel Lab"].idle.frameDurationsMs!;
    let elapsed = 0;
    for (let i = 0; i < durations.length * 2; i++) {
        const frame = i % durations.length;
        unit.stepSelectionAnimation(start + elapsed + 1);
        elapsed += durations[frame];
        expect(view.selectionAnimFrameIndex).toBe(frame);
        expect(view.sprite.texture).toBe(view.selectionAnimFrames[frame]);
        // Scene refresh between authored cels must never refit their changing silhouette.
        unit.ensureVisual(root, grid);
        expect(view.sprite.width).toBeCloseTo(width);
        expect(view.sprite.height).toBeCloseTo(height);
    }
    unit.startBoardWalkAnimation(1, 2);
    unit.finishBoardWalkAnimationAfterFullCycle(() => {});
    unit.ensureVisual(root, grid);
    unit.stopBoardWalkAnimation();
    unit.ensureVisual(root, grid);
    expect(view.sprite.width).toBeCloseTo(width);
    expect(view.sprite.height).toBeCloseTo(height);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(view.selectionAnimFrames).toHaveLength(24);
    root.destroy({ children: true });
});

test("cast, hit and three melee directions play authored timing at constant body size and return to idle", () => {
    for (const state of ["cast", "hit", "melee_attack", "melee_attack_up", "melee_attack_down"] as const) {
        const { unit, root, grid, view } = fixture();
        const width = view.sprite.width;
        const height = view.sprite.height;
        let completed = 0;
        expect(unit.getAnimationTextureKey(state)).toBe(`angel_lab_${state}_atlas`);
        if (state.startsWith("melee_"))
            expect(unit.getAnimationTextureKey(state.replace(/^melee_/, ""))).toBe(`angel_lab_${state}_atlas`);
        expect(unit.playOneShotAnimation(state, () => completed++, true)).toBe(true);
        const action = unit as unknown as { oneShotAnim?: { frameIndex: number; authoredRealTime: boolean } };
        const durations = animationAtlases["Angel Lab"][state].frameDurationsMs!;
        for (let frame = 0; frame < durations.length; frame++) {
            expect(action.oneShotAnim?.frameIndex).toBe(frame);
            expect(action.oneShotAnim?.authoredRealTime).toBe(true);
            unit.ensureVisual(root, grid);
            expect(view.sprite.width).toBeCloseTo(width);
            expect(view.sprite.height).toBeCloseTo(height);
            unit.stepOneShotAnimation(durations[frame] + 0.0001);
        }
        expect(completed).toBe(1);
        expect(action.oneShotAnim).toBeUndefined();
        expect(view.sprite.width).toBeCloseTo(width);
        expect(view.sprite.height).toBeCloseTo(height);
        root.destroy({ children: true });
    }
});

test("death holds its complete fallen pose and reset restores idle after flight", () => {
    const { unit, root, grid, view } = fixture();
    const width = view.sprite.width;
    unit.startBoardWalkAnimation(-1, 2);
    expect(unit.playOneShotAnimation("death", undefined, true)).toBe(true);
    expect(view.walkAnim).toBeUndefined();
    const duration = animationAtlases["Angel Lab"].death.frameDurationsMs!.reduce((a, b) => a + b, 0);
    expect(duration).toBeCloseTo(1330 / 1.33);
    const action = unit as unknown as { oneShotAnim?: { frameIndex: number; finished: boolean } };
    unit.stepOneShotAnimation(duration - 1);
    expect(action.oneShotAnim?.finished).not.toBe(true);
    unit.stepOneShotAnimation(2);
    expect(action.oneShotAnim?.frameIndex).toBe(5);
    expect(action.oneShotAnim?.finished).toBe(true);
    unit.ensureVisual(root, grid);
    expect(view.sprite.width).toBeCloseTo(width);
    unit.returnToIdleAnimation();
    unit.ensureVisual(root, grid);
    expect(action.oneShotAnim).toBeUndefined();
    expect(view.sprite.width).toBeCloseTo(width);
    root.destroy({ children: true });
});
