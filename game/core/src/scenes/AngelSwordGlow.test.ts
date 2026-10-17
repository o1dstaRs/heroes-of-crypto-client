import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { AlphaFilter, Container, DOMAdapter, Filter, Matrix, Sprite, Texture } from "pixi.js";
import { angelSwordBlade, AngelSwordGlowFilter, syncAngelSwordGlow } from "./AngelSwordGlow";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("every authored Angel frame has a blade registration, with lab flight and idle kept separate", () => {
    for (const [state, count] of Object.entries({
        idle: 8,
        walk: 9,
        attack: 8,
        attack_up: 8,
        attack_down: 8,
        hit: 8,
        death: 8,
    })) {
        for (let i = 0; i < count; i++) {
            const blade = angelSwordBlade(state, i, false);
            expect(blade).toBeDefined();
            expect(Math.hypot(blade![2] - blade![0], blade![3] - blade![1])).toBeGreaterThan(20);
            if (state.startsWith("attack")) expect(angelSwordBlade(`melee_${state}`, i, false)).toEqual(blade);
        }
    }
    for (let i = 0; i < 24; i++) expect(angelSwordBlade("idle", i, true)).toBeDefined();
    for (let i = 0; i < 12; i++) expect(angelSwordBlade("walk", i, true)).toBeDefined();
    for (const [state, count] of [
        ["cast", 19],
        ["hit", 5],
        ["death", 6],
        ["melee_attack", 8],
        ["melee_attack_up", 8],
        ["melee_attack_down", 8],
    ] as const)
        for (let i = 0; i < count; i++) expect(angelSwordBlade(state, i, true)).toBeDefined();
    expect(angelSwordBlade("idle", 24, true)).toBeUndefined();
    expect(angelSwordBlade("walk", -1, true)).toBeUndefined();
    expect(angelSwordBlade("hidden", 0, true)).toBeUndefined();
});

test("state changes reuse one glow, preserve other filters and never alter the sprite registration", () => {
    const sprite = new Sprite(Texture.WHITE);
    sprite.scale.set(-0.4, 0.4);
    sprite.anchor.set(0.45, 0.95);
    const other = new AlphaFilter();
    sprite.filters = [other];
    syncAngelSwordGlow(sprite, "idle", 0, true);
    const filter = sprite.filters?.find((f) => f instanceof AngelSwordGlowFilter) as AngelSwordGlowFilter;
    expect(filter).toBeDefined();
    for (const [state, frame] of [
        ["walk", 4],
        ["attack_up", 3],
        ["hit", 2],
        ["death", 5],
        ["idle", 23],
    ] as const) {
        syncAngelSwordGlow(sprite, state, frame, true);
        expect(sprite.filters).toEqual([other, filter]);
        expect(Array.from(filter.resources.angelSword.uniforms.uBlade)).toEqual(
            Array.from(new Float32Array(angelSwordBlade(state, frame, true)!)),
        );
    }
    expect([sprite.scale.x, sprite.scale.y, sprite.anchor.x, sprite.anchor.y]).toEqual([-0.4, 0.4, 0.45, 0.95]);
    syncAngelSwordGlow(sprite, "hidden", 0, true);
    expect(sprite.filters).toEqual([other]);
    syncAngelSwordGlow(sprite, "idle", 0, true);
    expect(sprite.filters).toEqual([other, filter]);
    sprite.destroy();
});

test("a texture swap after the palette tick uses the new blade at draw time", () => {
    const frames = Array.from({ length: 12 }, () => new Texture({ source: Texture.WHITE.source }));
    const sprite = new Sprite(frames[0]);
    syncAngelSwordGlow(sprite, "walk", 0, true, frames);
    const filter = sprite.filters![0] as AngelSwordGlowFilter;
    const draw = spyOn(Filter.prototype, "apply").mockImplementation(() => {});
    try {
        // Match the unit's update order: the flight tick advances after palette sync.
        sprite.texture = frames[4];
        const manager = { calculateSpriteMatrix: (matrix: Matrix) => matrix.identity() };
        filter.apply(manager as unknown as Parameters<Filter["apply"]>[0], Texture.WHITE, Texture.WHITE, true);
        expect(Array.from(filter.resources.angelSword.uniforms.uBlade)).toEqual(
            Array.from(angelSwordBlade("walk", 4, true)!),
        );
        expect(filter.resources.angelSword.uniforms.uStrength).toBe(1);
        sprite.texture = new Texture({ source: Texture.WHITE.source });
        filter.apply(manager as unknown as Parameters<Filter["apply"]>[0], Texture.WHITE, Texture.WHITE, true);
        expect(filter.resources.angelSword.uniforms.uStrength).toBe(0);
        sprite.texture.destroy();
    } finally {
        draw.mockRestore();
        sprite.destroy();
        frames.forEach((texture) => texture.destroy());
    }
});

test("overhead sword clearance follows live battlefield zoom and mirrored ancestors before rendering", () => {
    const camera = new Container();
    const battlefield = new Container();
    const sprite = new Sprite(Texture.WHITE);
    camera.addChild(battlefield);
    battlefield.addChild(sprite);
    sprite.scale.set(-12, 10);
    for (const zoom of [1, 3, 0.5, 5]) {
        camera.scale.set(zoom);
        battlefield.scale.set(1, -1);
        // Deliberately do not render/update worldTransform before syncing the filter.
        syncAngelSwordGlow(sprite, "cast", 9, true, undefined, 1200);
        const filter = sprite.filters![0] as AngelSwordGlowFilter;
        const tip = angelSwordBlade("cast", 9, true)![3];
        const tipAndAuraAboveBody = ((Math.abs(tip) + 120) / 256) * sprite.height * zoom;
        expect(filter.padding).toBeGreaterThan(tipAndAuraAboveBody);
        expect(filter.padding).toBeCloseTo(Math.max(64, sprite.width * zoom * 1.2 + 16));
    }
    syncAngelSwordGlow(sprite, "walk", 0, true);
    expect(sprite.filters![0].padding).toBeCloseTo(Math.max(64, sprite.width * 5 * 0.25 + 16));
    camera.destroy({ children: true });
});
