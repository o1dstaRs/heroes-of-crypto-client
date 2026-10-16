import { afterAll, beforeAll, expect, test } from "bun:test";
import { ColorMatrixFilter, DOMAdapter, Sprite, Texture } from "pixi.js";
import { syncTrollLabAttack, trollAttackPaletteRgb, trollAttackBodyScale } from "./TrollLabAttackVisuals";
import { TROLL_ATTACK_IDLE_PALETTE, TROLL_ATTACK_SOURCE_PALETTES } from "./TrollLabAttackPaletteData";

const originalAdapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({
        ...originalAdapter,
        createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
    }),
);
afterAll(() => DOMAdapter.set(originalAdapter));

test("all twelve attack poses map measured skin and leather midtones to the live idle reference", () => {
    for (const [state, poses] of Object.entries(TROLL_ATTACK_SOURCE_PALETTES)) {
        for (let frame = 0; frame < poses.length; frame++) {
            for (const material of ["skin", "leather"] as const) {
                const measured = poses[frame][material].map((channel) => channel[3]);
                const target = TROLL_ATTACK_IDLE_PALETTE[material].map((channel) => channel[3]);
                const rendered = trollAttackPaletteRgb(state, frame + 1, measured);
                for (let channel = 0; channel < 3; channel++) {
                    expect(Math.abs(rendered[channel] - target[channel])).toBeLessThan(0.1);
                }
            }
        }
    }
});

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

test("every attack material has finite monotone curves into the rendered idle palette", () => {
    for (const [state, poses] of Object.entries(TROLL_ATTACK_SOURCE_PALETTES)) {
        expect(poses).toHaveLength(4);
        for (const pose of poses)
            for (const material of ["skin", "leather"] as const) {
                for (const channel of pose[material]) {
                    expect(channel).toHaveLength(7);
                    expect(
                        channel.every((v, i) => Number.isFinite(v) && v > 0 && v < 255 && (!i || v >= channel[i - 1])),
                    ).toBe(true);
                }
            }
        for (let frame = 1; frame < 5; frame++) {
            for (const rgb of [
                [0, 0, 0],
                [45, 38, 28],
                [130, 124, 110],
                [235, 215, 190],
                [255, 255, 255],
            ]) {
                const corrected = trollAttackPaletteRgb(state, frame, rgb);
                expect(corrected.every((v) => Number.isFinite(v) && v >= 0 && v <= 255)).toBe(true);
            }
            expect(trollAttackPaletteRgb(state, frame, [0, 0, 0])).toEqual([0, 0, 0]);
        }
        expect(trollAttackPaletteRgb(state, 0, [95, 80, 67])).toEqual([95, 80, 67]);
        expect(trollAttackPaletteRgb(state, 5, [95, 80, 67])).toEqual([95, 80, 67]);
    }
    expect(TROLL_ATTACK_IDLE_PALETTE.skin).toHaveLength(3);
});
