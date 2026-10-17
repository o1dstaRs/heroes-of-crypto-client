import { beforeAll, expect, test } from "bun:test";
import { Sprite, Texture, ColorMatrixFilter } from "pixi.js";
import {
    griffinLabIdleFrame,
    griffinFeatherAgeMs,
    GRIFFIN_IDLE_FRAME_COUNT,
    GRIFFIN_IDLE_BREATH_PERIOD_MS,
    GRIFFIN_PREEN_FRAME_COUNT,
    GRIFFIN_PREEN_DURATION_MS,
    GRIFFIN_PREEN_START_MS,
    GRIFFIN_PREEN_FEATHER_RELEASE_MS,
    GRIFFIN_PREEN_FEATHER_LIFETIME_MS,
    GRIFFIN_PREEN_PERIOD_MS,
} from "./GriffinLabIdle";
import { syncGriffinLabIdle } from "./GriffinLabIdleVisuals";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            createElement: () => ({ getContext: () => null }),
        };
});

test("authored idle and grooming visit every frame and join at neutral poses", () => {
    const idle = new Set<number>();
    const preen = new Set<number>();
    for (let i = 0; i < GRIFFIN_IDLE_FRAME_COUNT; i++) {
        idle.add(griffinLabIdleFrame(((i + 0.5) * GRIFFIN_IDLE_BREATH_PERIOD_MS) / GRIFFIN_IDLE_FRAME_COUNT));
    }
    for (let i = 0; i < GRIFFIN_PREEN_FRAME_COUNT; i++) {
        preen.add(
            griffinLabIdleFrame(
                GRIFFIN_PREEN_START_MS + ((i + 0.5) * GRIFFIN_PREEN_DURATION_MS) / GRIFFIN_PREEN_FRAME_COUNT,
            ),
        );
    }
    expect(idle.size).toBe(GRIFFIN_IDLE_FRAME_COUNT);
    expect(Math.max(...idle)).toBe(GRIFFIN_IDLE_FRAME_COUNT - 1);
    expect(preen.size).toBe(GRIFFIN_PREEN_FRAME_COUNT);
    expect(Math.min(...preen)).toBe(GRIFFIN_IDLE_FRAME_COUNT);
    expect(griffinLabIdleFrame(GRIFFIN_IDLE_BREATH_PERIOD_MS)).toBe(0);
    expect(griffinLabIdleFrame(GRIFFIN_PREEN_START_MS)).toBe(GRIFFIN_IDLE_FRAME_COUNT);
    expect(griffinLabIdleFrame(GRIFFIN_PREEN_START_MS + GRIFFIN_PREEN_DURATION_MS)).toBe(0);
    expect(griffinLabIdleFrame(GRIFFIN_PREEN_START_MS + GRIFFIN_PREEN_PERIOD_MS)).toBe(GRIFFIN_IDLE_FRAME_COUNT);
    for (const time of [Number.NaN, Infinity, -Infinity, -1]) expect(griffinLabIdleFrame(time)).toBe(0);
});

test("two feathers emit after authored beak contact and expire across the rest transition", () => {
    const release = GRIFFIN_PREEN_START_MS + GRIFFIN_PREEN_FEATHER_RELEASE_MS;
    expect(griffinLabIdleFrame(release)).toBe(GRIFFIN_IDLE_FRAME_COUNT + 24);
    expect(griffinFeatherAgeMs(release - 1)).toBe(-1);
    expect(griffinFeatherAgeMs(release)).toBe(0);
    expect(griffinFeatherAgeMs(release + GRIFFIN_PREEN_FEATHER_LIFETIME_MS)).toBe(-1);
    expect(griffinFeatherAgeMs(GRIFFIN_PREEN_START_MS + GRIFFIN_PREEN_DURATION_MS)).toBeGreaterThan(0);
    expect(griffinFeatherAgeMs(release + GRIFFIN_PREEN_PERIOD_MS)).toBeCloseTo(0);
});

test("ordinary idle has no deformation filter; feather effects preserve registration and unrelated filters", () => {
    const sprite = new Sprite(Texture.EMPTY);
    const unrelated = new ColorMatrixFilter();
    sprite.filters = [unrelated];
    sprite.scale.set(-0.5, -0.7);
    sprite.anchor.set(0.5, 0.9505);
    syncGriffinLabIdle(sprite, true, 1000, 1000);
    expect(sprite.filters).toEqual([unrelated]);
    const release = GRIFFIN_PREEN_START_MS + GRIFFIN_PREEN_FEATHER_RELEASE_MS;
    syncGriffinLabIdle(sprite, true, 2000, release + 10);
    const owned = sprite.filters![1];
    expect(sprite.filters).toHaveLength(2);
    expect(sprite.scale.x).toBe(-0.5);
    expect(sprite.scale.y).toBe(-0.7);
    syncGriffinLabIdle(sprite, true, 2100, release + 110);
    expect(sprite.filters![1]).toBe(owned);
    syncGriffinLabIdle(sprite, false, 2500, release + 300);
    expect(sprite.filters).toEqual([unrelated]);
    expect(sprite.anchor.y).toBe(0.9505);
    syncGriffinLabIdle(sprite, true, 3000, release + 400);
    expect(sprite.filters![1]).toBe(owned);
    syncGriffinLabIdle(sprite, true, 4000, release + GRIFFIN_PREEN_FEATHER_LIFETIME_MS);
    expect(sprite.filters).toEqual([unrelated]);
    sprite.destroy();
    unrelated.destroy();
});
