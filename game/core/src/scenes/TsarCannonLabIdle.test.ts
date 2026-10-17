import { afterAll, beforeAll, expect, test } from "bun:test";
import { BufferImageSource, ColorMatrixFilter, Container, DOMAdapter, Sprite, Texture } from "pixi.js";
import { cannonBarrelPhase } from "./TsarCannonBarrel";
import {
    CANNON_MUZZLE,
    CANNON_SMOKE_OFFSET,
    CANNON_SMOKE_ORIGIN,
    cannonWheelFrameIndex,
    syncCannonLabIdle,
} from "./TsarCannonLabIdle";
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
const texture = (width: number, height: number) =>
    new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width, height }) });
test("barrel rotation advances every display frame instead of holding at eight authored frames per second", () => {
    let previous = -1;
    for (let t = 0; t < 6000; t += 1000 / 60) {
        const phase = cannonBarrelPhase(t);
        expect(phase).toBeGreaterThan(previous);
        if (previous >= 0) expect(phase - previous).toBeCloseTo(Math.PI / 180, 6);
        previous = phase;
    }
    expect(cannonBarrelPhase(6000)).toBe(0);
});
test("idle never moves wheels or chassis, and transitions retain unrelated filters and action textures", () => {
    const world = new Container(),
        body = new Sprite(texture(768, 768));
    const base = texture(768, 768),
        relief = texture(1024, 1024),
        rest = body.texture;
    world.addChild(body);
    body.anchor.set(0.5, 0.95);
    body.scale.set(-0.2, -0.2);
    body.position.set(120, 160);
    body.pivot.x = 3;
    const other = new ColorMatrixFilter();
    body.filters = [other];
    syncCannonLabIdle(body, true, 1000, base, relief);
    const barrel = body.filters![0];
    for (let elapsed = 0; elapsed <= 36000; elapsed += 500) {
        syncCannonLabIdle(body, true, 1000 + elapsed, base, relief);
        expect(body.pivot.x).toBe(3);
        expect(body.position.x).toBe(120);
        expect(body.position.y).toBe(160);
        expect(body.texture).toBe(base);
        expect(body.filters).toEqual([barrel, other]);
    }
    const layer = world.children.find((c) => c.label === "tsar-cannon-muzzle-smoke") as Container,
        smoke = layer.children[0] as Sprite;
    expect(layer.pivot.x).toBe(3);
    expect(layer.scale.x).toBe(-0.2);
    expect(smoke.x + CANNON_SMOKE_ORIGIN[0]).toBeCloseTo(
        CANNON_MUZZLE[0] + CANNON_SMOKE_OFFSET[0] - body.anchor.x * 768,
    );
    expect(smoke.y + CANNON_SMOKE_ORIGIN[1]).toBeCloseTo(
        CANNON_MUZZLE[1] + CANNON_SMOKE_OFFSET[1] - body.anchor.y * 768,
    );
    syncCannonLabIdle(body, false, 38000, base, relief);
    expect(body.texture).toBe(rest);
    expect(body.filters).toEqual([other]);
    expect(layer.visible).toBe(false);
    syncCannonLabIdle(body, true, 39000, base, relief);
    expect(barrel.resources.barrel.uniforms.uPhase).toBeCloseTo(cannonBarrelPhase(38000));
    const action = texture(256, 256);
    body.texture = action;
    body.pivot.x = 8;
    syncCannonLabIdle(body, false, 40000, base, relief);
    expect(body.texture).toBe(action);
    expect(body.pivot.x).toBe(8);
    expect(body.filters).toEqual([other]);
    body.destroy();
    expect(layer.destroyed).toBe(true);
});

test("shared artwork keeps barrel and smoke clocks continuous through repeated texture updates", () => {
    const world = new Container(),
        body = new Sprite(texture(768, 768));
    const base = texture(768, 768),
        relief = texture(1024, 1024);
    world.addChild(body);
    syncCannonLabIdle(body, true, 1000, base, relief);
    const barrel = body.filters![0];
    const layer = world.children.find((c) => c.label === "tsar-cannon-muzzle-smoke") as Container;
    const smoke = layer.children[0] as Sprite;
    syncCannonLabIdle(body, true, 2000, base, relief);
    syncCannonLabIdle(body, true, 2500, base, relief);
    expect(body.texture).toBe(base);
    expect(barrel.resources.barrel.uniforms.uPhase).toBeCloseTo(Math.PI / 2);
    expect(smoke.filters![0].resources.smoke.uniforms.uTime).toBe(1.5);
    syncCannonLabIdle(body, true, 2700, base, relief);
    syncCannonLabIdle(body, true, 3000, base, relief);
    expect(smoke.filters![0].resources.smoke.uniforms.uTime).toBe(2);
    syncCannonLabIdle(body, true, 3100, base, relief);
    syncCannonLabIdle(body, true, 3200, base, relief);
    expect(layer.visible).toBe(true);
    body.destroy();
});

