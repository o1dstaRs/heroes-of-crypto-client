import { expect, spyOn, test } from "bun:test";
import { DOMAdapter, Filter, Sprite, Texture } from "pixi.js";
import { CENTAUR_MELEE_IDLE_PALETTE, CENTAUR_MELEE_SOURCE_PALETTES } from "./CentaurLabMeleePalette";
import { CENTAUR_RANGED_SOURCE_PALETTES } from "./CentaurLabRangedPalette";
import { centaurMeleePaletteRgb, syncCentaurLabMeleePalette } from "./CentaurLabMeleeVisuals";

test("Centaur melee matches idle material midtones and highlights in every authored attack pose", () => {
    for (const [state, poses] of Object.entries({
        ...CENTAUR_MELEE_SOURCE_PALETTES,
        ...CENTAUR_RANGED_SOURCE_PALETTES,
    })) {
        poses.forEach((pose, index) => {
            for (const material of ["horse", "skin", "cloth"] as const) {
                for (const q of [3, 4, 5, 6]) {
                    const rgb = pose[material].map((channel) => channel[q]);
                    const mapped = centaurMeleePaletteRgb(state, index + 1, material === "skin" ? 500 : 750, rgb);
                    mapped.forEach((v, c) => expect(v).toBeCloseTo(CENTAUR_MELEE_IDLE_PALETTE[material][c][q], 8));
                }
            }
        });
    }
});

test("Centaur melee leaves idle endpoints and other animation palettes unchanged", () => {
    const rgb = [87, 63, 48];
    for (const state of [
        undefined,
        "idle",
        "walk",
        "hit",
        "death",
        "melee_attack",
        "melee_attack_up",
        "melee_attack_down",
    ]) {
        for (const frame of [0, 5, -1, 6]) expect(centaurMeleePaletteRgb(state, frame, 750, rgb)).toEqual(rgb);
    }
});

test("Centaur melee switches grades with poses, preserves other filters and releases them on idle", () => {
    const canvas = spyOn(DOMAdapter.get(), "createCanvas").mockReturnValue({
        getContext: () => null,
    } as unknown as HTMLCanvasElement);
    try {
        const sprite = new Sprite(Texture.WHITE);
        const other = new Filter();
        sprite.filters = [other];
        const scale = sprite.scale.clone(),
            anchor = sprite.anchor.clone(),
            texture = sprite.texture;
        syncCentaurLabMeleePalette(sprite, "melee_attack", 0);
        expect(sprite.filters).toEqual([other]);
        syncCentaurLabMeleePalette(sprite, "melee_attack", 1);
        const grade = sprite.filters![0];
        expect(sprite.filters).toHaveLength(2);
        expect(sprite.filters).toContain(other);
        const before = [...grade.resources.palette.uniforms.uhorse3];
        syncCentaurLabMeleePalette(sprite, "melee_attack_down", 3);
        expect(sprite.filters![0]).toBe(grade);
        expect([...grade.resources.palette.uniforms.uhorse3]).not.toEqual(before);
        expect(sprite.texture).toBe(texture);
        expect(sprite.scale.x).toBe(scale.x);
        expect(sprite.scale.y).toBe(scale.y);
        expect(sprite.anchor.x).toBe(anchor.x);
        expect(sprite.anchor.y).toBe(anchor.y);
        syncCentaurLabMeleePalette(sprite, "melee_attack_down", 5);
        expect(sprite.filters).toEqual([other]);
        sprite.destroy();
        other.destroy();
    } finally {
        canvas.mockRestore();
    }
});
