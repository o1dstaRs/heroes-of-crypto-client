import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { ColorMatrixFilter, DOMAdapter, Sprite, Texture } from "pixi.js";
import { syncEfreetLabIdleFire } from "./EfreetLabIdleFire";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Efreet fire keeps facing and authored frames intact, and releases only its own filter during actions", () => {
    const sprite = new Sprite(Texture.WHITE);
    const grade = new ColorMatrixFilter();
    sprite.filters = [grade];
    sprite.anchor.set(0.5, 0.8);
    sprite.scale.set(-0.2, -0.2);
    syncEfreetLabIdleFire(sprite, true, 1000);
    const fire = sprite.filters![1];
    syncEfreetLabIdleFire(sprite, true, 1250);
    expect(sprite.filters).toEqual([grade, fire]);
    expect(fire.resources.fire.uniforms.uTime).toBe(1.25);
    expect(sprite.texture).toBe(Texture.WHITE);
    expect(sprite.scale.x).toBe(-0.2);
    expect(sprite.anchor.y).toBe(0.8);
    syncEfreetLabIdleFire(sprite, false, 1300);
    expect(sprite.filters).toEqual([grade]);
    syncEfreetLabIdleFire(sprite, true, 1500);
    expect(sprite.filters).toEqual([grade, fire]);
    expect(fire.resources.fire.uniforms.uTime).toBe(1.5);
    syncEfreetLabIdleFire(sprite, true, 5300, 29);
    expect(fire.resources.fire.uniforms.uClapping).toBe(1);
    syncEfreetLabIdleFire(sprite, true, 6000, 0);
    expect(fire.resources.fire.uniforms.uClapping).toBe(0);
    syncEfreetLabIdleFire(sprite, true, 6100, 0, true, Math.PI);
    syncEfreetLabIdleFire(sprite, true, 6500, 6, true, Math.PI);
    expect(fire.resources.fire.uniforms.uMoving).toBeGreaterThan(0.95);
    expect(fire.resources.fire.uniforms.uWindPhase).toBe(Math.PI);
    expect(fire.resources.fire.uniforms.uTime).toBe(6.5);
    syncEfreetLabIdleFire(sprite, true, 7100, 0, false);
    expect(fire.resources.fire.uniforms.uMoving).toBeLessThan(0.02);
    syncEfreetLabIdleFire(sprite, true, 7200, 2, false, 0, true);
    expect(fire.resources.fire.uniforms.uAuthoredReaction).toBe(1);
    expect(fire.resources.fire.uniforms.uHandFireBounds).toEqual([220, 364, 332, 334]);
    expect(fire.resources.fire.uniforms.uHitWidthScale).toBeCloseTo(384 / 319, 6);
    expect(sprite.texture).toBe(Texture.WHITE);
    expect(sprite.scale.x).toBe(-0.2);
    syncEfreetLabIdleFire(sprite, true, 7300, 3, false, 0, true);
    expect(fire.resources.fire.uniforms.uHandFireBounds).toEqual([214, 368, 320, 338]);
    expect(fire.resources.fire.uniforms.uHitWidthScale).toBeCloseTo(384 / 289, 6);
    syncEfreetLabIdleFire(sprite, true, 7800, 0);
    expect(fire.resources.fire.uniforms.uAuthoredReaction).toBe(0);
    expect(fire.resources.fire.uniforms.uHandFireBounds).toEqual([170, 336, 352, 370]);
    expect(fire.resources.fire.uniforms.uHitWidthScale).toBe(1);
    for (const frame of [6, 7, 18, 19]) {
        syncEfreetLabIdleFire(sprite, true, 8000, frame);
        expect(fire.resources.fire.uniforms.uIdleDebrisBounds).toEqual([253, 150, 284, 177]);
    }
    syncEfreetLabIdleFire(sprite, true, 8000, 29);
    expect(fire.resources.fire.uniforms.uIdleDebrisBounds).toEqual([0, 0, 0, 0]);
    syncEfreetLabIdleFire(sprite, true, 8000, 6, false, 0, true);
    expect(fire.resources.fire.uniforms.uIdleDebrisBounds).toEqual([0, 0, 0, 0]);
    const destroy = spyOn(fire, "destroy");
    sprite.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
    destroy.mockRestore();
    grade.destroy();
});
