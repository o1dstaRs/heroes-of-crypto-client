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
import { BufferImageSource, Container, Texture, Sprite, ColorMatrixFilter } from "pixi.js";
import { animationAtlases } from "../generated/animation_atlases";
import { RenderableUnit, CREATURE_SPRITE_ANIMATION_SETTINGS, COMMON_IDLE_BREATH_SETTINGS } from "./RenderableUnit";
import { shouldPreloadUnitAnimationAtlas } from "../pixi/creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import { creatureWalkAnimationEnabledForUnit } from "./RenderableUnit";
import { syncValkyrieLabIdle, valkyrieIdleMotion } from "./ValkyrieLabIdle";
import { VALKYRIE_DEATH_SPEED, VALKYRIE_HIT_SPEED, VALKYRIE_REACTION_POSE_SCALES } from "./ValkyrieLabReactions";
import {
    VALKYRIE_LAB_WALK_SCALE,
    VALKYRIE_LAB_WALK_ANCHOR_X,
    VALKYRIE_LAB_BODY_SCALE,
    VALKYRIE_LAB_POSE_SCALES,
    VALKYRIE_LAB_SOURCE_TEXTURE,
    VALKYRIE_LAB_WIDTH_SCALE,
    VALKYRIE_LAB_TRANSITION_SPEED,
    VALKYRIE_LAB_FLIGHT_SPEED,
    VALKYRIE_LAB_MATERIAL_SAMPLES,
    valkyrieLabMaterialColor,
    syncValkyrieLabWalk,
} from "./ValkyrieLabWalk";
const staged = { meta: animationAtlases["Valkyrie Lab Current"].walk };
const settings = { ...CREATURE_SPRITE_ANIMATION_SETTINGS };
const oldBreath = COMMON_IDLE_BREATH_SETTINGS.enabled;
const grid = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const atlasTexture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 4096 }),
});
const texture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
});
beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = false;
    COMMON_IDLE_BREATH_SETTINGS.enabled = false;
});
afterAll(() => {
    Object.assign(CREATURE_SPRITE_ANIMATION_SETTINGS, settings);
    COMMON_IDLE_BREATH_SETTINGS.enabled = oldBreath;
});
function make(labPreview = true) {
    const effects = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Valkyrie", "valkyrie_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const unit = RenderableUnit.fromBase(base, (key) => (key.includes("_atlas") ? atlasTexture : texture));
    unit.setPosition(0, 1024);
    const root = new Container();
    unit.ensureVisual(root, grid);
    unit.setCreatureAnimationLabPreviewEnabled(labPreview);
    return {
        unit,
        root,
        internal: unit as unknown as {
            sprite: import("pixi.js").Sprite;
            walkAnim?: {
                frames: Texture[];
                loopStartFrame: number;
                loopEndFrame: number;
                outroFrame: number;
                outroEndFrame: number;
                frameIndex: number;
                gaitStartDistanceCells: number;
                completedCycles: number;
            };
            oneShotAnim?: {
                frameIndex: number;
                finished?: boolean;
                authoredRealTime?: boolean;
                frames: Texture[];
            };
        },
    };
}
test("lab Valkyrie flies eight frames at the requested 7% faster distance cadence and lands once", () => {
    const { unit, internal } = make();
    expect(unit.canFly()).toBe(true);
    unit.startBoardWalkAnimation(1, 8);
    expect(internal.walkAnim!.frames.length).toBe(16);
    expect(internal.walkAnim!.loopStartFrame).toBe(4);
    expect(internal.walkAnim!.loopEndFrame).toBe(11);
    expect(internal.walkAnim!.outroFrame).toBe(12);
    expect(internal.walkAnim!.outroEndFrame).toBe(15);
    for (let i = 0; i < 4; i++) {
        unit.setBoardWalkDistanceCells(i * 0.1);
        unit.stepSpawnAnimation((staged.meta.frameDurationsMs![i] + 0.01) / (4000 * VALKYRIE_LAB_TRANSITION_SPEED));
    }
    expect(internal.walkAnim!.frameIndex).toBe(4);
    const start = internal.walkAnim!.gaitStartDistanceCells;
    for (let i = 0; i <= 16; i++) {
        unit.setBoardWalkDistanceCells(start + (i * 1.3) / (8 * VALKYRIE_LAB_FLIGHT_SPEED));
        expect(internal.walkAnim!.frameIndex).toBe(4 + (i % 8));
        unit.stepSpawnAnimation(0.5);
        expect(internal.walkAnim!.frameIndex).toBe(4 + (i % 8));
        if (i === 5) unit.setBoardFacingFromMovement(-1);
    }
    expect(internal.walkAnim!.completedCycles).toBe(2);
    unit.setBoardWalkDistanceCells(start + 2.6 + Math.SQRT2);
    expect(internal.walkAnim!.frameIndex).toBe(
        4 + (Math.floor((2.6 + Math.SQRT2) / (1.3 / VALKYRIE_LAB_FLIGHT_SPEED / 8) + 1e-9) % 8),
    );
    let complete = 0;
    expect(unit.finishBoardWalkAnimationAfterFullCycle(() => complete++)).toBe(true);
    for (let i = 12; i < 16; i++) {
        expect(internal.walkAnim!.frameIndex).toBe(i);
        expect(complete).toBe(0);
        unit.stepSpawnAnimation((staged.meta.frameDurationsMs![i] + 0.01) / (4000 * VALKYRIE_LAB_TRANSITION_SPEED));
    }
    expect(internal.walkAnim).toBeUndefined();
    expect(complete).toBe(1);
});
test("very short movement still plays all four landing frames exactly once", () => {
    const { unit, internal } = make();
    unit.startBoardWalkAnimation(-1, 0.025);
    let complete = 0;
    unit.finishBoardWalkAnimationAfterFullCycle(() => complete++);
    for (let i = 12; i < 16; i++) {
        expect(internal.walkAnim!.frameIndex).toBe(i);
        unit.stepSpawnAnimation((staged.meta.frameDurationsMs![i] + 0.01) / (4000 * VALKYRIE_LAB_TRANSITION_SPEED));
    }
    expect(complete).toBe(1);
    unit.stepSpawnAnimation(0.5);
    expect(complete).toBe(1);
});

