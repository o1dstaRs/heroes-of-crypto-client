import { describe, expect, test } from "bun:test";
import { Sprite, Texture, TextureSource } from "pixi.js";

import { FireWallLayer } from "./FireWallLayer";

const cells = [{ x: 3, y: 4, l: 3 }];
const toWorld = () => ({ x: 192, y: 256, cellSize: 60 });
const makeAtlas = () => new Texture({ source: new TextureSource({ width: 2048, height: 2048 }) });

describe("fire wall rendering lifecycle", () => {
    test("loads only for a burning cell and keeps its sprites until the authoritative cell expires", () => {
        const atlas = makeAtlas();
        let lookups = 0;
        const layer = new FireWallLayer(() => {
            lookups++;
            return atlas;
        });
        const fire = layer.getContainer().children[2];

        layer.update(1, [], 64, toWorld);
        expect(lookups).toBe(0);
        layer.update(0.4, cells, 64, toWorld);
        const root = fire.children[0];
        const flame = root.children.find((child): child is Sprite => child instanceof Sprite)!;
        const initialHeight = Math.abs(flame.scale.y);
        expect(flame.scale.y).toBeLessThan(0); // Artwork rises in the y-up world.

        // A lap's duration belongs to the engine: elapsed wall-clock time never removes the hazard.
        layer.update(60, cells, 64, toWorld);
        expect(fire.children[0]).toBe(root);
        expect(lookups).toBe(1);
        layer.update(1, [{ ...cells[0], l: 1 }], 64, toWorld);
        expect(Math.abs(flame.scale.y)).toBeLessThan(initialHeight);

        layer.update(0.2, [], 64, toWorld);
        expect(root.destroyed).toBe(false);
        // A recast during extinction reuses the cell rather than stacking a second flame group.
        layer.update(0.4, cells, 64, toWorld);
        expect(fire.children).toEqual([root]);
        layer.update(0.7, [], 64, toWorld);
        expect(root.destroyed).toBe(true);
        expect(fire.children).toHaveLength(0);
        layer.update(1, [], 64, toWorld);
        expect(lookups).toBe(1);

        layer.destroy();
        atlas.destroy(true);
    });

    test("keeps a visible fallback while the atlas loads, then replaces it in the same cell", () => {
        const atlas = makeAtlas();
        let ready = false;
        const layer = new FireWallLayer(() => (ready ? atlas : undefined));
        layer.update(0.4, cells, 64, toWorld);
        const root = layer.getContainer().children[2].children[0];
        const fallback = root.children[0];
        expect(fallback.visible).toBe(true);
        expect(root.children.some((child) => child instanceof Sprite)).toBe(false);

        ready = true;
        layer.update(0.1, cells, 64, toWorld);
        expect(fallback.visible).toBe(true);
        expect(root.children.some((child) => child instanceof Sprite && child.alpha > 0)).toBe(true);
        layer.update(0.2, cells, 64, toWorld);
        expect(fallback.visible).toBe(false);
        expect(layer.getContainer().children[2].children[0]).toBe(root);

        layer.destroy();
        atlas.destroy(true);
    });

    test("scene teardown releases frame views without destroying the atlas shared with the braziers", () => {
        const atlas = makeAtlas();
        const layer = new FireWallLayer(() => atlas);
        layer.update(0.4, cells, 64, toWorld);
        const root = layer.getContainer().children[2].children[0];
        const flame = root.children.find((child): child is Sprite => child instanceof Sprite)!;
        const frame = flame.texture;
        expect(frame).not.toBe(atlas);
        expect(frame.source).toBe(atlas.source);

        layer.getContainer().destroy({ children: true });
        expect(frame.destroyed).toBe(true);
        expect(atlas.destroyed).toBe(false);
        expect(atlas.source.destroyed).toBe(false);
        expect(() => layer.destroy()).not.toThrow();
        expect(() => layer.update(1, cells, 64, toWorld)).not.toThrow();
        atlas.destroy(true);
    });
});
