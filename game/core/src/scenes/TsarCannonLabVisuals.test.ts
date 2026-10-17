import { afterAll, beforeAll, expect, test } from "bun:test";
import { BufferImageSource, Container, DOMAdapter, Sprite, Texture } from "pixi.js";
import {
    CANNON_DUST_INTERVAL,
    CANNON_DUST_LIFE_MS,
    cannonWalkColor,
    syncCannonWalkPalette,
    syncCannonWheelDust,
} from "./TsarCannonLabVisuals";
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
const texture = (width: number, height: number) =>
    new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width, height }) });

test("cannon walk matches battlefield bronze midtones and preserves unrelated filters at rest", () => {
    expect(cannonWalkColor([104, 79, 54])).toEqual([70, 50, 34]);
    expect(cannonWalkColor([186, 151, 113])).toEqual([121, 99, 76]);
    expect(cannonWalkColor([0, 0, 0])).toEqual([0, 0, 0]);
    const s = new Sprite(texture(768, 768));
    syncCannonWalkPalette(s, true);
    const f = s.filters?.[0];
    expect(f).toBeDefined();
    syncCannonWalkPalette(s, true);
    expect(s.filters).toHaveLength(1);
    syncCannonWalkPalette(s, false);
    expect(s.filters).toBeNull();
});

test("paired wheel dust follows distance, stays on the floor, and fades after stop", () => {
    const world = new Container();
    const s = new Sprite(texture(768, 768));
    world.addChild(s);
    s.anchor.set(0.5, 0.9348958333333334);
    s.scale.set(0.2, -0.2);
    s.position.set(100, 150);
    s.zIndex = 4000;
    const atlas = texture(1536, 1024);
    const walk = { frameIndex: 0, gaitDistanceCells: 0 };
    syncCannonWheelDust(s, walk, true, 0, atlas, true);
    const dust = world.children.find((c) => c.label === "tsar-cannon-wheel-dust") as Container;
    expect(dust).toBeDefined();
    expect(dust.children).toHaveLength(0);
    // A stationary clock tick must not emit.
    syncCannonWheelDust(s, walk, true, 100, atlas, true);
    expect(dust.children).toHaveLength(0);
    s.x += 20;
    walk.gaitDistanceCells = CANNON_DUST_INTERVAL;
    syncCannonWheelDust(s, walk, true, 120, atlas, true);
    expect(dust.children).toHaveLength(2);
    expect(dust.zIndex).toBeLessThan(s.zIndex);
    const first = dust.children[0] as Sprite;
    const second = dust.children[1] as Sprite;
    expect(first.x).toBeCloseTo(120 + (146 - 384) * 0.2, 6);
    expect(second.x).toBeCloseTo(120 + (438 - 384) * 0.2, 6);
    expect(first.y).toBeCloseTo(150 + (710 - 0.9348958333333334 * 768) * -0.2, 6);
    const x = first.x;
    s.x += 30;
    syncCannonWheelDust(s, walk, true, 120, atlas, true);
    expect(dust.children).toHaveLength(2);
    expect(first.x).toBe(x);
    // New direction emits from the new contact, without connecting a cloud across the corner.
    s.y += 20;
    walk.gaitDistanceCells += CANNON_DUST_INTERVAL;
    syncCannonWheelDust(s, walk, true, 160, atlas, true);
    expect(dust.children).toHaveLength(4);
    syncCannonWheelDust(s, undefined, true, 200, atlas, true);
    expect(dust.children).toHaveLength(4);
    syncCannonWheelDust(s, undefined, true, 160 + CANNON_DUST_LIFE_MS, atlas, true);
    expect(dust.children).toHaveLength(0);
    const next = { frameIndex: 0, gaitDistanceCells: 0 };
    s.scale.x = -0.2;
    syncCannonWheelDust(s, next, true, 800, atlas, true);
    s.x -= 20;
    next.gaitDistanceCells = CANNON_DUST_INTERVAL;
    syncCannonWheelDust(s, next, true, 900, atlas, true);
    expect(dust.children).toHaveLength(2);
    expect(dust.children[0].scale.x).toBeLessThan(0);
    syncCannonWheelDust(s, next, false, 920, atlas, true);
    expect(dust.children).toHaveLength(0);
    expect(dust.visible).toBe(false);
    s.destroy();
    expect(dust.destroyed).toBe(true);
});
