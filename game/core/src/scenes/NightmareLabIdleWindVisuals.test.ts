import { afterAll, beforeAll, expect, test } from "bun:test";
import { Container, ColorMatrixFilter, DOMAdapter, Sprite, Texture } from "pixi.js";
import { syncNightmareLabIdleWind } from "./NightmareLabIdleWindVisuals";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Nightmare fire releases action sprites and resumes without changing facing, texture or anchor", () => {
    const sprite = new Sprite(Texture.WHITE);
    const grade = new ColorMatrixFilter();
    sprite.filters = [grade];
    sprite.anchor.set(0.5, 0.95);
    sprite.scale.set(-0.25, -0.25);
    syncNightmareLabIdleWind(sprite, true, 1000, 0.8);
    const idle = sprite.filters?.[1];
    expect(idle).toBeDefined();
    for (const walking of [true, false, true, false]) {
        syncNightmareLabIdleWind(sprite, true, 4500, 0.8, walking);
        expect(sprite.filters?.[1]).toBe(idle!);
        expect(idle!.resources.idle.uniforms.uWalking).toBe(walking ? 1 : 0);
        expect(idle!.resources.idle.uniforms.uTime).toBe(4.5);
        expect(sprite.texture).toBe(Texture.WHITE);
        expect(sprite.scale.x).toBe(-0.25);
        expect(sprite.anchor.y).toBe(0.95);
    }
    // Authored poses are registered without mutating sprite geometry or resetting the fire clock.
    syncNightmareLabIdleWind(sprite, true, 5000, 0.8, true, true, "death", 4);
    for (let frame = 0; frame < 5; frame++) {
        syncNightmareLabIdleWind(sprite, true, 5000, 0.8, true, true, "death", frame);
        expect(idle!.resources.idle.uniforms.uPoseScale).toBe(1);
        expect(idle!.resources.idle.uniforms.uFireEnabled).toBe(0);
    }
    expect(idle!.resources.idle.uniforms.uHideMid[0]).toBeGreaterThan(0.063);
    expect(sprite.anchor.y).toBe(0.95);
    expect(sprite.scale.x).toBe(-0.25);
    syncNightmareLabIdleWind(sprite, true, 5050, 0.8, true, true, "hit", 1);
    expect(idle!.resources.idle.uniforms.uFireEnabled).toBe(1);
    const head = idle!.resources.idle.uniforms.uHead;
    // The newly drawn frame's eye and forelock stay inside the fire exclusion.
    for (const [x, y] of [
        [609, 313],
        [600, 280],
    ]) {
        expect(x).toBeGreaterThan(head[0]);
        expect(x).toBeLessThan(head[2]);
        expect(y).toBeGreaterThan(head[1]);
        expect(y).toBeLessThan(head[3]);
    }
    expect(idle!.padding).toBeGreaterThan(0);
    syncNightmareLabIdleWind(sprite, true, 5100, 0.8, true, true, "hit", 0);
    expect(idle!.resources.idle.uniforms.uPoseScale).toBe(1);
    expect(idle!.resources.idle.uniforms.uHideMid).toEqual([0.063, 0.039, 0.039]);
    syncNightmareLabIdleWind(sprite, true, 5200, 0.8);
    expect(idle!.resources.idle.uniforms.uPoseScale).toBe(1);
    expect(idle!.resources.idle.uniforms.uReaction).toBe(0);
    expect(idle!.resources.idle.uniforms.uFireEnabled).toBe(1);
    expect(idle!.resources.idle.uniforms.uTime).toBe(5.2);
    for (const enabled of [false, true, true, false, true]) {
        syncNightmareLabIdleWind(sprite, enabled, 6000, 0.8);
        expect(sprite.filters).toEqual(enabled ? [grade, idle] : [grade]);
        expect(sprite.texture).toBe(Texture.WHITE);
        expect(sprite.scale.x).toBe(-0.25);
        expect(sprite.scale.y).toBe(-0.25);
        expect(sprite.anchor.y).toBe(0.95);
    }
    syncNightmareLabIdleWind(sprite, false, 6000, 0.8);
    sprite.destroy();
    grade.destroy();
});

test("Nightmare cast smoke grows at the nostrils, detaches and clears without altering the mirrored body", () => {
    const world = new Container();
    const sprite = new Sprite(Texture.WHITE);
    world.addChild(sprite);
    sprite.anchor.set(0.5, 0.95);
    sprite.scale.set(-0.25, -0.25);
    syncNightmareLabIdleWind(sprite, true, 1000, 0, true, true, "cast", 2, Texture.WHITE, 0);
    const filter = sprite.filters![0];
    const u = filter.resources.idle.uniforms;
    expect(u.uSmokeAlpha).toBe(0);
    syncNightmareLabIdleWind(sprite, true, 1500, 0, true, true, "cast", 4, Texture.WHITE, 200 / 1.5);
    expect(u.uSmokeAlpha).toBe(1);
    expect(u.uSmokeStage).toBeGreaterThan(1);
    expect(u.uFireEnabled).toBe(1);
    const nostrilX = u.uSmokeRect[0] + 51 * 0.87;
    expect(nostrilX).toBe(654);
    expect(world.children).toHaveLength(2);
    expect(world.getBounds().width).toBeGreaterThan(sprite.getBounds().width);
    syncNightmareLabIdleWind(sprite, true, 2500, 0, true, true, "cast", 8, Texture.WHITE, 239 / 1.5);
    expect(u.uSmokeAlpha).toBeLessThan(0.01);
    expect(u.uSmokeRect[0] + 51 * 0.87).toBeGreaterThan(659);
    syncNightmareLabIdleWind(sprite, true, 2600, 0);
    expect(u.uSmokeAlpha).toBe(0);
    expect(world.children[1].visible).toBe(false);
    expect(sprite.scale.x).toBe(-0.25);
    expect(sprite.anchor.y).toBe(0.95);
    sprite.destroy();
    expect(world.children).toHaveLength(0);
    world.destroy();
});
