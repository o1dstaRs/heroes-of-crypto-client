import { expect, test } from "bun:test";
import { Sprite, Texture } from "pixi.js";
import { RenderableUnit, creatureGenericWholeSpriteMotionEnabledForLevel } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";

test.each([1, 2, 3, 4])(
    "level %s suppresses cutout sway, recoil, windup and dodge without inventing a sprite animation",
    (level) => {
        const sprite = new Sprite(Texture.WHITE);
        sprite.scale.set(2, 3);
        const unit = Object.assign(Object.create(RenderableUnit.prototype), {
            sprite,
            getUnitProperties: () => ({ name: "Unfinished creature", level }),
            hasAnimationState: () => false,
            isDestroyed: false,
            removeDodgeBlur: () => {},
        });
        unit.applyMoveEffect(0.37);
        unit.applyRecoil(50, 20);
        unit.applyWindupRecoil(50, 20);
        unit.applyHitReaction(50, 20);
        unit.playDodgeAnimation(50, 20);
        expect(sprite.rotation).toBe(0);
        expect([sprite.scale.x, sprite.scale.y]).toEqual([2, 3]);
        expect([unit.recoilStartMs, unit.recoilDx, unit.recoilDy, unit.recoilShakeAmplitude]).toEqual([0, 0, 0, 0]);
        expect(unit.isDodging()).toBe(false);
        expect(unit.oneShotAnim).toBeUndefined();
        sprite.destroy();
    },
);

test("higher tiers also keep authored poses free of generic motion", () => {
    expect(creatureGenericWholeSpriteMotionEnabledForLevel(3)).toBe(false);
    expect(creatureGenericWholeSpriteMotionEnabledForLevel(4)).toBe(false);
});

test.each([1, 2])("unfinished level %s death removes the figure without a procedural shatter", (level) => {
    let removed = 0;
    const scene = Object.create(Sandbox.prototype);
    expect(
        scene.playCustomDeathAnimation({
            getId: () => "unfinished-creature",
            hasAnimationState: () => false,
            getUnitProperties: () => ({ level }),
            destroyVisuals: () => removed++,
        }),
    ).toBe(true);
    expect(removed).toBe(1);
});
