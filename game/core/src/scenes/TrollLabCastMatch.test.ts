import { afterAll, beforeAll, expect, test } from "bun:test";
import { ColorMatrixFilter, DOMAdapter, Sprite, Texture } from "pixi.js";
import { syncTrollLabCastMatch, trollCastCalibration, trollCastRegisteredPoint } from "./TrollLabCastMatch";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Troll cast registration holds both support points and uses the identical fit on recovery", () => {
    for (let frame = 0; frame < 8; frame++) {
        for (const [x, y] of [
            [350, 932],
            [710, 922],
        ])
            expect(trollCastRegisteredPoint(frame, x, y)).toEqual({ x, y });
    }
    expect(trollCastCalibration("cast", 1)).toBe(trollCastCalibration("cast", 6));
    expect(trollCastCalibration("cast", 2)).toBe(trollCastCalibration("cast", 5));
    for (const frame of [0, 7]) expect(trollCastCalibration("cast", frame)).toBeUndefined();
    for (const state of ["idle", "walk", "hit", "death", "melee_attack", undefined])
        expect(trollCastCalibration(state, 3)).toBeUndefined();
});

test("Troll cast skin, bronze and skirt samples match the measured idle midtones", () => {
    for (const frame of [1, 2, 3, 4]) {
        const fit = trollCastCalibration("cast", frame)!;
        expect(fit.matches).toBeGreaterThanOrEqual(200);
        for (const material of ["skin", "leather", "cloth"] as const) {
            const curve = fit[material];
            for (let ch = 0; ch < 3; ch++)
                expect(curve.sourceMedian[ch] * curve.gain[ch] + curve.offset[ch]).toBeCloseTo(curve.idleMedian[ch], 3);
        }
    }
});

test("Troll cast correction never stacks, changes sprite scale or leaks into idle and attacks", () => {
    const sprite = new Sprite(Texture.WHITE);
    const gameplay = new ColorMatrixFilter();
    sprite.filters = [gameplay];
    sprite.scale.set(-0.3, 0.3);
    for (const frame of [1, 2, 3, 4, 5, 6]) {
        for (let n = 0; n < 30; n++) syncTrollLabCastMatch(sprite, "cast", frame);
        expect(sprite.filters).toHaveLength(2);
        expect(sprite.filters?.[1]).toBe(gameplay);
        expect(sprite.scale.x).toBe(-0.3);
        expect(sprite.scale.y).toBe(0.3);
    }
    const owned = sprite.filters![0];
    for (const state of ["idle", "walk", "hit", "death", "melee_attack", undefined]) {
        syncTrollLabCastMatch(sprite, state, 3);
        expect(sprite.filters).toEqual([gameplay]);
    }
    syncTrollLabCastMatch(sprite, "cast", 4);
    expect(sprite.filters?.[0]).toBe(owned);
    syncTrollLabCastMatch(sprite, "cast", 7);
    expect(sprite.filters).toEqual([gameplay]);
    sprite.destroy();
});