test("corrected Valkyrie atlas is available in the lab while the approved package switch is off", () => {
    expect(creatureWalkAnimationEnabledForUnit("Valkyrie", true)).toBe(true);
    expect(creatureWalkAnimationEnabledForUnit("Valkyrie", false)).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("valkyrie_lab_current_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("valkyrie_lab_current_walk_atlas")).toBe(false);
    expect(animationAtlases.Valkyrie.walk.frameCount).toBe(9);
});
test("approved Valkyrie package plays every action and flight in ordinary combat", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    try {
        expect(creatureWalkAnimationEnabledForUnit("Valkyrie", false)).toBe(true);
        const { unit, internal } = make(false);
        unit.startBoardWalkAnimation(1, 8);
        expect(internal.walkAnim!.frames).toHaveLength(16);
        unit.stopBoardWalkAnimation();
        for (const state of ["hit", "death", "cast", "melee_attack", "melee_attack_up", "melee_attack_down"]) {
            unit.returnToIdleAnimation();
            expect(unit.getAnimationTextureKey(state)).toBe(`valkyrie_lab_current_${state}_atlas`);
            expect(unit.playOneShotAnimation(state, () => {}, true)).toBe(true);
            expect(internal.oneShotAnim!.frames).toHaveLength(8);
        }
        unit.returnToIdleAnimation();
        unit.stepSpawnAnimation(0.1);
        expect(internal.sprite.filters?.length).toBeGreaterThan(0);
    } finally {
        CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = false;
    }
});
test("takeoff, landing and lab exit preserve source size and horizontal registration", () => {
    const { unit, root, internal } = make();
    const initialHeight = internal.sprite.height;
    const initialWidth = internal.sprite.width;
    for (const direction of [1, -1]) {
        unit.startBoardWalkAnimation(direction, 8);
        expect(internal.sprite.height / initialHeight).toBeCloseTo(VALKYRIE_LAB_WALK_SCALE);
        expect(internal.sprite.width / initialWidth).toBeCloseTo(VALKYRIE_LAB_WALK_SCALE);
        expect(internal.sprite.anchor.x).toBeCloseTo(VALKYRIE_LAB_WALK_ANCHOR_X);
        unit.ensureVisual(root, grid);
        expect(internal.sprite.height / initialHeight).toBeCloseTo(VALKYRIE_LAB_WALK_SCALE);
        expect(internal.sprite.anchor.x).toBeCloseTo(VALKYRIE_LAB_WALK_ANCHOR_X);
        unit.stopBoardWalkAnimation();
        expect(internal.sprite.height).toBeCloseTo(initialHeight);
        expect(internal.sprite.width).toBeCloseTo(initialWidth);
        expect(internal.sprite.anchor.x).toBe(0.5);
    }
    unit.startBoardWalkAnimation(1, 1);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(internal.walkAnim).toBeUndefined();
    expect(internal.sprite.height).toBeCloseTo(initialHeight);
    expect(internal.sprite.anchor.x).toBe(0.5);
});

