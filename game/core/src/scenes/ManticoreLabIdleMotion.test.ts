import { beforeAll, expect, test } from "bun:test";
import { Sprite, Texture, ColorMatrixFilter } from "pixi.js";
import { manticoreIdleMotion, MANTICORE_IDLE_PERIOD_MS } from "./ManticoreLabIdleMotion";
import { syncManticoreLabIdle } from "./ManticoreLabIdleVisuals";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            querySelector: () => null,
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
        };
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
