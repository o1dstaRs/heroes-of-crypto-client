import { HIT_REACTION_ADDITIONAL_SPEED } from "../settings/hitTiming";
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
    MAGIC_DRAGON_LAB_DEATH_SPEED,
    MAGIC_DRAGON_LAB_HIT_SPEED,
    MAGIC_DRAGON_LAB_ACTION_CANVAS_SCALE,
} from "./MagicDragonLabReactions";
import {
    MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE,
    MAGIC_DRAGON_LAB_FLIGHT_ANCHOR_X,
    MAGIC_DRAGON_LAB_TRANSITION_SPEED,
    MAGIC_DRAGON_LAB_IDLE_SPEED,
    magicDragonLabFlightAnchorY,
} from "./MagicDragonLabFlight";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
});

function fixture(lab = true) {
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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Nature", "Magic Dragon", "magic_dragon_512", 1),
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
    const idleMeta = animationAtlases["Magic Dragon Lab"].idle;
    const idleAtlas = new Texture({
        source: new BufferImageSource({
            resource: new Uint8Array(4),
            width: idleMeta.atlasWidth,
            height: idleMeta.atlasHeight,
        }),
    });
    const requested: string[] = [];
    const unit = RenderableUnit.fromBase(base, (key) => {
        requested.push(key);
        if (key === "magic_dragon_lab_idle_atlas") return idleAtlas;
        return key.includes("_atlas") ? atlas : idle;
    });
    const root = new Container();
    unit.setPosition(0, 1024);
    unit.setCreatureAnimationLabPreviewEnabled(lab);
    unit.ensureVisual(root, grid);
    const view = unit as unknown as {
        sprite: Sprite;
        oneShotAnim?: { frameIndex: number; finished?: boolean; authoredRealTime?: boolean };
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

test("Magic Dragon flight follows the approved package policy and keeps the full-resolution atlas", () => {
    expect(creatureWalkAnimationEnabledForUnit("Magic Dragon", true)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Magic Dragon", false)).toBe(usesApprovedBaseAnimations("Magic Dragon"));
    expect(shouldPreloadUnitAnimationAtlas("magic_dragon_lab_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("magic_dragon_lab_walk_atlas")).toBe(false);
    expect(animationAtlases["Magic Dragon Lab"].walk.frameDurationsMs).toEqual(
        animationAtlases["Wyvern Lab"].walk.frameDurationsMs,
    );
});

test("flight keeps registration and cadence while takeoff and landing run 15% faster than before", () => {
    expect(MAGIC_DRAGON_LAB_TRANSITION_SPEED / (1.35 * 1.15)).toBeCloseTo(1.15);
    const { unit, root, grid, view, requested } = fixture();
    const meta = animationAtlases["Magic Dragon Lab"].walk;
    const width = view.sprite.width,
        height = view.sprite.height;
    const oldScale = view.sprite.scale.clone();
    const oldAnchor = view.sprite.anchor.clone();
    unit.startBoardWalkAnimation(1, 8);
    expect(requested).toContain("magic_dragon_lab_walk_atlas");
    expect(view.sprite.width).toBeCloseTo(width * MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE);
    expect(view.sprite.height).toBeCloseTo(height * MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE);
    expect(view.sprite.anchor.x).toBe(MAGIC_DRAGON_LAB_FLIGHT_ANCHOR_X);
    expect(view.sprite.anchor.y).toBeCloseTo(magicDragonLabFlightAnchorY(oldAnchor.y));
    // Any point in the canonical figure lands at the same position after canvas registration.
    expect(((232 + 698) / 1.5 - view.sprite.anchor.x * 768) * view.sprite.scale.x).toBeCloseTo(
        (698 - oldAnchor.x * 768) * oldScale.x,
    );
    expect(((384 + 713) / 1.5 - view.sprite.anchor.y * 768) * view.sprite.scale.y).toBeCloseTo(
        (713 - oldAnchor.y * 768) * oldScale.y,
    );
    for (let i = 0; i < 3; i++) {
        expect(view.walkAnim?.frameIndex).toBe(i);
        unit.stepSpawnAnimation((meta.frameDurationsMs![i] + 0.01) / (4000 * MAGIC_DRAGON_LAB_TRANSITION_SPEED));
    }
    const start = view.walkAnim!.gaitStartDistanceCells;
    for (let step = 0; step <= 22; step++) {
        unit.setBoardWalkDistanceCells(start + (step * 1.3) / 11);
        expect(view.walkAnim?.frameIndex).toBe(3 + (step % 11));
        unit.stepSpawnAnimation(0.02);
        expect(view.walkAnim?.frameIndex).toBe(3 + (step % 11));
        unit.ensureVisual(root, grid);
        expect(view.sprite.width).toBeCloseTo(width * MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE);
    }
    expect(view.walkAnim?.completedCycles).toBe(2);
    let landed = 0;
    expect(unit.finishBoardWalkAnimationAfterFullCycle(() => landed++)).toBe(true);
    for (let i = 14; i < 18; i++) {
        expect(view.walkAnim?.frameIndex).toBe(i);
        expect(landed).toBe(0);
        expect(view.sprite.width).toBeCloseTo(width * MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE);
        expect(view.sprite.height).toBeCloseTo(height * MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE);
        unit.ensureVisual(root, grid);
        expect(view.sprite.width).toBeCloseTo(width * MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE);
        expect(view.sprite.height).toBeCloseTo(height * MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE);
        expect(view.sprite.anchor.x).toBe(MAGIC_DRAGON_LAB_FLIGHT_ANCHOR_X);
        unit.stepSpawnAnimation((meta.frameDurationsMs![i] + 0.01) / (4000 * MAGIC_DRAGON_LAB_TRANSITION_SPEED));
    }
    expect(landed).toBe(1);
    expect(view.walkAnim).toBeUndefined();
    expect(view.sprite.width).toBeCloseTo(width);
    expect(view.sprite.height).toBeCloseTo(height);
    expect(view.sprite.anchor.x).toBe(oldAnchor.x);
    root.destroy({ children: true });
});

test("authored idle loops forward without a pause and yields the sprite during flight", () => {
    const { unit, root, view, requested } = fixture();
    expect(requested).toContain("magic_dragon_lab_idle_atlas");
    expect(shouldPreloadUnitAnimationAtlas("magic_dragon_lab_idle_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("magic_dragon_lab_idle_atlas")).toBe(false);
    const meta = animationAtlases["Magic Dragon Lab"].idle;
    expect(meta.frameCount).toBe(48);
    expect(meta.frameDurationsMs).toEqual(Array(48).fill(80));
    const start = view.selectionAnimationStartedAtMs;
    const width = view.sprite.width;
    const height = view.sprite.height;
    for (let i = 0; i < 96; i++) {
        unit.stepSelectionAnimation(start + (i * 80) / MAGIC_DRAGON_LAB_IDLE_SPEED + 0.01);
        expect(view.selectionAnimFrameIndex).toBe(i % 48);
        expect(view.sprite.width).toBeCloseTo(width);
        expect(view.sprite.height).toBeCloseTo(height);
    }
    unit.startBoardWalkAnimation(1, 4);
    const flightTexture = view.sprite.texture;
    unit.stepSelectionAnimation(start + 4000);
    expect(view.sprite.texture).toBe(flightTexture);
    unit.stopBoardWalkAnimation();
    unit.stepSelectionAnimation(start + 4010);
    expect(view.sprite.width).toBeCloseTo(width);
    expect(view.sprite.height).toBeCloseTo(height);
    expect(view.sprite.texture).not.toBe(flightTexture);
    root.destroy({ children: true });
    const normal = fixture(false);
    expect(normal.requested.includes("magic_dragon_lab_idle_atlas")).toBe(usesApprovedBaseAnimations("Magic Dragon"));
    normal.root.destroy({ children: true });
});

test("a short move lands immediately and restarting or cancelling cannot compound the canvas scale", () => {
    const { unit, root, view } = fixture();
    const width = view.sprite.width;
    unit.startBoardWalkAnimation(1, 0.1);
    unit.startBoardWalkAnimation(1, 0.1);
    expect(view.sprite.width).toBeCloseTo(width * MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE);
    unit.finishBoardWalkAnimationAfterFullCycle(() => {});
    expect(view.walkAnim?.frameIndex).toBe(14);
    unit.stopBoardWalkAnimation();
    expect(view.sprite.width).toBeCloseTo(width);
    unit.startBoardWalkAnimation(-1, Math.sqrt(2));
    unit.stopBoardWalkAnimation();
    expect(view.sprite.width).toBeCloseTo(width);
    root.destroy({ children: true });
});

test("Magic Dragon reactions interrupt flight, recover from hit and hold a grounded death", () => {
    const { unit, root, grid, view, requested } = fixture();
    const width = view.sprite.width;
    const height = view.sprite.height;
    expect(MAGIC_DRAGON_LAB_IDLE_SPEED).toBe(1.22);
    for (const state of ["hit", "death"]) {
        const key = `magic_dragon_lab_${state}_atlas`;
        expect(unit.getAnimationTextureKey(state)).toBe(key);
        expect(unit.hasAnimationState(state)).toBe(true);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        unit.startBoardWalkAnimation(1, 4);
        let completed = 0;
        expect(unit.playOneShotAnimation(state, () => completed++)).toBe(true);
        expect(view.walkAnim).toBeUndefined();
        expect(view.oneShotAnim?.authoredRealTime).toBe(true);
        expect(requested).toContain(key);
        const durations = animationAtlases["Magic Dragon Lab"][state].frameDurationsMs!.map(
            (ms) =>
                ms /
                (state === "death"
                    ? MAGIC_DRAGON_LAB_DEATH_SPEED
                    : MAGIC_DRAGON_LAB_HIT_SPEED * HIT_REACTION_ADDITIONAL_SPEED),
        );
        for (let i = 0; i < durations.length; i++) {
            expect(view.oneShotAnim?.frameIndex).toBe(i);
            unit.ensureVisual(root, grid);
            expect(view.sprite.width).toBeCloseTo(width);
            expect(view.sprite.height).toBeCloseTo(height);
            unit.stepOneShotAnimation(durations[i] + 0.001);
        }
        expect(completed).toBe(1);
        if (state === "death") {
            expect(view.oneShotAnim?.finished).toBe(true);
            const held = view.sprite.texture;
            unit.stepOneShotAnimation(5000);
            unit.stepSelectionAnimation(performance.now() + 5000);
            expect(view.sprite.texture).toBe(held);
            expect(completed).toBe(1);
        } else expect(view.oneShotAnim).toBeUndefined();
        unit.returnToIdleAnimation();
        unit.ensureVisual(root, grid);
        expect(view.sprite.width).toBeCloseTo(width);
        expect(view.sprite.height).toBeCloseTo(height);
    }
    root.destroy({ children: true });
    const normal = fixture(false);
    expect(normal.unit.getAnimationTextureKey("hit") === "magic_dragon_lab_hit_atlas").toBe(
        usesApprovedBaseAnimations("Magic Dragon"),
    );
    normal.root.destroy({ children: true });
});

test("hit preserves every pose and registration with the additional 17% speed increase", () => {
    const { unit, root, grid, view } = fixture();
    const initialScale = view.sprite.scale.clone();
    const initialAnchor = view.sprite.anchor.clone();
    for (let replay = 0; replay < 2; replay++) {
        unit.playOneShotAnimation("hit");
        const textures = new Set<Texture>();
        const durations = animationAtlases["Magic Dragon Lab"].hit.frameDurationsMs!.map(
            (ms) => ms / MAGIC_DRAGON_LAB_HIT_SPEED / HIT_REACTION_ADDITIONAL_SPEED,
        );
        for (let i = 0; i < durations.length; i++) {
            const texture = view.sprite.texture;
            textures.add(texture);
            expect(view.sprite.anchor.x).toBe(initialAnchor.x);
            unit.ensureVisual(root, grid);
            expect(view.sprite.texture).toBe(texture);
            expect(view.sprite.scale.x).toBeCloseTo(initialScale.x);
            expect(view.sprite.scale.y).toBeCloseTo(initialScale.y);
            expect(view.sprite.anchor.y).toBe(initialAnchor.y);
            expect(view.sprite.anchor.x).toBe(initialAnchor.x);
            unit.stepOneShotAnimation(durations[i] + 0.001);
        }
        expect(view.oneShotAnim).toBeUndefined();
        expect(textures.size).toBe(durations.length);
        expect(view.sprite.anchor.x).toBe(initialAnchor.x);
    }
    unit.playOneShotAnimation("hit");
    unit.stepOneShotAnimation(45);
    unit.returnToIdleAnimation();
    expect(view.sprite.anchor.x).toBe(initialAnchor.x);
    let completed = 0;
    unit.playOneShotAnimation("hit", () => completed++);
    unit.stepOneShotAnimation(350 / 1.3 / HIT_REACTION_ADDITIONAL_SPEED - 0.1);
    expect(completed).toBe(0);
    expect(view.oneShotAnim).toBeDefined();
    unit.stepOneShotAnimation(0.2);
    expect(completed).toBe(1);
    expect(view.oneShotAnim).toBeUndefined();
    root.destroy({ children: true });
});

test("death finishes at 925 / 1.3 ms and holds its last pose", () => {
    const { unit, root, view } = fixture();
    let completed = 0;
    unit.playOneShotAnimation("death", () => completed++);
    unit.stepOneShotAnimation(925 / 1.3 - 0.1);
    expect(completed).toBe(0);
    expect(view.oneShotAnim?.finished).not.toBe(true);
    unit.stepOneShotAnimation(0.2);
    expect(completed).toBe(1);
    expect(view.oneShotAnim?.finished).toBe(true);
    expect(view.oneShotAnim?.frameIndex).toBe(7);
    root.destroy({ children: true });
});

test("bites and rainbow cast keep native pixel scale and support points across every cel and repeated playback", () => {
    for (const lab of [true, false]) {
        if (!lab && !usesApprovedBaseAnimations("Magic Dragon")) continue;
        const { unit, root, grid, view, requested } = fixture(lab);
        const initialScale = view.sprite.scale.clone();
        const initialAnchor = view.sprite.anchor.clone();
        const initialWidth = view.sprite.width;
        for (const state of ["melee_attack_up", "melee_attack", "melee_attack_down", "cast", "cast", "melee_attack"]) {
            const meta = animationAtlases["Magic Dragon Lab"][state];
            const imageKey = `magic_dragon_lab_${state}_atlas`;
            expect(shouldPreloadUnitAnimationAtlas(imageKey, false)).toBe(true);
            expect(isRedundantFullResolutionUnitAtlasKey(imageKey)).toBe(false);
            let completed = 0;
            expect(unit.playOneShotAnimation(state, () => completed++)).toBe(true);
            expect(requested).toContain(imageKey);
            const poses = new Set<Texture>();
            for (let i = 0; i < meta.frameCount; i++) {
                expect(view.oneShotAnim?.frameIndex).toBe(i);
                expect(view.oneShotAnim?.authoredRealTime).toBe(true);
                poses.add(view.sprite.texture);
                unit.ensureVisual(root, grid);
                expect(view.sprite.width).toBeCloseTo(initialWidth * MAGIC_DRAGON_LAB_ACTION_CANVAS_SCALE);
                expect(view.sprite.scale.x).toBeCloseTo(initialScale.x);
                expect(view.sprite.scale.y).toBeCloseTo(initialScale.y);
                // Every canonical contact has the same world position on the padded canvas.
                for (const [x, y] of [
                    [254, 692],
                    [396, 667],
                    [543, 717],
                    [667, 689],
                ]) {
                    expect((128 + x - view.sprite.anchor.x * 1024) * view.sprite.scale.x).toBeCloseTo(
                        (x - initialAnchor.x * 768) * initialScale.x,
                    );
                    expect((128 + y - view.sprite.anchor.y * 1024) * view.sprite.scale.y).toBeCloseTo(
                        (y - initialAnchor.y * 768) * initialScale.y,
                    );
                }
                unit.stepOneShotAnimation(meta.frameDurationsMs![i] + 0.001);
            }
            expect(poses.size).toBe(meta.frameCount);
            expect(completed).toBe(1);
            expect(view.oneShotAnim).toBeUndefined();
            expect(view.sprite.width).toBeCloseTo(initialWidth);
            expect(view.sprite.anchor.y).toBeCloseTo(initialAnchor.y);
        }
        root.destroy({ children: true });
    }
});

test("bite interruption by flight or hit releases padding without accumulating scale", () => {
    const { unit, root, grid, view } = fixture();
    const initialWidth = view.sprite.width;
    for (let repeat = 0; repeat < 3; repeat++) {
        unit.playOneShotAnimation("melee_attack_down");
        unit.stepOneShotAnimation(160);
        unit.startBoardWalkAnimation(1, 4);
        expect(view.oneShotAnim).toBeUndefined();
        expect(view.walkAnim).toBeDefined();
        unit.ensureVisual(root, grid);
        expect(view.sprite.width).toBeCloseTo(initialWidth * MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE);
        unit.playOneShotAnimation("melee_attack_up");
        expect(view.walkAnim).toBeUndefined();
        unit.ensureVisual(root, grid);
        expect(view.sprite.width).toBeCloseTo(initialWidth * MAGIC_DRAGON_LAB_ACTION_CANVAS_SCALE);
        unit.playOneShotAnimation("hit");
        unit.ensureVisual(root, grid);
        expect(view.sprite.width).toBeCloseTo(initialWidth);
        unit.returnToIdleAnimation();
        expect(view.sprite.width).toBeCloseTo(initialWidth);
        expect(view.sprite.anchor.y).toBeCloseTo(730 / 768);
    }
    root.destroy({ children: true });
});

test("rainbow cast retains upward attack timing and clears on hit, death, flight and reset", () => {
    const cast = animationAtlases["Magic Dragon Lab"].cast;
    const up = animationAtlases["Magic Dragon Lab"].melee_attack_up;
    expect(cast.frameCount).toBe(up.frameCount * 2);
    for (let i = 0; i < up.frameCount; i++) {
        expect(cast.frameDurationsMs![i * 2] + cast.frameDurationsMs![i * 2 + 1]).toBe(up.frameDurationsMs![i]);
    }
    expect(cast.totalDurationSec).toBe(up.totalDurationSec);
    const { unit, root, grid, view, requested } = fixture();
    const width = view.sprite.width;
    for (const interruption of ["hit", "death", "walk", "reset"]) {
        let completed = 0;
        expect(unit.playOneShotAnimation("cast", () => completed++)).toBe(true);
        unit.stepOneShotAnimation(250);
        const castTexture = view.sprite.texture;
        if (interruption === "walk") unit.startBoardWalkAnimation(1, 4);
        else if (interruption === "reset") unit.returnToIdleAnimation();
        else expect(unit.playOneShotAnimation(interruption)).toBe(true);
        unit.ensureVisual(root, grid);
        expect(view.sprite.texture).not.toBe(castTexture);
        expect(view.sprite.width).toBeCloseTo(
            width * (interruption === "walk" ? MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE : 1),
        );
        // Interrupting a cast must not fire its successful-completion callback.
        expect(completed).toBe(0);
        if (interruption === "walk") unit.stopBoardWalkAnimation();
        unit.returnToIdleAnimation();
        expect(view.sprite.width).toBeCloseTo(width);
        expect(view.sprite.anchor.y).toBeCloseTo(730 / 768);
    }
    expect(requested).toContain("magic_dragon_lab_cast_atlas");
    root.destroy({ children: true });
});

test("ordinary combat uses the complete approved dragon package with exactly the lab frame timings and registration", () => {
    expect(usesApprovedBaseAnimations("Magic Dragon")).toBe(true);
    const normal = fixture(false),
        lab = fixture(true);
    const snapshot = (f: ReturnType<typeof fixture>) => ({
        width: f.view.sprite.width,
        height: f.view.sprite.height,
        scaleX: f.view.sprite.scale.x,
        scaleY: f.view.sprite.scale.y,
        anchorX: f.view.sprite.anchor.x,
        anchorY: f.view.sprite.anchor.y,
        frame: f.view.oneShotAnim?.frameIndex,
    });
    try {
        expect(snapshot(normal)).toEqual(snapshot(lab));
        for (const state of ["melee_attack_up", "melee_attack", "melee_attack_down", "cast", "hit", "death"]) {
            expect(normal.unit.playOneShotAnimation(state)).toBe(true);
            expect(lab.unit.playOneShotAnimation(state)).toBe(true);
            expect(normal.requested).toContain(`magic_dragon_lab_${state}_atlas`);
            for (let t = 0; t < 1500; t += 10) {
                normal.unit.stepOneShotAnimation(10);
                lab.unit.stepOneShotAnimation(10);
                expect(snapshot(normal)).toEqual(snapshot(lab));
            }
        }
    } finally {
        normal.root.destroy({ children: true });
        lab.root.destroy({ children: true });
    }
});
