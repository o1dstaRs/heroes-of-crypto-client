import { beforeAll, expect, test } from "bun:test";
import { Sprite, Texture, ColorMatrixFilter } from "pixi.js";
import { manticoreIdleMotion, manticoreIdleOffset, MANTICORE_IDLE_PERIOD_MS } from "./ManticoreLabIdleMotion";
import { syncManticoreLabIdle } from "./ManticoreLabIdleVisuals";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            querySelector: () => null,
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
        };
});

test("idle preserves all four paw contacts through a complete loop", () => {
    for (let time = 0; time <= 8800; time += 50) {
        const motion = manticoreIdleMotion(time);
        for (const [x, y] of [
            [122, 727],
            [360, 718],
            [516, 734],
            [686, 729],
        ]) {
            manticoreIdleOffset(x, y, motion).forEach((value) => expect(Math.abs(value)).toBe(0));
        }
        expect(motion[0]).toBeGreaterThanOrEqual(0);
        expect(motion[0]).toBeLessThanOrEqual(16);
    }
});
test("body lowers without changing head dimensions and tail reverses around its fixed root", () => {
    const low = manticoreIdleMotion(6600 / (1.15 * 1.2));
    expect(manticoreIdleOffset(450, 530, low)[1]).toBeCloseTo(16);
    expect(manticoreIdleOffset(626, 492, low)).toEqual(manticoreIdleOffset(660, 520, low));
    const forward = manticoreIdleOffset(100, 370, manticoreIdleMotion(5500 / (1.15 * 1.2)))[0];
    const back = manticoreIdleOffset(100, 370, manticoreIdleMotion(7700 / (1.15 * 1.2)))[0];
    expect(forward).toBeGreaterThan(15);
    expect(back).toBeLessThan(-15);
    expect(manticoreIdleOffset(183, 574, low)[0]).toBe(0);
});
test("motion and eye pulse have a smooth periodic seam and safe initial state", () => {
    expect(manticoreIdleMotion(Number.NaN)).toEqual(manticoreIdleMotion(0));
    expect(manticoreIdleMotion(-50)).toEqual(manticoreIdleMotion(0));
    for (const time of [4400, 4623, 5400, 6100]) {
        manticoreIdleMotion(time).forEach((v, i) =>
            expect(v).toBeCloseTo(manticoreIdleMotion(time + MANTICORE_IDLE_PERIOD_MS)[i], 8),
        );
    }
    const before = manticoreIdleMotion(8799.99 / (1.15 * 1.2)),
        after = manticoreIdleMotion(8800.01 / (1.15 * 1.2));
    before.forEach((v, i) => expect(Math.abs(v - after[i])).toBeLessThan(0.002));
    expect(manticoreIdleMotion(4950 / (1.15 * 1.2))[3]).toBeGreaterThan(manticoreIdleMotion(6050 / (1.15 * 1.2))[3]);
});
test("idle filter keeps sprite geometry and unrelated effects; instances and exits are isolated", () => {
    const a = new Sprite(Texture.EMPTY),
        b = new Sprite(Texture.EMPTY);
    const other = new ColorMatrixFilter();
    a.filters = [other];
    a.scale.set(-0.8, 0.8);
    a.anchor.set(0.5, 730 / 768);
    syncManticoreLabIdle(a, true, 1200);
    syncManticoreLabIdle(b, true, 2400);
    expect(a.filters!.length).toBe(2);
    expect(a.filters![1]).not.toBe(b.filters![0]);
    expect(a.scale.x).toBe(-0.8);
    expect(a.scale.y).toBe(0.8);
    expect(a.anchor.y).toBe(730 / 768);
    syncManticoreLabIdle(a, false, 2500);
    expect(a.filters!.length).toBe(1);
    expect(a.filters![0]).toBe(other);
    expect(b.filters!.length).toBe(1);
    a.destroy();
    b.destroy();
    other.destroy();
});
