import { expect, test } from "bun:test";
import { Container, Sprite, Texture } from "pixi.js";
import { syncTrollLabCastGlow, trollCastGlowStrength } from "./TrollLabCastVisuals";

test("Troll cast glow begins with finger closure and fades before the hand opens", () => {
    for (const frame of [0, 1, 2, 5, 6, 7])
        for (const progress of [0, 0.5, 1]) expect(trollCastGlowStrength(frame, progress)).toBe(0);
    expect(trollCastGlowStrength(3, 0)).toBe(0);
    expect(trollCastGlowStrength(3, 0.5)).toBeCloseTo(0.4);
    expect(trollCastGlowStrength(3, 1)).toBe(trollCastGlowStrength(4, 0));
    expect(trollCastGlowStrength(4, 0.5)).toBe(1);
    expect(trollCastGlowStrength(4, 1)).toBe(0);
});

test("Troll fist glow follows the sprite facing, reuses its overlay and clears on interruption", () => {
    for (const facing of [-1, 1]) {
        const sprite = new Sprite(Texture.WHITE);
        const parent = new Container();
        parent.addChild(sprite);
        sprite.anchor.set(0.5, 922 / 1152);
        sprite.scale.set(facing * 0.25, 0.25);
        const width = sprite.width;
        syncTrollLabCastGlow(sprite, "cast", 2, 100, 180);
        expect(parent.children).toHaveLength(1);
        syncTrollLabCastGlow(sprite, "cast", 3, 65, 130);
        const glow = parent.children[1];
        expect(glow.visible).toBe(true);
        expect(glow.alpha).toBeCloseTo(0.4);
        expect(glow.position.x).toBeCloseTo((404.57 - 576) * facing * 0.25, 2);
        expect(glow.position.y).toBeCloseTo((165.54 - 922) * 0.25, 2);
        expect(glow.parent).toBe(parent);
        for (let n = 0; n < 60; n++) syncTrollLabCastGlow(sprite, "cast", 4, 150, 300);
        expect(parent.children).toHaveLength(2);
        expect(sprite.width).toBe(width);
        expect(sprite.scale.x).toBe(facing * 0.25);
        for (const action of ["hit", "death", "melee_attack", "walk", undefined]) {
            syncTrollLabCastGlow(sprite, action, 4, 150, 300);
            expect(glow.visible).toBe(false);
        }
        syncTrollLabCastGlow(sprite, "cast", 4, 150, 300);
        expect(glow.visible).toBe(true);
        sprite.destroy();
        expect(glow.destroyed).toBe(true);
    }
});
