import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
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
import { BufferImageSource, ColorMatrixFilter, Container, Sprite, Texture, type Filter } from "pixi.js";
import { animationAtlases } from "../generated/animation_atlases";
import { shouldPreloadUnitAnimationAtlas } from "../pixi/creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import {
    CREATURE_SPRITE_ANIMATION_SETTINGS,
    COMMON_IDLE_BREATH_SETTINGS,
    creatureWalkAnimationEnabledForUnit,
    RenderableUnit,
} from "./RenderableUnit";
import {
    FAIRY_LAB_WALK_SCALE,
    FAIRY_LAB_WALK_WIDTH_SCALE,
    FAIRY_LAB_WALK_SPEED,
    FAIRY_LAB_TRANSITION_SPEED,
    syncFairyLabWalkColor,
} from "./FairyLabWalkVisuals";

import { syncFairyLabHead } from "./FairyLabHeadVisuals";
import { FAIRY_LAB_IDLE_CYCLE_MS } from "./FairyLabIdle";
import { syncFairyLabReaction } from "./FairyLabReactionVisuals";

const grid = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const texture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 8192, height: 8192 }),
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
// Exercise explicit preview/exit behavior with the approved runtime package disabled.
beforeEach(() => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = false;
});
function fairy() {
    document.cookie ??= "";
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    COMMON_IDLE_BREATH_SETTINGS.enabled = false;
    const effects = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Nature", "Fairy", "fairy_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const unit = RenderableUnit.fromBase(base, () => texture);
    unit.setPosition(0, 1024);
    const root = new Container();
    unit.ensureVisual(root, grid);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    return {
        unit,
        root,
        internals: unit as unknown as {
            sprite: Sprite;
            oneShotAnim?: { frameIndex: number; frames: Texture[]; authoredRealTime: boolean; holdLastFrame: boolean };
            walkAnim?: {
                frames: Texture[];
                frameIndex: number;
                introComplete: boolean;
                gaitStartDistanceCells: number;
                completedCycles: number;
                loopStartFrame: number;
                loopEndFrame: number;
                outroFrame: number;
            };
        },
    };
}
afterEach(() => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
});

