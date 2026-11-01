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
import { shouldPreloadUnitAnimationAtlas, usesApprovedBaseAnimations } from "../pixi/creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../pixi/productionImageAssetPolicy";
import { animationAtlases } from "../generated/animation_atlases";
import {
    PEGASUS_FLIGHT_TRANSITION_SPEED,
    PEGASUS_FLIGHT_SOURCE_SIZE,
    PEGASUS_FLIGHT_SOURCE_X,
    PEGASUS_FLIGHT_SOURCE_Y,
    PEGASUS_FLIGHT_ANCHOR_X,
} from "./PegasusFlight";
import {
    RenderableUnit,
    authoredIdleFrameDurationMs,
    creatureGenericCombatMotionEnabledForUnit,
    oneShotAnimationDurationMultiplier,
} from "./RenderableUnit";
import { HIT_REACTION_ADDITIONAL_SPEED } from "../settings/hitTiming";
import { PEGASUS_COMBAT_CANVAS_SIZE, PEGASUS_COMBAT_SOURCE_X, PEGASUS_COMBAT_SOURCE_Y } from "./PegasusCombat";
import { getSplitBundles } from "../pixi/PixiTextureLoader";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
            querySelector: () => null,
        };
});

test.each([false, true])(
    "Pegasus preserves scale through flight and every combat frame (lab preview: %s)",
    (labPreview) => {
        expect(usesApprovedBaseAnimations("Pegasus")).toBe(true);
        expect(creatureGenericCombatMotionEnabledForUnit("Pegasus", 3)).toBe(false);
        expect(getSplitBundles({ animationsEnabled: false }).animations.pegasus_flight_walk_atlas).toBeDefined();
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
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Nature", "Pegasus", "pegasus_512", 1),
            grid,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        );
        const texture = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 4096 }),
        });
        const unit = RenderableUnit.fromBase(base, () => texture);
        const world = new Container();
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, grid);
        const state = unit as unknown as {
            sprite: Sprite;
            selectionAnimFrames: Texture[];
            selectionAnimFrameIndex: number;
            selectionAnimationStartedAtMs: number;
            selectionAnimFrameDurationMs: number;
            walkAnim?: {
                frames: Texture[];
                frameIndex: number;
                gaitStartDistanceCells: number;
                loopStartFrame: number;
                loopEndFrame: number;
            };
            oneShotAnim?: {
                frames: Texture[];
                frameIndex: number;
                frameDurationsMs: number[];
                durationPerFrame: number;
                finished?: boolean;
            };
        };
        expect(state.selectionAnimFrames).toHaveLength(32);
        expect(authoredIdleFrameDurationMs("Pegasus", 175, true)).toBe(175);
        expect(unit.getAnimationTextureKey("idle")).toBe("pegasus_idle_atlas");
        expect(state.selectionAnimFrameDurationMs).toBeCloseTo(175 / 1.3);
        const idleFrames = new Set<number>();
        const idleTransform = {
            x: state.sprite.x,
            y: state.sprite.y,
            scaleX: state.sprite.scale.x,
            scaleY: state.sprite.scale.y,
            anchorX: state.sprite.anchor.x,
            anchorY: state.sprite.anchor.y,
        };
        for (let ms = 0; ms < 5600 / 1.3; ms += 25) {
            unit.stepSelectionAnimation(state.selectionAnimationStartedAtMs + ms);
            idleFrames.add(state.selectionAnimFrameIndex);
            expect({
                x: state.sprite.x,
                y: state.sprite.y,
                scaleX: state.sprite.scale.x,
                scaleY: state.sprite.scale.y,
                anchorX: state.sprite.anchor.x,
                anchorY: state.sprite.anchor.y,
            }).toEqual(idleTransform);
        }
        expect(idleFrames.size).toBe(32);
        unit.stepSelectionAnimation(state.selectionAnimationStartedAtMs + 5600 / 1.3 + 0.01);
        expect(state.selectionAnimFrameIndex).toBe(0);
        unit.setCreatureAnimationLabPreviewEnabled(labPreview);
        const initialScale = state.sprite.scale.y;
        const initialHeight = state.sprite.height;
        const initialAnchor = { x: state.sprite.anchor.x, y: state.sprite.anchor.y };
        const initialScaleX = state.sprite.scale.x;
        unit.startBoardWalkAnimation(1, 4);
        expect(state.walkAnim?.frames).toHaveLength(16);
        expect(state.walkAnim?.loopStartFrame).toBe(4);
        expect(state.walkAnim?.loopEndFrame).toBe(11);
        const flightHeight = state.sprite.height;
        expect(state.sprite.anchor.x).toBeCloseTo(PEGASUS_FLIGHT_ANCHOR_X);
        // Canonical pixels occupy identical world positions in the neutral takeoff bookend.
        for (const [x, y] of [
            [641, 134],
            [550, 352],
            [535, 720],
        ]) {
            expect(
                (PEGASUS_FLIGHT_SOURCE_X + (x * PEGASUS_FLIGHT_SOURCE_SIZE) / 768 - state.sprite.anchor.x * 1024) *
                    state.sprite.scale.x,
            ).toBeCloseTo((x - initialAnchor.x * 768) * initialScaleX);
            expect(
                (PEGASUS_FLIGHT_SOURCE_Y + (y * PEGASUS_FLIGHT_SOURCE_SIZE) / 768 - state.sprite.anchor.y * 1024) *
                    state.sprite.scale.y,
            ).toBeCloseTo((y - initialAnchor.y * 768) * initialScale);
        }
        const meta = animationAtlases["Pegasus Flight"].walk;
        for (let frame = 0; frame < 4; frame++) {
            expect(state.walkAnim?.frameIndex).toBe(frame);
            unit.stepSpawnAnimation((meta.frameDurationsMs![frame] + 0.01) / (4000 * PEGASUS_FLIGHT_TRANSITION_SPEED));
        }
        const start = state.walkAnim!.gaitStartDistanceCells;
        for (let frame = 0; frame <= 16; frame++) {
            unit.setBoardWalkDistanceCells(start + (frame * 1.3) / 8);
            expect(state.walkAnim?.frameIndex).toBe(4 + (frame % 8));
            unit.stepSpawnAnimation(0.1);
            expect(state.walkAnim?.frameIndex).toBe(4 + (frame % 8));
            unit.ensureVisual(world, grid);
            expect(state.sprite.height).toBeCloseTo(flightHeight);
            expect(state.sprite.anchor.x).toBeCloseTo(PEGASUS_FLIGHT_ANCHOR_X);
        }
        unit.setBoardWalkDistanceCells(start + 2.6 + Math.SQRT2);
        unit.setBoardFacingFromMovement(-1);
        unit.setBoardWalkDistanceCells(start + 2.6 + Math.SQRT2 + 0.4);
        expect(state.walkAnim?.frameIndex).toBe(4 + (Math.floor(((Math.SQRT2 + 0.4) / 1.3) * 8) % 8));
        let landed = 0;
        expect(unit.finishBoardWalkAnimationAfterFullCycle(() => landed++)).toBe(true);
        for (let frame = 12; frame < 16; frame++) {
            expect(state.walkAnim?.frameIndex).toBe(frame);
            expect(landed).toBe(0);
            unit.stepSpawnAnimation((meta.frameDurationsMs![frame] + 0.01) / (4000 * PEGASUS_FLIGHT_TRANSITION_SPEED));
        }
        expect(landed).toBe(1);
        expect(state.walkAnim).toBeUndefined();
        unit.ensureVisual(world, grid);
        expect(state.sprite.height).toBeCloseTo(initialHeight);
        expect(state.sprite.anchor.y).toBeCloseTo(initialAnchor.y);
        // A route shorter than takeoff still resolves through landing exactly once.
        unit.startBoardWalkAnimation(1, 0.25);
        unit.setBoardWalkDistanceCells(0.25);
        let shortLanded = 0;
        expect(unit.finishBoardWalkAnimationAfterFullCycle(() => shortLanded++)).toBe(true);
        for (let frame = 12; frame < 16; frame++) {
            expect(state.walkAnim?.frameIndex).toBe(frame);
            unit.stepSpawnAnimation((meta.frameDurationsMs![frame] + 0.01) / (4000 * PEGASUS_FLIGHT_TRANSITION_SPEED));
        }
        expect(shortLanded).toBe(1);
        expect(state.walkAnim).toBeUndefined();
        unit.ensureVisual(world, grid);
        expect(state.sprite.height).toBeCloseTo(initialHeight);
        // Reactions can interrupt the expanded flight canvas without leaking its scale into idle.
        unit.startBoardWalkAnimation(1, 3);
        expect(unit.playOneShotAnimation("hit")).toBe(true);
        expect(state.walkAnim).toBeUndefined();
        unit.stepOneShotAnimation(10000);
        unit.ensureVisual(world, grid);
        expect(state.sprite.height).toBeCloseTo(initialHeight);
        for (const action of [
            "idle",
            "walk",
            "hit",
            "attack",
            "attack_up",
            "attack_down",
            "melee_attack",
            "melee_attack_up",
            "melee_attack_down",
            "death",
        ]) {
            const key =
                action === "walk" ? "pegasus_flight_walk_atlas" : `pegasus_${action.replace(/^melee_/, "")}_atlas`;
            expect(unit.getAnimationTextureKey(action)).toBe(key);
            expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
            expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
            expect(isProductionOmittedDisabledUnitAnimationAssetKey(key)).toBe(false);
            if (action === "idle" || action === "walk") continue;
            let completed = 0;
            expect(unit.playOneShotAnimation(action, () => completed++)).toBe(true);
            const anim = state.oneShotAnim!;
            if (action === "hit") {
                const hit = animationAtlases.Pegasus.hit;
                const previousFrameMs =
                    ((hit.loopDurationMs / hit.frameCount) * oneShotAnimationDurationMultiplier("Pegasus", "hit")) /
                    HIT_REACTION_ADDITIONAL_SPEED;
                expect(anim.durationPerFrame).toBeCloseTo(previousFrameMs / 1.4);
            }
            expect(anim.frames).toHaveLength(8);
            expect(anim.frames[0].width).toBe(PEGASUS_COMBAT_CANVAS_SIZE);
            expect(state.sprite.height).toBeCloseTo(initialHeight * (PEGASUS_COMBAT_CANVAS_SIZE / 768));
            // Opening combat cels contain the unchanged canonical pixels with padding only.
            for (const [x, y] of [
                [641, 134],
                [515, 741],
                [202, 716],
            ]) {
                expect(
                    (x + PEGASUS_COMBAT_SOURCE_X - state.sprite.anchor.x * PEGASUS_COMBAT_CANVAS_SIZE) *
                        state.sprite.scale.x,
                ).toBeCloseTo((x - initialAnchor.x * 768) * initialScaleX);
                expect(
                    (y + PEGASUS_COMBAT_SOURCE_Y - state.sprite.anchor.y * PEGASUS_COMBAT_CANVAS_SIZE) *
                        state.sprite.scale.y,
                ).toBeCloseTo((y - initialAnchor.y * 768) * initialScale);
            }
            // Check every render tick, not only the synchronous opening-frame swap: atlas metadata
            // must preserve source-pixel scale even when ensureVisual recalculates the padded canvas.
            for (let frame = 0; frame < anim.frames.length; frame++) {
                expect(state.oneShotAnim?.frameIndex).toBe(frame);
                unit.ensureVisual(world, grid);
                expect(state.sprite.texture.width).toBe(PEGASUS_COMBAT_CANVAS_SIZE);
                expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(Math.abs(initialScaleX));
                expect(state.sprite.scale.y).toBeCloseTo(initialScale);
                unit.stepOneShotAnimation((anim.frameDurationsMs?.[frame] ?? anim.durationPerFrame) + 0.01);
            }
            unit.stepOneShotAnimation(10000);
            expect(completed).toBe(1);
            if (action === "death") {
                expect(state.oneShotAnim?.finished).toBe(true);
                unit.returnToIdleAnimation();
            } else expect(state.oneShotAnim).toBeUndefined();
            expect(state.sprite.height).toBeCloseTo(initialHeight);
            expect(state.sprite.anchor.y).toBeCloseTo(initialAnchor.y);
        }
        unit.destroyVisuals();
        world.destroy({ children: true });
        texture.destroy(true);
    },
);
