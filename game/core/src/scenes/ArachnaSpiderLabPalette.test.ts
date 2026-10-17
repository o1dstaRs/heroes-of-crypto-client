import { afterAll, beforeAll, expect, test } from "bun:test";
import { DOMAdapter, Filter, Sprite, Texture } from "pixi.js";
import {
    ArachnaSpiderFramePaletteFilter,
    spiderFramePalette,
    syncArachnaSpiderLabPalette,
} from "./ArachnaSpiderLabPalette";
import { SPIDER_IDLE_PALETTE } from "./ArachnaSpiderPaletteCurves";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("mini spider palette preserves idle endpoints and grades every painted cel before effects", () => {
    const sprite = new Sprite(Texture.EMPTY);
    const effect = new Filter({});
    sprite.filters = [effect];
    syncArachnaSpiderLabPalette(sprite, true);
    const idleGrade = sprite.filters![1];
    for (const state of ["walk", "death", "melee_attack", "melee_attack_up", "melee_attack_down"]) {
        const count = state === "walk" ? 8 : 6;
        for (let frame = 0; frame < count; frame++) {
            syncArachnaSpiderLabPalette(sprite, true, state, frame);
            const canonical = state !== "walk" && (frame === 0 || (state !== "death" && frame === 5));
            const match = sprite.filters!.find((entry) => entry instanceof ArachnaSpiderFramePaletteFilter);
            expect(Boolean(match)).toBe(!canonical);
            if (match) {
                expect(sprite.filters![0]).toBe(match);
                const curves = spiderFramePalette(state, frame);
                expect(match.resources.palette.uniforms.uRed2[0]).toBeCloseTo(curves[0][0][2], 5);
                expect(match.resources.palette.uniforms.uNeutral2[1]).toBeCloseTo(curves[1][1][2], 5);
            } else expect(spiderFramePalette(state, frame)).toEqual(SPIDER_IDLE_PALETTE);
            expect(sprite.filters).toContain(effect);
            expect(sprite.filters!.at(-1)).toBe(idleGrade);
        }
    }
    syncArachnaSpiderLabPalette(sprite, true, "idle");
    expect(sprite.filters).toEqual([effect, idleGrade]);
    // Death removes the idle effect; resuming idle can append it after the base grade.
    sprite.filters = [idleGrade, effect];
    syncArachnaSpiderLabPalette(sprite, true, "idle");
    expect(sprite.filters).toEqual([effect, idleGrade]);
    syncArachnaSpiderLabPalette(sprite, false, "death", 5);
    expect(sprite.filters).toEqual([effect]);
    sprite.destroy();
    effect.destroy();
});