test("full-frame sprites follow travel and freeze without a wheel overlay", () => {
    const body = new Sprite(texture(768, 768)),
        base = texture(768, 768),
        relief = texture(1024, 1024),
        atlas = texture(6144, 6144);
    new Container().addChild(body);
    const update = (time: number, phase?: number) => {
        syncCannonLabIdle(body, true, time, base, relief, phase, atlas);
        expect(body.texture.source).toBe(atlas.source);
        expect(body.texture.width).toBe(768);
        expect(body.filters![0].resources.uWheel).toBeUndefined();
        return body.texture.frame.x / 768 + (body.texture.frame.y / 768) * 8;
    };
    expect(update(0, 0)).toBe(0);
    for (let i = 1; i <= 128; i++) expect(update(i * 10, (i * Math.PI) / 32)).toBe(i % 64);
    expect(update(1400, Math.PI * 4 + 0.7)).toBe(cannonWheelFrameIndex(0.7));
    expect(update(1500)).toBe(cannonWheelFrameIndex(0.7));
    expect(update(2000)).toBe(cannonWheelFrameIndex(0.7));
    expect(update(2100, 0)).toBe(cannonWheelFrameIndex(0.7));
    expect(update(2200, 0.2)).toBe(cannonWheelFrameIndex(0.9));
    body.destroy();
});
test("original full sprite stays installed through actions without changing wheel artwork", () => {
    const world = new Container(),
        body = new Sprite(texture(768, 768));
    world.addChild(body);
    const base = texture(768, 768),
        relief = texture(1024, 1024),
        atlas = texture(6144, 6144);
    syncCannonLabIdle(body, true, 0, base, relief, 0.7, atlas);
    const frame = body.texture,
        filter = body.filters![0];
    for (const stateName of ["attack", "attack_up", "attack_down", "hit", "death"]) {
        for (const progress of [0, 0.5, 1]) {
            body.texture = base;
            syncCannonLabIdle(body, true, 1000, base, relief, undefined, atlas, { stateName, progress });
            expect(body.texture).toBe(frame);
            expect(body.filters![0]).toBe(filter);
            expect([...filter.resources.barrel.uniforms.uAction].every(Number.isFinite)).toBe(true);
        }
    }
    syncCannonLabIdle(body, true, 2000, base, relief, undefined, atlas);
    expect([...filter.resources.barrel.uniforms.uAction]).toEqual([0, 0, 0, 0]);
    body.destroy();
});

test("hit and shots retain the stopped wheel phase, then return to that same idle cel", () => {
    const body = new Sprite(texture(768, 768));
    new Container().addChild(body);
    const base = texture(768, 768),
        relief = texture(1024, 1024),
        atlas = texture(6144, 6144);
    syncCannonLabIdle(body, true, 0, base, relief, 1.3, atlas);
    const stopped = body.texture;
    const actionTexture = texture(1024, 1024);
    for (const stateName of ["hit", "attack", "attack_up", "attack_down"]) {
        body.texture = actionTexture;
        syncCannonLabIdle(body, false, 100, base, relief, undefined, atlas, { stateName, progress: 0 });
        const wheels = body.filters!.find((filter) => filter.resources.uStoppedWheels === atlas.source)!;
        expect(wheels).toBeDefined();
        expect([...wheels.resources.wheels.uniforms.uWheelFrame]).toEqual([
            stopped.frame.x / 6144,
            stopped.frame.y / 6144,
            1 / 8,
            1 / 8,
        ]);
        syncCannonLabIdle(body, false, 200, base, relief, undefined, atlas, { stateName, progress: 0.9 });
        expect(body.texture).toBe(actionTexture);
        expect(body.filters).toContain(wheels);
        syncCannonLabIdle(body, true, 300, base, relief, undefined, atlas);
        expect(body.texture).toBe(stopped);
        expect(body.filters).not.toContain(wheels);
    }
    body.destroy();
});

test("all six attack directions keep the normal barrel clock through recoil and back to idle", () => {
    const body = new Sprite(texture(768, 768));
    new Container().addChild(body);
    const base = texture(768, 768),
        relief = texture(1024, 1024),
        atlas = texture(6144, 6144);
    syncCannonLabIdle(body, true, 1000, base, relief, undefined, atlas);
    const actionTexture = texture(1024, 1024);
    let now = 1500;
    for (const stateName of [
        "attack",
        "attack_up",
        "attack_down",
        "melee_attack",
        "melee_attack_up",
        "melee_attack_down",
    ]) {
        body.texture = actionTexture;
        for (const frameIndex of [0, 3, 6, 14, 23]) {
            now += 100;
            syncCannonLabIdle(body, false, now, base, relief, undefined, atlas, {
                stateName,
                frameIndex,
                progress: frameIndex / 23,
            });
            const filter = body.filters!.find((f) => f.resources.barrel?.uniforms.uAttackPose[0] === 1024)!;
            expect(filter).toBeDefined();
            expect(filter.resources.barrel.uniforms.uPhase).toBeCloseTo(cannonBarrelPhase(now - 1000));
            expect(filter.resources.barrel.uniforms.uAttackPose[3]).toBe(
                frameIndex === 6 ? (stateName.startsWith("melee_") ? -46 : 46) : 0,
            );
            expect(body.texture).toBe(actionTexture);
            const smoke = body.parent!.children.find((c) => c.label === "tsar-cannon-muzzle-smoke")!;
            expect(smoke.visible).toBe(false);
        }
        now += 100;
        syncCannonLabIdle(body, true, now, base, relief, undefined, atlas);
        const idle = body.filters!.find((f) => f.resources.barrel?.uniforms.uAttackPose[0] === 768)!;
        expect(idle.resources.barrel.uniforms.uPhase).toBeCloseTo(cannonBarrelPhase(now - 1000));
    }
    body.destroy();
});
