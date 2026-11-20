import { expect, spyOn, test } from "bun:test";
import { DOMAdapter, Filter, Sprite, Texture } from "pixi.js";
import { syncCentaurLabMeleePalette } from "./CentaurLabMeleeVisuals";

test("Centaur melee switches grades with poses, preserves other filters and releases them on idle", () => {
    const canvas = spyOn(DOMAdapter.get(), "createCanvas").mockReturnValue({
        getContext: () => null,
    } as unknown as HTMLCanvasElement);
    try {
        const sprite = new Sprite(Texture.WHITE);
        const other = new Filter({});
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