test("redrawn poses keep calibrated body size through visual sync, then restore untouched idle", () => {
    const { unit, root, internal } = make();
    const height = internal.sprite.height;
    unit.startBoardWalkAnimation(1, 3);
    unit.stepSpawnAnimation(0.099 / (4 * VALKYRIE_LAB_TRANSITION_SPEED));
    expect(internal.walkAnim!.frameIndex).toBe(0);
    unit.stepSpawnAnimation(0.002 / (4 * VALKYRIE_LAB_TRANSITION_SPEED));
    expect(internal.walkAnim!.frameIndex).toBe(1);
    const flightHeight = height * VALKYRIE_LAB_WALK_SCALE * VALKYRIE_LAB_POSE_SCALES[1];
    expect(internal.sprite.height).toBeCloseTo(flightHeight);
    for (let i = 0; i < 3; i++) {
        unit.ensureVisual(root, grid);
        expect(internal.sprite.height).toBeCloseTo(flightHeight);
    }
    unit.finishBoardWalkAnimationAfterFullCycle();
    expect(internal.sprite.height).toBeCloseTo(height * VALKYRIE_LAB_WALK_SCALE * VALKYRIE_LAB_POSE_SCALES[12]);
    unit.stopBoardWalkAnimation();
    expect(internal.sprite.height).toBeCloseTo(height);
    unit.ensureVisual(root, grid);
    expect(internal.sprite.height).toBeCloseTo(height);
});
test("Valkyrie grade preserves alpha, unrelated filters and endpoint colors", () => {
    const sprite = new Sprite(texture);
    const unrelated = new ColorMatrixFilter();
    sprite.filters = [unrelated];
    sprite.scale.set(-2, 3);
    syncValkyrieLabWalk(sprite, 4);
    expect(sprite.scale.x).toBeCloseTo(-2 * VALKYRIE_LAB_BODY_SCALE * VALKYRIE_LAB_WIDTH_SCALE);
    expect(sprite.filters![0]).not.toBe(unrelated);
    expect(sprite.alpha).toBe(1);
    syncValkyrieLabWalk(sprite, 11);
    expect(sprite.filters).toHaveLength(3);
    expect(sprite.scale.y).toBeCloseTo(3 * VALKYRIE_LAB_BODY_SCALE);
    syncValkyrieLabWalk(sprite, 15);
    expect(sprite.scale.x).toBeCloseTo(-2);
    expect(sprite.scale.y).toBeCloseTo(3);
    expect(sprite.filters).toEqual([unrelated]);
    syncValkyrieLabWalk(sprite, 0);
    expect(sprite.filters).toEqual([unrelated]);
});

