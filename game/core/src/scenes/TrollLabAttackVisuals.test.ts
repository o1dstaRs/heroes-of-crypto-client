import { afterAll, beforeAll, expect, test } from "bun:test";
import { ColorMatrixFilter, DOMAdapter, Sprite, Texture } from "pixi.js";
import { syncTrollLabAttack, trollAttackBodyScale } from "./TrollLabAttackVisuals";

const originalAdapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({
        ...originalAdapter,
        createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
    }),
);
afterAll(() => DOMAdapter.set(originalAdapter));

test("Troll attack correction does not accumulate, preserves facing and clears on interruption", () => {
    for (const facing of [-1, 1]) {
        const sprite = new Sprite(Texture.WHITE);
        sprite.scale.set(2 * facing, -2);
        sprite.anchor.set(0.5, 922 / 1152);
        const gameplay = new ColorMatrixFilter();
        sprite.filters = [gameplay];
        syncTrollLabAttack(sprite, "melee_attack", 1);
        const filter = sprite.filters![0];
        for (let i = 0; i < 10; i++) syncTrollLabAttack(sprite, "melee_attack", 2);
        expect(sprite.scale.x).toBeCloseTo(2 * facing * trollAttackBodyScale("melee_attack", 2), 10);
        expect(sprite.scale.y).toBeCloseTo(-2 * trollAttackBodyScale("melee_attack", 2), 10);
        expect(sprite.anchor.y).toBe(922 / 1152);
        expect(sprite.filters).toEqual([filter, gameplay]);
        sprite.scale.set(2 * facing, -2);
        syncTrollLabAttack(sprite, "melee_attack_down", 3, true);
        expect(sprite.scale.x).toBeCloseTo(2 * facing * trollAttackBodyScale("melee_attack_down", 3), 10);
        syncTrollLabAttack(sprite, "hit", 1);
        expect(sprite.scale.x).toBeCloseTo(2 * facing, 10);
        expect(sprite.scale.y).toBeCloseTo(-2, 10);
        expect(sprite.filters).toEqual([gameplay]);
        syncTrollLabAttack(sprite, "melee_attack_up", 4);
        syncTrollLabAttack(sprite, "melee_attack_up", 5);
        expect(sprite.scale.x).toBeCloseTo(2 * facing, 10);
        expect(sprite.filters).toEqual([gameplay]);
    }
});
