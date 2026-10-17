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
import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { shouldPreloadUnitAnimationAtlas } from "../pixi/creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "../pixi/imageAssetTiers";
import {
    syncUnicornBlindnessLight,
    unicornBlindnessLanded,
    UNICORN_BLINDNESS_FLASH_MS,
} from "./UnicornBlindnessVisuals";
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

test("Unicorn combat reactions preserve authored timing, idle return and corpse hold", () => {
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
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Nature", "Unicorn", "unicorn_512", 1),
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
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, grid);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    const state = unit as unknown as {
        oneShotAnim?: {
            frames: Texture[];
            frameIndex: number;
            frameDurationsMs: number[];
            footAnchorY: number;
            authoredRealTime: boolean;
            finished?: boolean;
        };
        unicornBlindnessFlash?: { startedAt?: number };
        selectionAnimFrames: Texture[];
        selectionAnimFootAnchorY: number;
        sprite: { texture: Texture; scale: { x: number; y: number }; anchor: { x: number; y: number } };
    };
    unit.ensureVisual(world, grid);
    const idleScale = Math.abs(state.sprite.scale.y);
    let castCallbacks = 0;
    expect(unit.hasAnimationState("cast")).toBe(true);
    expect(unit.playOneShotAnimation("cast", () => castCallbacks++)).toBe(true);
    unit.stepSelectionAnimation(1000);
    expect(state.unicornBlindnessFlash?.startedAt).toBe(1000);
    expect(unit.isPlayingOneShotAnimation("cast")).toBe(true);
    unit.stepSelectionAnimation(1000 + UNICORN_BLINDNESS_FLASH_MS);
    expect(castCallbacks).toBe(1);
    expect(unit.isPlayingOneShotAnimation("cast")).toBe(false);
    for (const action of ["hit", "melee_attack", "melee_attack_up", "melee_attack_down", "death"]) {
        const key = "unicorn_lab_" + action + "_atlas";
        expect(unit.getAnimationTextureKey(action)).toBe(key);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        let callbacks = 0;
        expect(unit.playOneShotAnimation(action, () => callbacks++)).toBe(true);
        if (action === "melee_attack") {
            expect(unit.flashUnicornBlindness()).toBe(true);
            unit.stepSelectionAnimation(2000);
            expect(state.unicornBlindnessFlash?.startedAt).toBeUndefined();
        }
        const anim = state.oneShotAnim!;
        const count = action === "hit" ? 5 : 6;
        const attack = action.startsWith("melee_attack");
        expect(anim.frames.length).toBe(count);
        expect(anim.frames.every((f) => f.width === (attack ? 1280 : 1024) && f.height === (attack ? 1024 : 768))).toBe(
            true,
        );
        expect(anim.authoredRealTime).toBe(true);
        expect(anim.footAnchorY).toBeCloseTo(attack ? 858 / 1024 : state.selectionAnimFootAnchorY, 8);
        for (let i = 0; i < count - 1; i++) {
            unit.stepOneShotAnimation(anim.frameDurationsMs[i]);
            expect(state.oneShotAnim?.frameIndex).toBe(i + 1);
            unit.ensureVisual(world, grid);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScale, 8);
            expect(state.sprite.anchor.y).toBeCloseTo(attack ? 858 / 1024 : 730 / 768, 8);
        }
        unit.stepOneShotAnimation(anim.frameDurationsMs[count - 1]);
        expect(callbacks).toBe(1);
        if (action === "melee_attack") {
            unit.stepSelectionAnimation();
            expect(state.unicornBlindnessFlash?.startedAt).toBeDefined();
            unit.stepSelectionAnimation(state.unicornBlindnessFlash!.startedAt! + UNICORN_BLINDNESS_FLASH_MS);
            expect(state.unicornBlindnessFlash).toBeUndefined();
        }
        if (action !== "death") {
            expect(state.oneShotAnim).toBeUndefined();
            expect(state.selectionAnimFrames.includes(state.sprite.texture)).toBe(true);
        } else {
            expect(state.oneShotAnim?.finished).toBe(true);
            expect(state.oneShotAnim?.frameIndex).toBe(count - 1);
            unit.stepOneShotAnimation(5000);
            expect(callbacks).toBe(1);
            expect(state.oneShotAnim?.frameIndex).toBe(count - 1);
        }
    }
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("hit")).toBe("unicorn_lab_hit_atlas");
    unit.destroyVisuals();
    world.destroy({ children: true });
});

test("Unicorn horn only flashes for a confirmed Blindness on the strike recipient", () => {
    expect(unicornBlindnessLanded(undefined, "target")).toBe(false);
    expect(unicornBlindnessLanded([], "target")).toBe(false);
    for (const [name, unitId, resisted, expected] of [
        ["Blindness", "target", false, true],
        ["Blindness", "target", true, false],
        ["Blindness", "other", false, false],
        ["Stun", "target", false, false],
    ] as const) {
        expect(
            unicornBlindnessLanded(
                [{ type: "effects_applied", applications: [{ name, unitId, resisted, kind: "effect" }] }],
                "target",
            ),
        ).toBe(expected);
    }
});

test("Mystic horn and eye sprites mirror with the figure, fade out and clean up", () => {
    const world = new Container();
    const sprite = new Sprite(Texture.EMPTY);
    world.addChild(sprite);
    sprite.anchor.set(0.5, 730 / 768);
    sprite.position.set(80, 100);
    sprite.scale.set(-0.2, -0.2);
    syncUnicornBlindnessLight(sprite, 250, Texture.EMPTY, Texture.EMPTY);
    const layer = world.children.find((child) => child.label === "unicorn-mystic-horn-and-eye")!;
    expect(layer.children.length).toBe(5);
    expect(layer.scale.x).toBe(sprite.scale.x);
    expect(layer.scale.y).toBe(sprite.scale.y);
    expect(layer.position.x).toBe(sprite.position.x);
    expect(layer.children[4].position.x).toBe(594 - 384);
    expect(layer.visible).toBe(true);
    syncUnicornBlindnessLight(sprite, UNICORN_BLINDNESS_FLASH_MS);
    expect(layer.visible).toBe(false);
    sprite.destroy();
    expect(layer.destroyed).toBe(true);
});