test("measured material colors match the base figure without losing its warm gold", () => {
    for (const [source, target] of VALKYRIE_LAB_MATERIAL_SAMPLES) {
        const corrected = valkyrieLabMaterialColor(source);
        for (let c = 0; c < 3; c++) expect(Math.abs(corrected[c] - target[c])).toBeLessThan(1);
    }
    expect(valkyrieLabMaterialColor([0, 0, 0])).toEqual([0, 0, 0]);
    expect(VALKYRIE_LAB_TRANSITION_SPEED).toBeCloseTo(1.794);
});
test("body and leg width stay narrow across poses, mirrors and repeated visual sync", () => {
    for (const direction of [1, -1]) {
        const { unit, root, internal } = make();
        const width = internal.sprite.width;
        unit.startBoardWalkAnimation(direction, 4);
        for (let i = 0; i < 4; i++) unit.stepSpawnAnimation(0.101 / (4 * VALKYRIE_LAB_TRANSITION_SPEED));
        const walk = internal.walkAnim!;
        for (let frame = 0; frame < 16; frame++) {
            unit.setBoardWalkDistanceCells(
                walk.gaitStartDistanceCells + (frame * 1.3) / (8 * VALKYRIE_LAB_FLIGHT_SPEED),
            );
            unit.ensureVisual(root, grid);
            unit.ensureVisual(root, grid);
            expect(internal.sprite.width / width).toBeCloseTo(
                VALKYRIE_LAB_WALK_SCALE * VALKYRIE_LAB_BODY_SCALE * VALKYRIE_LAB_WIDTH_SCALE,
            );
        }
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(internal.sprite.width).toBeCloseTo(width);
    }
});

test("limb correction follows takeoff/contact poses and is isolated between sprites", () => {
    const a = new Sprite(texture),
        b = new Sprite(texture);
    syncValkyrieLabWalk(a, 1);
    syncValkyrieLabWalk(b, 5);
    const limbFilter = (sprite: Sprite) => sprite.filters!.find((filter) => "limbs" in filter.resources)!;
    const aFilter = limbFilter(a),
        bFilter = limbFilter(b);
    expect(aFilter).not.toBe(bFilter);
    expect(aFilter.resources.limbs.uniforms.uLegWidth).toBe(0.78);
    expect(bFilter.resources.limbs.uniforms.uLegWidth).toBe(0.88);
    syncValkyrieLabWalk(a, 14);
    expect(Array.from(aFilter.resources.limbs.uniforms.uNearShin)).toEqual([289, 377, 259, 435]);
    expect(bFilter.resources.limbs.uniforms.uLegWidth).toBe(0.88);
    syncValkyrieLabWalk(a, 15);
    expect(a.filters).toBeNull();
    expect(b.filters).toHaveLength(2);
    syncValkyrieLabWalk(b, -1);
    expect(b.filters).toBeNull();
});

test("flight reference is the actual factory-selected battlefield idle", async () => {
    const { staticBattlefieldTextureNameForUnit } = await import("../pixi/PixiUnitsFactory");
    expect(VALKYRIE_LAB_SOURCE_TEXTURE).toBe(staticBattlefieldTextureNameForUnit("Valkyrie"));
    expect(VALKYRIE_LAB_SOURCE_TEXTURE).not.toBe("valkyrie_final");
    expect(make().unit.getAnimationTextureKey("idle")).toBe(VALKYRIE_LAB_SOURCE_TEXTURE);
});

