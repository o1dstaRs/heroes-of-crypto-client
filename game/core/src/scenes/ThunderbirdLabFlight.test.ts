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
import { THUNDERBIRD_REACTION_CANVAS_SCALE, thunderbirdReactionAnchorY } from "./ThunderbirdLabReactions";
import { animationAtlases } from "../generated/animation_atlases";
import { shouldPreloadUnitAnimationAtlas, usesApprovedBaseAnimations } from "../pixi/creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import { creatureWalkAnimationEnabledForUnit, RenderableUnit } from "./RenderableUnit";
import {
    THUNDERBIRD_LAB_FLIGHT_CANVAS_SCALE,
    THUNDERBIRD_LAB_FLIGHT_ANCHOR_X,
    THUNDERBIRD_LAB_TRANSITION_SPEED,
    thunderbirdLabFlightAnchorY,
} from "./ThunderbirdLabFlight";

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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Might", "Thunderbird", "thunderbird_512", 1),
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
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 3840, height: 6144 }),
    });
    const requested: string[] = [];
    const unit = RenderableUnit.fromBase(base, (key) => {
        requested.push(key);
        return key === "thunderbird_lab_idle_atlas" ? idleAtlas : key.includes("_atlas") ? atlas : idle;
    });
    const root = new Container();
    unit.setPosition(0, 1024);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.ensureVisual(root, grid);
    const view = unit as unknown as {
        sprite: Sprite;
        selectionAnimFootAnchorY: number;
        selectionAnimationStartedAtMs: number;
        selectionAnimFrameIndex: number;
        oneShotAnim?: { frameIndex: number; finished?: boolean; authoredRealTime?: boolean };
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

test("Thunderbird approved flight is active in normal combat and keeps the full-resolution atlas", () => {
    expect(creatureWalkAnimationEnabledForUnit("Thunderbird", true)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Thunderbird", false)).toBe(true);
    expect(usesApprovedBaseAnimations("Thunderbird")).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("thunderbird_flight_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("thunderbird_flight_walk_atlas")).toBe(false);
    expect(animationAtlases["Thunderbird Flight"].walk.frameDurationsMs).toEqual(
        animationAtlases["Wyvern Lab"].walk.frameDurationsMs,
    );
    expect(animationAtlases["Thunderbird Flight"].walk.phases).toEqual(animationAtlases["Wyvern Lab"].walk.phases);
});

test("flight preserves registration, Wyvern transition timing, spatial cadence, and landing recovery", () => {
    const { unit, root, grid, view, requested } = fixture();
    const meta = animationAtlases["Thunderbird Flight"].walk;
    const width = view.sprite.width,
        height = view.sprite.height;
    const oldScale = view.sprite.scale.clone();
    const oldAnchor = view.sprite.anchor.clone();
    unit.startBoardWalkAnimation(1, 8);
    expect(unit.getAnimationTextureKey("walk")).toBe("thunderbird_flight_walk_atlas");
    expect(requested).toContain("thunderbird_flight_walk_atlas");
    expect(view.sprite.width).toBeCloseTo(width * THUNDERBIRD_LAB_FLIGHT_CANVAS_SCALE);
    expect(view.sprite.height).toBeCloseTo(height * THUNDERBIRD_LAB_FLIGHT_CANVAS_SCALE);
    expect(view.sprite.anchor.x).toBe(THUNDERBIRD_LAB_FLIGHT_ANCHOR_X);
    expect(view.sprite.anchor.y).toBeCloseTo(thunderbirdLabFlightAnchorY(oldAnchor.y));
    // Any point in the canonical figure lands at the same position after canvas registration.
    expect((286 + (649 * 538) / 768 - view.sprite.anchor.x * 1024) * view.sprite.scale.x).toBeCloseTo(
        (649 - oldAnchor.x * 768) * oldScale.x,
    );
    expect((340 + (742 * 538) / 768 - view.sprite.anchor.y * 1024) * view.sprite.scale.y).toBeCloseTo(
        (742 - oldAnchor.y * 768) * oldScale.y,
    );
    for (let i = 0; i < 3; i++) {
        expect(view.walkAnim?.frameIndex).toBe(i);
        unit.stepSpawnAnimation((meta.frameDurationsMs![i] + 0.01) / (4000 * THUNDERBIRD_LAB_TRANSITION_SPEED));
    }
    const start = view.walkAnim!.gaitStartDistanceCells;
    for (let step = 0; step <= 22; step++) {
        unit.setBoardWalkDistanceCells(start + (step * 1.3) / 11);
        expect(view.walkAnim?.frameIndex).toBe(3 + (step % 11));
        unit.stepSpawnAnimation(0.02);
        expect(view.walkAnim?.frameIndex).toBe(3 + (step % 11));
        unit.ensureVisual(root, grid);
        expect(view.sprite.width).toBeCloseTo(width * THUNDERBIRD_LAB_FLIGHT_CANVAS_SCALE);
    }
    expect(view.walkAnim?.completedCycles).toBe(2);
    let landed = 0;
    expect(unit.finishBoardWalkAnimationAfterFullCycle(() => landed++)).toBe(true);
    for (let i = 14; i < 18; i++) {
        expect(view.walkAnim?.frameIndex).toBe(i);
        expect(view.sprite.width).toBeCloseTo(width * THUNDERBIRD_LAB_FLIGHT_CANVAS_SCALE);
        expect(landed).toBe(0);
        unit.stepSpawnAnimation((meta.frameDurationsMs![i] + 0.01) / (4000 * THUNDERBIRD_LAB_TRANSITION_SPEED));
    }
    expect(landed).toBe(1);
    expect(view.walkAnim).toBeUndefined();
    expect(view.sprite.width).toBeCloseTo(width);
    expect(view.sprite.height).toBeCloseTo(height);
    expect(view.sprite.anchor.x).toBe(oldAnchor.x);
    root.destroy({ children: true });
});

test("leaving the lab preserves an approved flight without restarting or changing its registration", () => {
    const { unit, root, view } = fixture();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.startBoardWalkAnimation(-1, 4);
    const flight = view.walkAnim;
    const scale = view.sprite.scale.clone();
    const anchor = view.sprite.anchor.clone();
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(view.walkAnim).toBe(flight);
    expect(view.sprite.scale.x).toBe(scale.x);
    expect(view.sprite.scale.y).toBe(scale.y);
    expect(view.sprite.anchor.x).toBe(anchor.x);
    expect(view.sprite.anchor.y).toBe(anchor.y);
    unit.stopBoardWalkAnimation();
    expect(unit.getAnimationTextureKey("idle")).toBe("thunderbird_lab_idle_atlas");
    root.destroy({ children: true });
});

test("a short move lands immediately and restarting or cancelling cannot compound the canvas scale", () => {
    const { unit, root, view } = fixture();
    const width = view.sprite.width;
    unit.startBoardWalkAnimation(1, 0.1);
    unit.startBoardWalkAnimation(1, 0.1);
    expect(view.sprite.width).toBeCloseTo(width * THUNDERBIRD_LAB_FLIGHT_CANVAS_SCALE);
    unit.finishBoardWalkAnimationAfterFullCycle(() => {});
    expect(view.walkAnim?.frameIndex).toBe(14);
    unit.stopBoardWalkAnimation();
    expect(view.sprite.width).toBeCloseTo(width);
    unit.startBoardWalkAnimation(-1, Math.sqrt(2));
    unit.stopBoardWalkAnimation();
    expect(view.sprite.width).toBeCloseTo(width);
    root.destroy({ children: true });
});

test("Thunderbird idle plays its independent baked sprite loop without changing scale or flight cadence", () => {
    const { unit, root, view, requested } = fixture();
    const meta = animationAtlases["Thunderbird Lab"].idle;
    expect(meta.frameCount).toBe(40);
    expect(meta.frameDurationsMs).toEqual(Array(40).fill(80));
    expect(meta.totalDurationSec).toBe(3.2);
    expect(unit.getAnimationTextureKey("idle")).toBe("thunderbird_lab_idle_atlas");
    expect(requested).toContain("thunderbird_lab_idle_atlas");
    expect(shouldPreloadUnitAnimationAtlas("thunderbird_lab_idle_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("thunderbird_lab_idle_atlas")).toBe(false);
    const scale = view.sprite.scale.clone();
    const anchor = view.sprite.anchor.clone();
    for (let index = 0; index <= 80; index++) {
        unit.stepSelectionAnimation(view.selectionAnimationStartedAtMs + index * 80 + 0.001);
        expect(view.selectionAnimFrameIndex).toBe(index % 40);
        expect(view.sprite.texture.frame.x).toBe(((index % 40) % 5) * 768);
        expect(view.sprite.texture.frame.y).toBe(Math.floor((index % 40) / 5) * 768);
        expect(view.sprite.scale.x).toBe(scale.x);
        expect(view.sprite.scale.y).toBe(scale.y);
        expect(view.sprite.anchor.x).toBe(anchor.x);
        expect(view.sprite.anchor.y).toBe(anchor.y);
    }
    unit.startBoardWalkAnimation(1, 4);
    const flightTexture = view.sprite.texture;
    unit.stepSelectionAnimation(view.selectionAnimationStartedAtMs + 1200);
    expect(view.sprite.texture).toBe(flightTexture);
    unit.stopBoardWalkAnimation();
    unit.stepSelectionAnimation(view.selectionAnimationStartedAtMs + 1600.001);
    expect(view.selectionAnimFrameIndex).toBe(20);
    expect(view.sprite.texture.width).toBe(768);
    expect(view.sprite.scale.x).toBeCloseTo(scale.x);
    expect(view.sprite.scale.y).toBeCloseTo(scale.y);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("idle")).toBe("thunderbird_lab_idle_atlas");
    expect(view.sprite.texture.width).toBe(768);
    root.destroy({ children: true });
});

test("Thunderbird damage recovers and death holds its corpse at registered source scale", () => {
    const { unit, root, grid, view, requested } = fixture();
    const width = view.sprite.width;
    const idleScale = view.sprite.scale.clone();
    const idleAnchor = view.sprite.anchor.clone();
    for (const state of ["hit", "death"] as const) {
        const meta = animationAtlases["Thunderbird Lab"][state];
        const key = `thunderbird_lab_${state}_atlas`;
        expect(unit.hasAnimationState(state)).toBe(true);
        expect(unit.getAnimationTextureKey(state)).toBe(key);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        let completed = 0;
        expect(unit.playOneShotAnimation(state, () => completed++)).toBe(true);
        expect(requested).toContain(key);
        expect(view.oneShotAnim?.authoredRealTime).toBe(true);
        expect(view.sprite.width).toBeCloseTo(width * THUNDERBIRD_REACTION_CANVAS_SCALE);
        expect(view.sprite.anchor.y).toBeCloseTo(thunderbirdReactionAnchorY(idleAnchor.y));
        expect((192 + (649 * 640) / 768 - view.sprite.anchor.x * 1024) * view.sprite.scale.x).toBeCloseTo(
            (649 - idleAnchor.x * 768) * idleScale.x,
        );
        expect((192 + (742 * 640) / 768 - view.sprite.anchor.y * 1024) * view.sprite.scale.y).toBeCloseTo(
            (742 - idleAnchor.y * 768) * idleScale.y,
        );
        for (let i = 0; i < meta.frameCount; i++) {
            expect(view.oneShotAnim?.frameIndex).toBe(i);
            unit.ensureVisual(root, grid);
            expect(view.sprite.width).toBeCloseTo(width * THUNDERBIRD_REACTION_CANVAS_SCALE);
            expect(completed).toBe(0);
            unit.stepOneShotAnimation(meta.frameDurationsMs![i] + 0.001);
        }
        expect(completed).toBe(1);
        if (state === "death") {
            expect(view.oneShotAnim?.finished).toBe(true);
            const held = view.sprite.texture;
            unit.stepOneShotAnimation(5000);
            unit.stepSelectionAnimation(performance.now() + 5000);
            expect(view.sprite.texture).toBe(held);
            expect(completed).toBe(1);
            unit.returnToIdleAnimation();
        }
        expect(view.oneShotAnim).toBeUndefined();
        expect(view.sprite.width).toBeCloseTo(width);
        expect(view.sprite.scale.x).toBeCloseTo(idleScale.x);
        expect(view.sprite.scale.y).toBeCloseTo(idleScale.y);
        expect(view.sprite.anchor.y).toBeCloseTo(idleAnchor.y);
    }
    root.destroy({ children: true });
});

test("Thunderbird reactions interrupt flight and reset without accumulating canvas scale", () => {
    const { unit, root, grid, view } = fixture();
    const width = view.sprite.width;
    for (const state of ["hit", "death", "hit"]) {
        unit.startBoardWalkAnimation(1, 4);
        expect(unit.playOneShotAnimation(state)).toBe(true);
        expect(view.walkAnim).toBeUndefined();
        expect(view.sprite.width).toBeCloseTo(width * THUNDERBIRD_REACTION_CANVAS_SCALE);
        unit.ensureVisual(root, grid);
        expect(view.sprite.width).toBeCloseTo(width * THUNDERBIRD_REACTION_CANVAS_SCALE);
        unit.returnToIdleAnimation();
        expect(view.sprite.width).toBeCloseTo(width);
    }
    unit.playOneShotAnimation("death");
    const death = view.oneShotAnim;
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(view.oneShotAnim).toBe(death);
    expect(view.sprite.width).toBeCloseTo(width * THUNDERBIRD_REACTION_CANVAS_SCALE);
    expect(unit.getAnimationTextureKey("death")).toBe("thunderbird_lab_death_atlas");
    root.destroy({ children: true });
});

test("Thunderbird directional attacks use distinct authored sprites, hold scale, and recover from every pose", () => {
    const { unit, root, grid, view, requested } = fixture();
    const idleWidth = view.sprite.width;
    const idleAnchor = view.sprite.anchor.clone();
    const keys = new Set<string>();
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down"] as const) {
        const meta = animationAtlases["Thunderbird Lab"][state];
        const key = `thunderbird_lab_${state}_atlas`;
        expect(unit.hasAnimationState(state)).toBe(true);
        expect(unit.getAnimationTextureKey(state)).toBe(key);
        keys.add(key);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        let completed = 0;
        unit.startBoardWalkAnimation(-1, 4);
        expect(unit.playOneShotAnimation(state, () => completed++)).toBe(true);
        expect(view.walkAnim).toBeUndefined();
        expect(requested).toContain(key);
        expect(view.oneShotAnim?.authoredRealTime).toBe(true);
        for (let i = 0; i < meta.frameCount; i++) {
            expect(view.oneShotAnim?.frameIndex).toBe(i);
            unit.ensureVisual(root, grid);
            expect(view.sprite.width).toBeCloseTo(idleWidth * THUNDERBIRD_REACTION_CANVAS_SCALE);
            expect(view.sprite.anchor.y).toBeCloseTo(thunderbirdReactionAnchorY(idleAnchor.y));
            expect(completed).toBe(0);
            unit.stepOneShotAnimation(meta.frameDurationsMs![i] + 0.001);
        }
        expect(completed).toBe(1);
        expect(view.oneShotAnim).toBeUndefined();
        expect(view.sprite.width).toBeCloseTo(idleWidth);
        expect(view.sprite.anchor.y).toBeCloseTo(idleAnchor.y);
        // Switching attacks or interrupting them with a hit must not compound padded-canvas scale.
        unit.playOneShotAnimation(state);
        unit.stepOneShotAnimation(meta.frameDurationsMs![0] + 1);
        unit.playOneShotAnimation("hit");
        expect(view.sprite.width).toBeCloseTo(idleWidth * THUNDERBIRD_REACTION_CANVAS_SCALE);
        unit.returnToIdleAnimation();
        expect(view.sprite.width).toBeCloseTo(idleWidth);
    }
    expect(keys.size).toBe(3);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("melee_attack")).toBe("thunderbird_lab_melee_attack_atlas");
    root.destroy({ children: true });
});
