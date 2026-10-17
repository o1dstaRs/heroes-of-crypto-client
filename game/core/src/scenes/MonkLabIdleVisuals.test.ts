import { beforeAll, expect, test } from "bun:test";
import { BufferImageSource, ColorMatrixFilter, Sprite, Texture } from "pixi.js";
import {
    MONK_HEAD_NOD_RADIANS,
    MONK_IDLE_CYCLE_MS,
    MONK_IDLE_MATERIAL_GAINS,
    MonkIdleFilter,
    monkIdleHeadAngle,
    syncMonkLabIdle,
} from "./MonkLabIdleVisuals";

beforeAll(() => {
    if (typeof document === "undefined") {
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
            querySelector: () => null,
        };
    }
});

test("Monk nod crosses neutral smoothly and closes the loop without a head jump", () => {
    const t = MONK_IDLE_CYCLE_MS;
    expect(monkIdleHeadAngle(0)).toBeCloseTo(0, 10);
    expect(monkIdleHeadAngle(t / 4)).toBeCloseTo(MONK_HEAD_NOD_RADIANS, 10);
    expect(monkIdleHeadAngle((t * 3) / 4)).toBeCloseTo(-MONK_HEAD_NOD_RADIANS, 10);
    expect(monkIdleHeadAngle(t)).toBeCloseTo(0, 10);
    expect(Math.abs(monkIdleHeadAngle(t - 1) - monkIdleHeadAngle(1))).toBeLessThan(0.0002);
});

test("Monk effects respect other filters, use each cel's material correction and release action ownership", () => {
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    const sprite = new Sprite(texture);
    const unrelated = new ColorMatrixFilter();
    sprite.filters = [unrelated];
    syncMonkLabIdle(sprite, true, 798, 17, texture);
    const filter = sprite.filters?.find((f) => f instanceof MonkIdleFilter) as MonkIdleFilter;
    expect(filter).toBeDefined();
    expect(sprite.filters).toContain(unrelated);
    expect(filter.resources.monk.uniforms.uHeadAngle).toBeCloseTo(MONK_HEAD_NOD_RADIANS);
    expect(filter.resources.monk.uniforms.uClothGain[0]).toBeCloseTo(MONK_IDLE_MATERIAL_GAINS[17][0][0]);
    syncMonkLabIdle(sprite, true, 0, 6, texture, "hit");
    expect(filter.resources.monk.uniforms.uReaction).toBe(1);
    expect(filter.resources.monk.uniforms.uPlantFeet).toBe(1);
    expect(filter.resources.monk.uniforms.uGlowStrength).toBeCloseTo(1);
    expect(filter.resources.monk.uniforms.uHitWidths[2]).toBeCloseTo(275 / 419, 4);
    syncMonkLabIdle(sprite, true, 0, 21, texture, "death");
    expect(filter.resources.monk.uniforms.uGlowStrength).toBe(0);
    expect([...filter.resources.monk.uniforms.uHitWidths]).toEqual([1, 1, 1, 1]);
    syncMonkLabIdle(sprite, true, 3000, 2, texture, "walk");
    expect(filter.resources.monk.uniforms.uPlantFeet).toBe(0);
    expect(filter.resources.monk.uniforms.uReaction).toBe(1);
    expect(filter.resources.monk.uniforms.uGlowStrength).toBeCloseTo(0.8);
    expect(filter.resources.monk.uniforms.uOrb[1]).toBeCloseTo(248.71);
    syncMonkLabIdle(sprite, true, 0, 9, texture, "melee_attack_up");
    expect(filter.resources.monk.uniforms.uUpHeadScale).toBeCloseTo((150 - 58) / (150 - 28));
    syncMonkLabIdle(sprite, true, 0, 9, texture, "melee_attack");
    expect(filter.resources.monk.uniforms.uUpHeadScale).toBe(1);
    syncMonkLabIdle(sprite, false, 798, 17, texture);
    expect(sprite.filters).toEqual([unrelated]);
    syncMonkLabIdle(sprite, true, 1596, 0, texture);
    expect(sprite.filters?.filter((f) => f instanceof MonkIdleFilter)).toHaveLength(1);
    sprite.destroy();
    expect(filter.glProgram).toBeNull();
    unrelated.destroy();
    texture.destroy(true);
});