test("landing endpoint and restored idle keep the same source landmark before and after visual sync", () => {
    for (const direction of [1, -1]) {
        const { unit, root, internal } = make();
        const landmarkY = (pixel: number) =>
            internal.sprite.y +
            (pixel - internal.sprite.anchor.y * internal.sprite.texture.height) * internal.sprite.scale.y;
        const idleY = landmarkY(384);
        unit.startBoardWalkAnimation(direction, 4);
        unit.finishBoardWalkAnimationAfterFullCycle();
        for (let frame = 12; frame < 15; frame++)
            unit.stepSpawnAnimation(
                (staged.meta.frameDurationsMs![frame] + 0.01) / (4000 * VALKYRIE_LAB_TRANSITION_SPEED),
            );
        expect(internal.walkAnim!.frameIndex).toBe(15);
        expect(landmarkY(49 + 435 / 2)).toBeCloseTo(idleY, 6);
        unit.ensureVisual(root, grid);
        expect(landmarkY(49 + 435 / 2)).toBeCloseTo(idleY, 6);
        unit.stepSpawnAnimation((staged.meta.frameDurationsMs![15] + 0.01) / (4000 * VALKYRIE_LAB_TRANSITION_SPEED));
        expect(internal.walkAnim).toBeUndefined();
        expect(landmarkY(384)).toBeCloseTo(idleY, 6);
        unit.ensureVisual(root, grid);
        expect(landmarkY(384)).toBeCloseTo(idleY, 6);
    }
});

test("idle wind yields immediately to flight, returns neutral after landing and clears on lab exit", () => {
    const { unit, root, internal } = make();
    const idleFilter = () =>
        internal.sprite.filters?.find((filter) => "uMotion" in (filter.resources.idle?.uniforms ?? {}));
    unit.ensureVisual(root, grid);
    expect(idleFilter()).toBeDefined();
    const baseTexture = internal.sprite.texture;
    const baseScale = internal.sprite.scale.clone();
    syncValkyrieLabIdle(internal.sprite, true, 1200);
    expect(internal.sprite.texture).toBe(baseTexture);
    expect(internal.sprite.scale).toEqual(baseScale);
    expect(idleFilter()!.resources.idle.uniforms.uMotion[2]).toBe(1);
    unit.startBoardWalkAnimation(1, 4);
    expect(idleFilter()).toBeUndefined();
    unit.finishBoardWalkAnimationAfterFullCycle();
    for (let frame = 12; frame <= 15; frame++)
        unit.stepSpawnAnimation((staged.meta.frameDurationsMs![frame] + 0.01) / (4000 * VALKYRIE_LAB_TRANSITION_SPEED));
    expect(idleFilter()).toBeDefined();
    expect(idleFilter()!.resources.idle.uniforms.uMotion[2]).toBeLessThan(0.01);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.ensureVisual(root, grid);
    expect(idleFilter()).toBeUndefined();
});

test("idle starts without displacement and each phase stays continuous across its time wrap", () => {
    for (const time of [0, -1, NaN, Infinity]) expect(valkyrieIdleMotion(time)[2]).toBe(0);
    for (const period of [4800, (Math.PI * 2 * 1000) / 2.6]) {
        const a = valkyrieIdleMotion(period - 0.01),
            b = valkyrieIdleMotion(period + 0.01);
        for (let i = 0; i < 2; i++) {
            expect(Math.abs(Math.sin(a[i]) - Math.sin(b[i]))).toBeLessThan(0.0001);
            expect(Math.abs(Math.cos(a[i]) - Math.cos(b[i]))).toBeLessThan(0.0001);
        }
    }
});

test("lab hit interrupts flight, preserves neutral registration and returns to idle once", () => {
    for (const direction of [1, -1]) {
        const { unit, root, internal } = make();
        const height = internal.sprite.height;
        const sourceY = () =>
            internal.sprite.y +
            (internal.sprite.texture.height / 2 - internal.sprite.anchor.y * internal.sprite.texture.height) *
                internal.sprite.scale.y;
        const idleY = sourceY();
        expect(unit.getAnimationTextureKey("hit")).toBe("valkyrie_lab_current_hit_atlas");
        unit.startBoardWalkAnimation(direction, 5);
        let complete = 0;
        expect(unit.playOneShotAnimation("hit", () => complete++, true)).toBe(true);
        expect(internal.walkAnim).toBeUndefined();
        expect(internal.oneShotAnim!.frames).toHaveLength(8);
        expect(internal.oneShotAnim!.authoredRealTime).toBe(true);
        expect(internal.sprite.height).toBeCloseTo(height * VALKYRIE_LAB_WALK_SCALE);
        unit.ensureVisual(root, grid);
        expect(internal.sprite.height).toBeCloseTo(height * VALKYRIE_LAB_WALK_SCALE);
        for (const ms of animationAtlases["Valkyrie Lab Current"].hit.frameDurationsMs!)
            unit.stepSpawnAnimation((ms + 0.01) / 4000);
        expect(complete).toBe(1);
        expect(internal.oneShotAnim).toBeUndefined();
        expect(internal.sprite.height).toBeCloseTo(height);
        expect(sourceY()).toBeCloseTo(idleY);
        unit.ensureVisual(root, grid);
        expect(internal.sprite.height).toBeCloseTo(height);
        unit.stepSpawnAnimation(0.5);
        expect(complete).toBe(1);
    }
});

