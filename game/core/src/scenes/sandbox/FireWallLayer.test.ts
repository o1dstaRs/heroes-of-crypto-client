import { describe, expect, test } from "bun:test";
import { Sprite, Texture, TextureSource } from "pixi.js";
import { FireWallLayer } from "./FireWallLayer";

const cells = [{ x: 3, y: 4, l: 3 }];
const toWorld = () => ({ x: 192, y: 256, cellSize: 60 });
const makeMaterials = () => {
    const texture = () => [new Texture({ source: new TextureSource({ width: 64, height: 64 }) })];
    return { flame: texture(), smoke: texture(), glow: texture(), rock: texture() };
};

describe("fire wall rendering lifecycle", () => {
    test("allocates on first fire and retains pooled sprites until the authoritative cell expires", () => {
        let allocations = 0;
        const layer = new FireWallLayer(undefined, () => {
            allocations++;
            return makeMaterials();
        });
        const fire = layer.getContainer();
        layer.update(1, [], 64, toWorld);
        expect(allocations).toBe(0);
        layer.update(0.4, cells, 64, toWorld);
        const root = fire.children[0];
        const sprites = [...root.children];
        expect(sprites.every((sprite) => sprite instanceof Sprite)).toBe(true);
        expect(root.scale.y).toBeLessThan(0);
        layer.update(60, cells, 64, toWorld);
        expect(fire.children[0]).toBe(root);
        expect(root.children).toEqual(sprites);
        layer.update(1, [{ ...cells[0], l: 1 }], 64, toWorld);
        expect(root.children).toEqual(sprites);
        layer.update(0.2, [], 64, toWorld);
        expect(root.destroyed).toBe(false);
        layer.update(0.4, cells, 64, toWorld);
        expect(fire.children).toEqual([root]);
        layer.update(0.7, [], 64, toWorld);
        expect(root.destroyed).toBe(true);
        expect(fire.children).toHaveLength(0);
        expect(allocations).toBe(1);
        layer.destroy();
    });

    test("neighboring cells share materials without sharing particle containers", () => {
        let allocations = 0;
        const layer = new FireWallLayer(undefined, () => {
            allocations++;
            return makeMaterials();
        });
        layer.update(0.4, [...cells, { x: 4, y: 4, l: 3 }], 64, toWorld);
        const [first, second] = layer.getContainer().children;
        expect(first).not.toBe(second);
        expect((first.children[0] as Sprite).texture).toBe((second.children[0] as Sprite).texture);
        layer.update(0.6, cells, 64, toWorld);
        expect(second.destroyed).toBe(true);
        expect(first.destroyed).toBe(false);
        expect((first.children[0] as Sprite).texture.destroyed).toBe(false);
        expect(allocations).toBe(1);
        layer.destroy();
    });

    test("scene teardown releases owned particle textures and tolerates repeated cleanup", () => {
        const materials = makeMaterials();
        const layer = new FireWallLayer(undefined, () => materials);
        layer.update(0.4, cells, 64, toWorld);
        const root = layer.getContainer().children[0];
        layer.getContainer().destroy({ children: true });
        expect(() => layer.destroy()).not.toThrow();
        expect(root.destroyed).toBe(true);
        for (const texture of Object.values(materials).flat()) expect(texture.destroyed).toBe(true);
        expect(() => layer.destroy()).not.toThrow();
        expect(() => layer.update(1, cells, 64, toWorld)).not.toThrow();
        expect(layer.getContainer().children).toHaveLength(0);
    });
});
