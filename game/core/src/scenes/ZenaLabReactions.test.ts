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
import { BufferImageSource, Container, Texture } from "pixi.js";
import { shouldPreloadUnitAnimationAtlas } from "../pixi/creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import { RenderableUnit } from "./RenderableUnit";

beforeAll(() => {
    if (typeof document === "undefined") {
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
            querySelector: () => null,
        };
    }
});

test("Zena lab reactions preserve authored timing, idle return and corpse hold", () => {
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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Might", "Zena", "zena_512", 1),
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
    const unit = RenderableUnit.fromBase(base, () => texture),
        world = new Container();
    // Exercise the same non-uniform parent projection as the dev battlefield.
    world.scale.set(1.2, -0.8);
    unit.setBattlefieldVisualProjection(true);
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, grid);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    const state = unit as unknown as {
        oneShotAnim?: {
            frames: Texture[];
            frameIndex: number;
            frameDurationsMs: number[];
            footAnchorY: number;
            authoredRealTime: boolean;
            finished?: boolean;
        };
        selectionAnimFrames: Texture[];
        selectionAnimFootAnchorY: number;
        sprite: { texture: Texture; scale: { x: number; y: number } };
    };
    unit.ensureVisual(world, grid);
    const idleScale = { x: Math.abs(state.sprite.scale.x), y: Math.abs(state.sprite.scale.y) };
    for (const action of [
        "attack",
        "attack_up",
        "attack_down",
        "melee_attack",
        "melee_attack_up",
        "melee_attack_down",
        "hit",
        "death",
    ]) {
        const key = "zena_lab_" + action + "_atlas";
        expect(unit.getAnimationTextureKey(action)).toBe(key);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        let callbacks = 0;
        let releases = 0;
        const ranged = action.startsWith("attack");
        const shot = ranged ? unit.prepareDryadRangedShot() : undefined;
        if (ranged) expect(unit.playDryadRangedShot(action, shot!, () => releases++)).toBe(true);
        else expect(unit.playOneShotAnimation(action, () => callbacks++)).toBe(true);
        const anim = state.oneShotAnim!;
        unit.ensureVisual(world, grid);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleScale.x, 8);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale.y, 8);
        expect(anim.frames.length).toBe(action.startsWith("melee_attack") ? 29 : action.startsWith("attack") ? 23 : 8);
        expect(anim.frames.every((f) => f.width === 768 && f.height === 768)).toBe(true);
        expect(anim.authoredRealTime).toBe(true);
        expect(anim.frameDurationsMs.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(
            action === "hit"
                ? 576 / 1.26 / 1.17
                : action === "death"
                  ? 1016 / 1.2
                  : action.startsWith("attack")
                    ? 760
                    : 620,
            6,
        );
        expect(state.selectionAnimFootAnchorY).toBeCloseTo(730 / 768, 8);
        expect(anim.footAnchorY).toBeCloseTo(state.selectionAnimFootAnchorY, 8);
        const throwFrames = [...anim.frames];
        for (let i = 0; i < (ranged ? 13 : anim.frames.length - 1); i++) {
            unit.stepOneShotAnimation(anim.frameDurationsMs[i]);
            expect(state.oneShotAnim?.frameIndex).toBe(i + 1);
            if (ranged) {
                expect(releases).toBe(i + 1 >= 13 ? 1 : 0);
                expect(unit.getDryadArrowLength()).toBeCloseTo(120 * 1.15 * idleScale.x, 8);
            }
            unit.ensureVisual(world, grid);
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(
                idleScale.x * (action === "attack" ? 1 - 0.06 * Math.min(1, (i + 1) / 4) : 1),
                8,
            );
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale.y, 8);
            expect(anim.footAnchorY).toBeCloseTo(730 / 768, 8);
            // Repeated layout must preserve the base figure scale.
            unit.ensureVisual(world, grid);
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(
                idleScale.x * (action === "attack" ? 1 - 0.06 * Math.min(1, (i + 1) / 4) : 1),
                8,
            );
        }
        if (ranged) {
            unit.stepOneShotAnimation(5000);
            expect(anim.frameIndex).toBe(13);
            expect(state.sprite.texture).toBe(throwFrames[13]);
            unit.catchZenaChakram();
            expect(state.sprite.texture).toBe(throwFrames[12]);
            expect(anim.frames).toEqual(throwFrames.slice(0, 13).reverse());
            for (let i = 0; i < anim.frames.length - 1; i++) unit.stepOneShotAnimation(anim.frameDurationsMs[i]);
        }
        unit.stepOneShotAnimation(anim.frameDurationsMs[anim.frames.length - 1]);
        expect(callbacks).toBe(ranged ? 0 : 1);
        if (shot) unit.finishDryadRangedShot(shot);
        if (action !== "death") {
            expect(state.oneShotAnim).toBeUndefined();
            expect(state.selectionAnimFrames.includes(state.sprite.texture)).toBe(true);
        } else {
            expect(state.oneShotAnim?.finished).toBe(true);
            expect(state.oneShotAnim?.frameIndex).toBe(anim.frames.length - 1);
            unit.stepOneShotAnimation(5000);
            expect(callbacks).toBe(ranged ? 0 : 1);
            expect(state.oneShotAnim?.frameIndex).toBe(7);
        }
    }
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("hit")).toBe("zena_lab_hit_atlas");
    unit.destroyVisuals();
    world.destroy({ children: true });
});
