import { expect, test } from "bun:test";
import { Sprite, Texture } from "pixi.js";
import { RenderableUnit, creatureGenericWholeSpriteMotionEnabledForLevel } from "./RenderableUnit";
import { RenderableUnit as ApprovedUnit } from "./LevelOneRenderableUnit";
import { Sandbox } from "./Sandbox";

test.each([1, 2])(
    "level %s suppresses cutout sway, recoil, windup and dodge without inventing a sprite animation",
    (level) => {
        for (const prototype of [RenderableUnit.prototype, ApprovedUnit.prototype]) {
            const sprite = new Sprite(Texture.WHITE);
            sprite.scale.set(2, 3);
            const unit = Object.assign(Object.create(prototype), {
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
        }
    },
);

test("higher tiers retain their existing generic motion policy", () => {
    expect(creatureGenericWholeSpriteMotionEnabledForLevel(3)).toBe(true);
    expect(creatureGenericWholeSpriteMotionEnabledForLevel(4)).toBe(true);
});

test.each([1, 2])("unfinished level %s death removes the figure without a procedural shatter", (level) => {
    let removed = 0;
    const scene = Object.create(Sandbox.prototype);
    expect(
        scene.playCustomDeathAnimation({
            hasAnimationState: () => false,
            getUnitProperties: () => ({ level }),
            destroyVisuals: () => removed++,
        }),
    ).toBe(true);
    expect(removed).toBe(1);
});