test("lab death holds its fallen pose, can restart, and Idle restores original size", () => {
    const { unit, root, internal } = make();
    const height = internal.sprite.height;
    let complete = 0;
    expect(unit.getAnimationTextureKey("death")).toBe("valkyrie_lab_current_death_atlas");
    for (let attempt = 0; attempt < 2; attempt++) {
        expect(unit.playOneShotAnimation("death", () => complete++, true)).toBe(true);
        unit.ensureVisual(root, grid);
        expect(internal.sprite.height).toBeCloseTo(height * VALKYRIE_LAB_WALK_SCALE);
        for (const ms of animationAtlases["Valkyrie Lab Current"].death.frameDurationsMs!)
            unit.stepSpawnAnimation((ms + 0.01) / 4000);
        expect(internal.oneShotAnim!.frameIndex).toBe(7);
        expect(internal.oneShotAnim!.finished).toBe(true);
        expect(complete).toBe(attempt + 1);
        unit.stepSpawnAnimation(0.5);
        expect(complete).toBe(attempt + 1);
    }
    unit.returnToIdleAnimation();
    expect(internal.oneShotAnim).toBeUndefined();
    expect(internal.sprite.height).toBeCloseTo(height);
    unit.ensureVisual(root, grid);
    expect(internal.sprite.height).toBeCloseTo(height);
    unit.playOneShotAnimation("death", undefined, true);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(internal.oneShotAnim).toBeUndefined();
    expect(internal.sprite.height).toBeCloseTo(height);
});

test("death gets another 10% speed and hit stays 12% faster without compounding visual scale", () => {
    expect(VALKYRIE_DEATH_SPEED).toBeCloseTo(1.15 * 1.1);
    const { unit, root, internal } = make();
    const height = internal.sprite.height;
    for (const state of ["hit", "death"] as const) {
        let complete = 0;
        unit.playOneShotAnimation(state, () => complete++, true);
        const speed = state === "death" ? VALKYRIE_DEATH_SPEED : VALKYRIE_HIT_SPEED;
        const durations = animationAtlases["Valkyrie Lab Current"][state].frameDurationsMs!;
        let elapsedMs = 0;
        for (let frame = 0; frame < durations.length; frame++) {
            expect(internal.oneShotAnim!.frameIndex).toBe(frame);
            for (let sync = 0; sync < 3; sync++) {
                unit.ensureVisual(root, grid);
                expect(internal.sprite.height).toBeCloseTo(
                    height * VALKYRIE_LAB_WALK_SCALE * VALKYRIE_REACTION_POSE_SCALES[state][frame],
                );
            }
            const ms = durations[frame] / speed;
            unit.stepSpawnAnimation((ms - 0.1) / 4000);
            expect(internal.oneShotAnim!.frameIndex).toBe(frame);
            expect(complete).toBe(0);
            unit.stepSpawnAnimation(0.1 / 4000 + 1e-10);
            elapsedMs += ms;
        }
        expect(complete).toBe(1);
        expect(elapsedMs).toBeCloseTo(state === "death" ? 1000 / (1.15 * 1.1) : 480 / 1.12);
        unit.returnToIdleAnimation();
        unit.ensureVisual(root, grid);
        expect(internal.sprite.height).toBeCloseTo(height);
    }
});

