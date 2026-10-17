import { beforeAll, afterAll, expect, test, spyOn } from "bun:test";
import { DOMAdapter, Sprite, Texture, Filter } from "pixi.js";
import { ANGEL_IDLE_PALETTE } from "./AngelActionPaletteCurves";
import { angelActionPalette, AngelActionPaletteFilter, syncAngelActionPalette } from "./AngelActionPalette";
import { ANGEL_CAST_MELEE_CALIBRATION, ANGEL_CAST_MELEE_TARGET } from "./AngelCastMeleeCalibration";
import { ANGEL_MELEE_MATERIALS, ANGEL_MELEE_MATERIAL_TARGET } from "./AngelMeleeMaterialCalibration";
import { angelMeleeSecondSupportOffset } from "./AngelMeleeSupport";
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
test("a melee texture swap updates both the second contact and measured material colors before drawing", () => {
    const frames = Array.from({ length: 8 }, () => new Texture({ source: Texture.WHITE.source }));
    const sprite = new Sprite(frames[0]);
    syncAngelActionPalette(sprite, "melee_attack", 0, true, frames);
    const filter = sprite.filters![0] as AngelActionPaletteFilter;
    const draw = spyOn(Filter.prototype, "apply").mockImplementation(() => {});
    try {
        sprite.texture = frames[4];
        filter.apply(
            { calculateSpriteMatrix: () => {} } as unknown as Parameters<Filter["apply"]>[0],
            Texture.WHITE,
            Texture.WHITE,
            true,
        );
        const uniforms = filter.resources.palette.uniforms;
        const expected = angelMeleeSecondSupportOffset("melee_attack", 4);
        expect(uniforms.uSecondSupport[0]).toBeCloseTo(expected[0], 4);
        expect(uniforms.uSecondSupport[1]).toBeCloseTo(expected[1], 4);
        for (let channel = 0; channel < 3; channel++) {
            expect(uniforms.uCloth3[channel]).toBeCloseTo(ANGEL_MELEE_MATERIALS.melee_attack[4][5][channel][3], 5);
            expect(uniforms.uTargetCloth3[channel]).toBeCloseTo(ANGEL_MELEE_MATERIAL_TARGET[5][channel][3], 5);
        }
    } finally {
        draw.mockRestore();
        sprite.destroy();
        frames.forEach((t) => t.destroy());
    }
});
test("all action cels use measured material curves and copied idle endpoints remain unchanged", () => {
    for (const [state, count] of [
        ["cast", 19],
        ["hit", 5],
        ["death", 6],
        ["melee_attack", 8],
        ["melee_attack_up", 8],
        ["melee_attack_down", 8],
    ] as const) {
        expect(angelActionPalette(state, 0)).toEqual(ANGEL_IDLE_PALETTE);
        if (state !== "death") expect(angelActionPalette(state, count - 1)).toEqual(ANGEL_IDLE_PALETTE);
        for (let frame = 0; frame < count; frame++) {
            const curves = angelActionPalette(state, frame);
            expect(curves).toHaveLength(3);
            for (const material of curves)
                for (const channel of material) {
                    expect(channel).toHaveLength(7);
                    for (let i = 1; i < channel.length; i++) expect(channel[i]).toBeGreaterThanOrEqual(channel[i - 1]);
                }
        }
    }
});
test("palette binds to the rendered texture after a frame swap and removes itself on idle", () => {
    const frames = Array.from({ length: 5 }, () => new Texture({ source: Texture.WHITE.source }));
    const sprite = new Sprite(frames[0]);
    const other = new Filter({});
    sprite.filters = [other];
    syncAngelActionPalette(sprite, "hit", 0, true, frames);
    const filter = sprite.filters![0] as AngelActionPaletteFilter;
    const draw = spyOn(Filter.prototype, "apply").mockImplementation(() => {});
    try {
        sprite.texture = frames[2];
        filter.apply(
            { calculateSpriteMatrix: () => {} } as unknown as Parameters<Filter["apply"]>[0],
            Texture.WHITE,
            Texture.WHITE,
            true,
        );
        expect(filter.resources.palette.uniforms.uNeutral3[0]).toBeCloseTo(angelActionPalette("hit", 2)[0][0][3], 5);
        syncAngelActionPalette(sprite, "idle", 0, true);
        expect(sprite.filters).toEqual([other]);
        syncAngelActionPalette(sprite, "death", 2, false);
        expect(sprite.filters).toEqual([other]);
    } finally {
        draw.mockRestore();
        sprite.destroy();
        frames.forEach((t) => t.destroy());
    }
});

test("cast and all three strikes use separate body, feather and skin swatches on every cel", () => {
    for (const [state, count] of [
        ["cast", 19],
        ["melee_attack", 8],
        ["melee_attack_up", 8],
        ["melee_attack_down", 8],
    ] as const) {
        const cels = ANGEL_CAST_MELEE_CALIBRATION[state];
        expect(cels).toHaveLength(count);
        expect(cels[0].curves).toEqual(ANGEL_CAST_MELEE_TARGET);
        expect(cels[count - 1].curves).toEqual(ANGEL_CAST_MELEE_TARGET);
        for (const cel of cels) {
            expect(cel.curves).toHaveLength(5);
            for (const material of cel.curves)
                for (const channel of material) {
                    expect(channel).toHaveLength(7);
                    for (let i = 0; i < channel.length; i++) {
                        expect(Number.isFinite(channel[i])).toBe(true);
                        expect(channel[i]).toBeGreaterThanOrEqual(i ? channel[i - 1] : 0);
                        expect(channel[i]).toBeLessThanOrEqual(1);
                    }
                }
        }
    }
});