test("Fairy full-detail motion is enabled only in the lab during the freeze", () => {
    expect(creatureWalkAnimationEnabledForUnit("Fairy", false)).toBe(false);
    expect(creatureWalkAnimationEnabledForUnit("Fairy", true)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("fairy_lab_walk_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("fairy_lab_walk_atlas")).toBe(false);
    expect(shouldPreloadUnitAnimationAtlas("fairy_lab_idle_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("fairy_lab_idle_atlas")).toBe(false);
    expect(animationAtlases.Fairy.walk.frameCount).toBe(9);
});

test("Fairy gesture plays while unselected, rests at the seam and preserves its canvas", () => {
    const { unit, root, internals } = fairy();
    const idle = unit as unknown as { selectionAnimationStartedAtMs: number; selectionAnimFrameIndex: number };
    const started = idle.selectionAnimationStartedAtMs;
    const initialHeight = internals.sprite.height;
    const initialAnchor = internals.sprite.anchor.y;
    unit.setBoardSelected(true);
    unit.setBoardSelected(false);
    expect(unit.getAnimationTextureKey("idle")).toBe("fairy_lab_idle_atlas");
    for (const [elapsed, frame] of [
        [0, 0],
        [1500, 1],
        [1630, 2],
        [1780, 3],
        [1930, 4],
        [2350, 3],
        [2630, 1],
        [2780, 0],
        [FAIRY_LAB_IDLE_CYCLE_MS, 0],
    ]) {
        // performance.now() is fractional; sample just inside the frame to avoid
        // cancellation rounding landing a few ulps before an exact boundary.
        unit.ensureVisual(root, grid, started + elapsed + 0.001);
        expect(idle.selectionAnimFrameIndex).toBe(frame);
        expect(internals.sprite.height).toBeCloseTo(initialHeight);
        expect(internals.sprite.anchor.y).toBeCloseTo(initialAnchor);
    }
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("idle")).not.toBe("fairy_lab_idle_atlas");
});

test("lab Fairy repeats only six flight frames by distance and plays one landing", () => {
    const { unit, internals } = fairy();
    unit.startBoardWalkAnimation(1, 8);
    expect(internals.walkAnim?.frames).toHaveLength(12);
    expect(internals.walkAnim?.loopStartFrame).toBe(3);
    expect(internals.walkAnim?.loopEndFrame).toBe(8);
    expect(internals.walkAnim?.outroFrame).toBe(9);
    unit.stepSpawnAnimation(0.131 / (4 * FAIRY_LAB_TRANSITION_SPEED));
    expect(internals.walkAnim?.frameIndex).toBe(1);
    unit.stepSpawnAnimation(0.131 / (4 * FAIRY_LAB_TRANSITION_SPEED));
    expect(internals.walkAnim?.frameIndex).toBe(2);
    unit.stepSpawnAnimation(0.111 / (4 * FAIRY_LAB_TRANSITION_SPEED));
    expect(internals.walkAnim?.frameIndex).toBe(3);
    const start = internals.walkAnim!.gaitStartDistanceCells;
    const cycleDistance = 1.3 / FAIRY_LAB_WALK_SPEED;
    for (let n = 0; n <= 12; n++) {
        unit.setBoardWalkDistanceCells(start + (n * cycleDistance) / 6);
        expect(internals.walkAnim?.frameIndex).toBe(3 + (n % 6));
        unit.stepSpawnAnimation(0.3);
        expect(internals.walkAnim?.frameIndex).toBe(3 + (n % 6));
        if (n === 5) unit.setBoardFacingFromMovement(-1);
    }
    expect(internals.walkAnim?.completedCycles).toBe(2);
    unit.setBoardWalkDistanceCells(start + 2 * cycleDistance + Math.SQRT2);
    expect(internals.walkAnim?.frameIndex).toBe(
        3 + (Math.floor((2 * cycleDistance + Math.SQRT2) / (cycleDistance / 6)) % 6),
    );
    let landed = 0;
    unit.finishBoardWalkAnimationAfterFullCycle(() => landed++);
    expect(internals.walkAnim?.frameIndex).toBe(9);
    const bodyFilter = internals.sprite.filters!.find((filter) => (filter as Filter).resources.head) as Filter;
    expect(bodyFilter.resources.head.uniforms.uBodyPose[2]).toBeCloseTo(0.94);
    unit.stepSpawnAnimation(0.131 / (4 * FAIRY_LAB_TRANSITION_SPEED));
    expect(internals.walkAnim?.frameIndex).toBe(10);
    unit.stepSpawnAnimation(0.151 / (4 * FAIRY_LAB_TRANSITION_SPEED));
    expect(internals.walkAnim?.frameIndex).toBe(11);
    unit.stepSpawnAnimation(0.131 / (4 * FAIRY_LAB_TRANSITION_SPEED));
    expect(internals.walkAnim).toBeUndefined();
    expect(landed).toBe(1);
});

test("scale and grade are restored immediately at landing and when leaving the lab", () => {
    const { unit, root, internals } = fairy();
    const initial = internals.sprite.scale.y * internals.sprite.texture.height;
    const initialWidth = Math.abs(internals.sprite.scale.x * internals.sprite.texture.width);
    unit.startBoardWalkAnimation(1, 1);
    expect((internals.sprite.scale.y * internals.sprite.texture.height) / initial).toBeCloseTo(FAIRY_LAB_WALK_SCALE);
    expect(Math.abs(internals.sprite.scale.x * internals.sprite.texture.width) / initialWidth).toBeCloseTo(
        FAIRY_LAB_WALK_SCALE * FAIRY_LAB_WALK_WIDTH_SCALE,
    );
    unit.ensureVisual(root, grid);
    expect(Math.abs(internals.sprite.scale.x * internals.sprite.texture.width) / initialWidth).toBeCloseTo(
        FAIRY_LAB_WALK_SCALE * FAIRY_LAB_WALK_WIDTH_SCALE,
    );
    expect((internals.sprite.scale.y * internals.sprite.texture.height) / initial).toBeCloseTo(FAIRY_LAB_WALK_SCALE);
    unit.stopBoardWalkAnimation();
    expect(internals.sprite.scale.y * internals.sprite.texture.height).toBeCloseTo(initial);
    expect(Math.abs(internals.sprite.scale.x * internals.sprite.texture.width)).toBeCloseTo(initialWidth);
    unit.startBoardWalkAnimation(1, 0.05);
    unit.finishBoardWalkAnimationAfterFullCycle();
    expect(internals.walkAnim?.frameIndex).toBe(9);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(internals.walkAnim).toBeUndefined();
    expect(internals.sprite.scale.y * internals.sprite.texture.height).toBeCloseTo(initial);
    expect(Math.abs(internals.sprite.scale.x * internals.sprite.texture.width)).toBeCloseTo(initialWidth);
});

test("the shared Fairy grade preserves alpha and unrelated filters", () => {
    const sprite = new Sprite(texture);
    const unrelated = new ColorMatrixFilter();
    sprite.filters = [unrelated];
    syncFairyLabWalkColor(sprite, true);
    const grade = sprite.filters![0] as ColorMatrixFilter;
    expect(grade.matrix.slice(15)).toEqual([0, 0, 0, 1, 0]);
    syncFairyLabWalkColor(sprite, true);
    expect(sprite.filters).toHaveLength(2);
    syncFairyLabWalkColor(sprite, false);
    expect(sprite.filters).toEqual([unrelated]);
});

test("Fairy head correction is isolated per sprite and removed on exit", () => {
    const first = new Sprite(texture);
    const second = new Sprite(texture);
    const other = new ColorMatrixFilter();
    first.filters = [other];
    syncFairyLabHead(first, 0);
    syncFairyLabHead(second, 4);
    const firstHead = first.filters![0];
    const secondHead = second.filters![0];
    expect(firstHead).not.toBe(secondHead);
    syncFairyLabHead(first, 11);
    expect(first.filters).toEqual([firstHead, other]);
    expect(second.filters).toEqual([secondHead]);
    syncFairyLabHead(first, -1);
    expect(first.filters).toEqual([other]);
    syncFairyLabHead(second, -1);
    expect(second.filters?.length ?? 0).toBe(0);
    first.destroy();
    second.destroy();
});

test("Fairy idle yields to flight and resumes without a scale change", () => {
    const { unit, internals } = fairy();
    const sprite = internals.sprite;
    const width = Math.abs(sprite.scale.x * sprite.texture.width);
    unit.stepSelectionAnimation(performance.now() + 1200);
    expect(sprite.filters?.some((filter) => (filter as Filter).resources.idle)).toBe(true);
    unit.startBoardWalkAnimation(1, 5);
    expect(sprite.filters?.some((filter) => (filter as Filter).resources.idle)).toBe(false);
    unit.stopBoardWalkAnimation();
    expect(sprite.filters?.some((filter) => (filter as Filter).resources.idle)).toBe(true);
    expect(Math.abs(sprite.scale.x * sprite.texture.width)).toBeCloseTo(width);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.stepSelectionAnimation();
    expect(sprite.filters?.some((filter) => (filter as Filter).resources.idle) ?? false).toBe(false);
});

test("Fairy reaction correction preserves neutral frames and isolates each sprite", () => {
    const first = new Sprite(texture);
    const second = new Sprite(texture);
    const other = new ColorMatrixFilter();
    first.filters = [other];
    syncFairyLabReaction(first, "hit", 0);
    expect(first.filters).toEqual([other]);
    syncFairyLabReaction(first, "hit", 2);
    syncFairyLabReaction(second, "death", 6);
    const firstCorrection = first.filters![0];
    const secondCorrection = second.filters![0];
    expect(firstCorrection).not.toBe(secondCorrection);
    syncFairyLabReaction(first, "hit", 3);
    expect(first.filters).toEqual([firstCorrection, other]);
    syncFairyLabReaction(first, "hit", 5);
    expect(first.filters).toEqual([other]);
    expect(second.filters).toEqual([secondCorrection]);
    syncFairyLabReaction(second, undefined, -1);
    expect(second.filters?.length ?? 0).toBe(0);
    first.destroy();
    second.destroy();
});

test("Fairy lab hit interrupts flight and restores the neutral canvas in authored time", () => {
    const { unit, internals } = fairy();
    const original = [internals.sprite.width, internals.sprite.height, internals.sprite.anchor.y];
    expect(shouldPreloadUnitAnimationAtlas("fairy_lab_hit_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("fairy_lab_hit_atlas")).toBe(false);
    expect(unit.getAnimationTextureKey("hit")).toBe("fairy_lab_hit_atlas");
    unit.startBoardWalkAnimation(1, 5);
    let completed = 0;
    expect(unit.playOneShotAnimation("hit", () => completed++, true)).toBe(true);
    expect(internals.walkAnim).toBeUndefined();
    expect(internals.oneShotAnim?.frames).toHaveLength(6);
    expect(internals.oneShotAnim?.authoredRealTime).toBe(true);
    expect(internals.sprite.width).toBeCloseTo(original[0]);
    expect(internals.sprite.height).toBeCloseTo(original[1]);
    unit.stepSpawnAnimation(0.041 / 4);
    expect(internals.oneShotAnim?.frameIndex).toBe(1);
    expect(internals.sprite.filters?.some((filter) => (filter as Filter).resources.fairyReaction)).toBe(true);
    unit.stepSpawnAnimation(0.42 / 4);
    expect(internals.oneShotAnim).toBeUndefined();
    expect(internals.sprite.filters?.some((filter) => (filter as Filter).resources.fairyReaction) ?? false).toBe(false);
    expect(completed).toBe(1);
    expect(internals.sprite.width).toBeCloseTo(original[0]);
    expect(internals.sprite.height).toBeCloseTo(original[1]);
    expect(internals.sprite.anchor.y).toBeCloseTo(original[2]);
});

test("Fairy lab death holds the corpse, calls completion once and releases on lab exit", () => {
    const { unit, internals } = fairy();
    expect(shouldPreloadUnitAnimationAtlas("fairy_lab_death_atlas", false)).toBe(true);
    expect(isRedundantFullResolutionUnitAtlasKey("fairy_lab_death_atlas")).toBe(false);
    const originalHeight = internals.sprite.height;
    let completed = 0;
    expect(unit.playOneShotAnimation("death", () => completed++, true)).toBe(true);
    expect(internals.oneShotAnim?.frames).toHaveLength(7);
    expect(internals.oneShotAnim?.holdLastFrame).toBe(true);
    unit.stepSpawnAnimation(1.11 / 4);
    expect(internals.oneShotAnim?.frameIndex).toBe(6);
    expect(internals.sprite.filters?.some((filter) => (filter as Filter).resources.fairyReaction)).toBe(true);
    expect(completed).toBe(1);
    const corpse = internals.sprite.texture;
    unit.stepSpawnAnimation(2);
    unit.stepSelectionAnimation(performance.now() + 3000);
    expect(internals.sprite.texture).toBe(corpse);
    expect(internals.sprite.filters?.some((filter) => (filter as Filter).resources.idle) ?? false).toBe(false);
    expect(completed).toBe(1);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(internals.oneShotAnim).toBeUndefined();
    expect(internals.sprite.texture).not.toBe(corpse);
    expect(internals.sprite.filters?.some((filter) => (filter as Filter).resources.fairyReaction) ?? false).toBe(false);
    expect(internals.sprite.height).toBeCloseTo(originalHeight);
    expect(unit.getAnimationTextureKey("hit")).not.toBe("fairy_lab_hit_atlas");
});

test("Fairy three directional melee attacks keep idle proportions and finish once at authored time", () => {
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down"]) {
        const { unit, internals } = fairy();
        const key = `fairy_lab_${state}_atlas`;
        const meta = animationAtlases["Fairy Lab"][state];
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        expect(unit.getAnimationTextureKey(state)).toBe(key);
        const idleTexture = internals.sprite.texture;
        const original = [internals.sprite.width, internals.sprite.height, internals.sprite.anchor.y];
        unit.startBoardWalkAnimation(1, 5);
        let completed = 0;
        expect(unit.playOneShotAnimation(state, () => completed++, true)).toBe(true);
        expect(internals.walkAnim).toBeUndefined();
        expect(internals.oneShotAnim?.frames).toHaveLength(6);
        expect(internals.oneShotAnim?.authoredRealTime).toBe(true);
        for (let i = 0; i < 6; i++) {
            expect(internals.oneShotAnim?.frameIndex).toBe(i);
            expect(internals.sprite.texture.width).toBe(768);
            expect(internals.sprite.width).toBeCloseTo(original[0]);
            expect(internals.sprite.height).toBeCloseTo(original[1]);
            expect(internals.sprite.anchor.y).toBeCloseTo(original[2]);
            expect(
                internals.sprite.filters?.some((filter) => {
                    const resources = (filter as Filter).resources;
                    return resources.idle || resources.fairyReaction || resources.head;
                }) ?? false,
            ).toBe(false);
            unit.stepSpawnAnimation((meta.frameDurationsMs![i] + 0.01) / 4000);
        }
        expect(internals.oneShotAnim).toBeUndefined();
        expect(internals.sprite.texture).toBe(idleTexture);
        expect(completed).toBe(1);
        unit.stepSpawnAnimation(1);
        expect(completed).toBe(1);
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(unit.getAnimationTextureKey(state)).not.toBe(key);
    }
});

test("Fairy palette follows the displayed pose and clears on idle return and lab exit", () => {
    const { unit, root, internals } = fairy();
    const surface = () =>
        internals.sprite.filters?.find((f) => f.resources.fairySurface)?.resources.fairySurface.uniforms;
    expect(surface()?.uPaletteOn).toBe(0);
    unit.playOneShotAnimation("melee_attack", undefined, true);
    unit.stepSpawnAnimation(0.15 / 4);
    expect(internals.oneShotAnim?.frameIndex).toBe(1);
    expect(surface()?.uPaletteOn).toBe(1);
    const attackBootRect = [...surface()!.uBootRect];
    unit.returnToIdleAnimation();
    expect(surface()?.uPaletteOn).toBe(0);
    unit.startBoardWalkAnimation(1, 5);
    unit.stepSpawnAnimation(0.001);
    expect(surface()?.uPaletteOn).toBe(1);
    expect([...surface()!.uBootRect]).not.toEqual(attackBootRect);
    unit.stopBoardWalkAnimation();
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(surface()).toBeUndefined();
    root.destroy({ children: true });
});