test("hit plants both sole edges at the neutral coordinates through every pose and mirror", async () => {
    const { VALKYRIE_HIT_SOLES, valkyrieHitSupport } = await import("./ValkyrieHitSupport");
    const anchorX = 275.5 / 512,
        anchorY = (49 + (435 * 730) / 768) / 512;
    for (const direction of [1, -1]) {
        const { unit, root, internal } = make();
        unit.setBoardFacingFromMovement(direction);
        unit.playOneShotAnimation("hit", undefined, true);
        for (let frame = 0; frame < 8; frame++) {
            const scale = VALKYRIE_REACTION_POSE_SCALES.hit[frame];
            const pose = valkyrieHitSupport(frame, scale, anchorX, anchorY);
            const neutral = VALKYRIE_HIT_SOLES[0];
            for (let edge = 0; edge < 4; edge++)
                expect(direction * (pose.targetX[edge] - anchorX * 512) * scale).toBeCloseTo(
                    direction * ([neutral[0], neutral[1], neutral[3], neutral[4]][edge] - anchorX * 512),
                    6,
                );
            for (let foot = 0; foot < 2; foot++)
                expect((pose.targetY[foot] - anchorY * 512) * scale).toBeCloseTo(
                    [neutral[2], neutral[5]][foot] - anchorY * 512,
                    6,
                );
            unit.ensureVisual(root, grid);
            const support = internal.sprite.filters?.find((f) => "support" in f.resources);
            expect(!!support).toBe(frame > 0 && frame < 7);
            if (support) expect(Array.from(support.resources.support.uniforms.uSourceX)).toEqual(pose.sourceX);
            unit.stepSpawnAnimation(
                (animationAtlases["Valkyrie Lab Current"].hit.frameDurationsMs![frame] + 0.01) /
                    (4000 * VALKYRIE_HIT_SPEED),
            );
        }
        expect(internal.sprite.filters?.some((f) => "support" in f.resources)).not.toBe(true);
        unit.playOneShotAnimation("hit", undefined, true);
        unit.stepSpawnAnimation(0.03);
        unit.playOneShotAnimation("death", undefined, true);
        expect(internal.sprite.filters?.some((f) => "support" in f.resources)).not.toBe(true);
    }
});

test("reaction palettes retain dark warm material detail instead of lifting shadows into green", async () => {
    const { valkyrieReactionColor } = await import("./ValkyrieReactionPalette");
    for (const state of ["hit", "death"] as const) {
        expect(valkyrieReactionColor([0, 0, 0], state)).toEqual([0, 0, 0]);
        const midSteel = valkyrieReactionColor(state === "hit" ? [128, 120, 111] : [133, 123, 113], state);
        expect(midSteel[0]).toBeCloseTo(105, 0);
        expect(midSteel[1]).toBeCloseTo(97, 0);
        expect(midSteel[2]).toBeCloseTo(89, 0);
        for (const rgb of [
            [30, 25, 20],
            [80, 65, 52],
            [150, 120, 90],
            [204, 164, 128],
        ]) {
            const color = valkyrieReactionColor(rgb, state);
            expect(color[0]).toBeGreaterThan(color[1]);
            expect(color[1]).toBeGreaterThan(color[2]);
        }
    }
});

