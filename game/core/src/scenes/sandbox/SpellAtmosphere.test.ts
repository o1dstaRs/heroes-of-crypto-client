import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { Container, DOMAdapter, Filter } from "pixi.js";
import { SpellAtmosphere, type SpellAtmosphereSample } from "./SpellAtmosphere";
import { emitFireAtmosphere } from "./FireSpellAtmosphere";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("atmosphere attaches only while active, preserves other filters and frees its GPU resources", () => {
    const root = new Container();
    const existing = new Filter({});
    root.filters = [existing];
    const effect = new SpellAtmosphere((c) => {
        root.addChild(c);
    });
    effect.update(0);
    expect(root.filters).toEqual([existing]);
    effect.emit({ x: 50, y: 80, width: 100, height: 150, light: 0.5, heat: 1 });
    effect.update(100);
    expect(root.filters).toHaveLength(2);
    const owned = root.filters![1];
    effect.update(110);
    expect(root.filters).toHaveLength(2);
    effect.begin();
    effect.update(120);
    expect(root.filters).toEqual([existing]);
    effect.emit({ x: 50, y: 80, width: 100, height: 150, light: 0.5 });
    effect.update(130);
    expect(root.filters![1]).toBe(owned);
    const destroy = spyOn(owned, "destroy");
    effect.clear();
    expect(root.filters).toEqual([existing]);
    expect(root.children).toHaveLength(0);
    expect(destroy).toHaveBeenCalledTimes(1);
    existing.destroy();
});

test("fire lighting follows the meteor head then flashes at impact; ring warmth fades with the animation", () => {
    const target = { center: { x: 100, y: 200 }, width: 60, height: 50 };
    const samples: SpellAtmosphereSample[] = [];
    const emit = (s: SpellAtmosphereSample) => {
        samples.push(s);
    };
    emitFireAtmosphere(emit, "meteor", 320, target, target);
    expect(samples[0].x).toBeCloseTo(100 + 0.75 * 60 * 2.2);
    emitFireAtmosphere(emit, "meteor", 640, target, target);
    expect(samples[1].x).toBe(100);
    expect(samples[1].light).toBeGreaterThan(samples[0].light);
    emitFireAtmosphere(emit, "ring", 310, target, { ...target, width: 180, height: 150 });
    expect(samples[2].light).toBeGreaterThan(0.9);
    emitFireAtmosphere(emit, "ring", 1400, target, target);
    expect(samples[3].light).toBe(0);
    expect(samples[3].heat).toBe(0);
});