test("three lab axe attacks and the two-handed cast keep idle registration and finish once", () => {
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down", "cast"]) {
        for (const direction of [1, -1]) {
            const { unit, root, internal } = make();
            const height = internal.sprite.height;
            const landmark = () =>
                internal.sprite.y +
                (384 - internal.sprite.anchor.y * internal.sprite.texture.height) * internal.sprite.scale.y;
            const idleY = landmark();
            unit.startBoardWalkAnimation(direction, 3);
            let complete = 0;
            expect(unit.getAnimationTextureKey(state)).toBe(`valkyrie_lab_current_${state}_atlas`);
            expect(unit.playOneShotAnimation(state, () => complete++, true)).toBe(true);
            expect(internal.walkAnim).toBeUndefined();
            expect(internal.oneShotAnim!.authoredRealTime).toBe(true);
            expect(internal.oneShotAnim!.frames).toHaveLength(8);
            const meta = animationAtlases["Valkyrie Lab Current"][state];
            expect(meta.frameWidth).toBe(768);
            const sourceCenterY = () =>
                internal.sprite.y + (177 + 435 / 2 - internal.sprite.anchor.y * 768) * internal.sprite.scale.y;
            expect(sourceCenterY()).toBeCloseTo(idleY, 6);
            for (let frame = 0; frame < 8; frame++) {
                expect(internal.oneShotAnim!.frameIndex).toBe(frame);
                unit.ensureVisual(root, grid);
                expect(internal.sprite.height).toBeCloseTo((height * 768) / 435);
                expect(internal.sprite.anchor.x).toBeCloseTo(403.5 / 768);
                unit.stepSpawnAnimation((meta.frameDurationsMs![frame] + 0.01) / 4000);
            }
            expect(complete).toBe(1);
            expect(internal.oneShotAnim).toBeUndefined();
            expect(internal.sprite.height).toBeCloseTo(height);
            expect(landmark()).toBeCloseTo(idleY, 6);
            unit.stepSpawnAnimation(0.5);
            expect(complete).toBe(1);
        }
    }
});

test("all attack blades preserve idle distances and geometry is removed on every neutral transition", async () => {
    const { VALKYRIE_ATTACK_POSES, valkyrieAttackAxeSource, syncValkyrieAttackGeometry } =
        await import("./ValkyrieAttackGeometry");
    for (const [state, poses] of Object.entries(VALKYRIE_ATTACK_POSES)) {
        for (const [index, pose] of poses.entries()) {
            const a = valkyrieAttackAxeSource(pose.axe[0] + 31, pose.axe[1] - 44, pose.axe);
            const b = valkyrieAttackAxeSource(pose.axe[0] - 23, pose.axe[1] + 51, pose.axe);
            expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(Math.hypot(54, 95), 8);
            for (const mirror of [-1, 1]) {
                const sprite = new Sprite(atlasTexture);
                const foreign = new ColorMatrixFilter();
                sprite.filters = [foreign];
                sprite.scale.set(mirror * 0.3, -0.3);
                syncValkyrieAttackGeometry(sprite, state, index + 1);
                const installed = sprite.filters![1];
                for (let i = 0; i < 10; i++) syncValkyrieAttackGeometry(sprite, state, index + 1);
                expect(sprite.filters).toEqual([foreign, installed]);
                expect(sprite.scale.x).toBe(mirror * 0.3);
                expect(sprite.scale.y).toBe(-0.3);
                for (const neutral of ["idle", "hit", "death", "walk"]) {
                    syncValkyrieAttackGeometry(sprite, neutral, 3);
                    expect(sprite.filters).toEqual([foreign]);
                    syncValkyrieAttackGeometry(sprite, state, index + 1);
                }
                syncValkyrieAttackGeometry(sprite, state, 7);
                expect(sprite.filters).toEqual([foreign]);
                syncValkyrieAttackGeometry(sprite, state, 0);
                expect(sprite.filters).toEqual([foreign]);
                sprite.destroy();
                foreign.destroy();
            }
        }
    }
});

test("approved vertical cast retains its authored blade, body and palette in all frames", async () => {
    const { syncValkyrieLabReaction } = await import("./ValkyrieLabReactions");
    const sprite = new Sprite(atlasTexture);
    const foreign = new ColorMatrixFilter();
    sprite.filters = [foreign];
    sprite.scale.set(-0.3, 0.3);
    syncValkyrieLabReaction(sprite, "melee_attack", 3);
    expect(sprite.filters!.length).toBeGreaterThan(1);
    for (let frame = 0; frame < 8; frame++) {
        syncValkyrieLabReaction(sprite, "cast", frame);
        expect(sprite.filters).toEqual([foreign]);
        expect(sprite.scale.x).toBe(-0.3);
        expect(sprite.scale.y).toBe(0.3);
    }
    sprite.destroy();
    foreign.destroy();
});
