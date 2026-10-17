import { expect, spyOn, test } from "bun:test";
import { Assets, Container, MeshPlane, Texture, TextureSource } from "pixi.js";
import { WhirlpoolSprites, WHIRLPOOL_LIFE_MS } from "./WhirlpoolSprites";

const atlasTexture = () => new Texture({ source: new TextureSource({ width: 2048, height: 1536 }) });

test("Whirlpool swaps sprite cels within one projected cell, drains inward, then releases its sprites", async () => {
    const atlas = atlasTexture();
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const root = new Container();
    let now = 0;
    const layer = new WhirlpoolSprites(
        (c, z) => {
            c.zIndex = z;
            root.addChild(c);
        },
        () => now,
    );
    const footprint = { center: { x: 300, y: 400 }, width: 70, height: 42 };
    try {
        await layer.spawn(footprint);
        const cast = root.children[0];
        const sprite = cast.children[0] as MeshPlane;
        footprint.center.x = 900;
        expect(cast.position.x).toBe(300);
        expect(cast.scale.y).toBe(-1);
        expect(cast.zIndex).toBeLessThan(4000);
        expect(cast.alpha).toBe(0);
        now = 200;
        layer.update();
        expect(sprite.scale.x * 256).toBeCloseTo(70);
        expect(sprite.scale.y * 256).toBeCloseTo(42);
        expect(cast.alpha).toBe(1);
        const frame = sprite.texture;
        now = 250;
        layer.update();
        expect(sprite.texture).not.toBe(frame);
        expect(sprite.rotation).toBe(0);
        for (now = 0; now < WHIRLPOOL_LIFE_MS; now += 33) {
            layer.update();
            expect(sprite.width).toBeLessThanOrEqual(70 * 1.05);
            expect(sprite.height).toBeLessThanOrEqual(42 * 1.05);
        }
        now = WHIRLPOOL_LIFE_MS - 100;
        layer.update();
        expect(sprite.width).toBeLessThan(35);
        expect(cast.alpha).toBeLessThan(0.2);
        now = WHIRLPOOL_LIFE_MS;
        layer.update();
        expect(layer.active).toBe(false);
        expect(root.children).toHaveLength(0);
        expect(cast.destroyed).toBe(true);
        expect(atlas.source.destroyed).toBe(false);
    } finally {
        layer.clear();
        load.mockRestore();
    }
});

test("clearing while the atlas loads cancels stale casts; a new cast still loads and clears safely", async () => {
    const atlas = atlasTexture();
    let resolveOld!: (texture: Texture) => void;
    const oldLoad = new Promise<Texture>((resolve) => {
        resolveOld = resolve;
    });
    const load = spyOn(Assets, "load")
        .mockImplementationOnce(() => oldLoad as never)
        .mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const root = new Container();
    const layer = new WhirlpoolSprites((c) => {
        root.addChild(c);
    });
    const footprint = { center: { x: 0, y: 0 }, width: 64, height: 40 };
    try {
        const stale = layer.spawn(footprint);
        expect(layer.active).toBe(true);
        layer.clear();
        await layer.spawn(footprint);
        resolveOld(atlas);
        await stale;
        expect(root.children).toHaveLength(1);
        layer.clear();
        expect(root.children).toHaveLength(0);
        expect(layer.active).toBe(false);
        expect(atlas.source.destroyed).toBe(false);
    } finally {
        layer.clear();
        load.mockRestore();
    }
});

test("invalid footprints never request an atlas", async () => {
    const load = spyOn(Assets, "load");
    const layer = new WhirlpoolSprites(() => undefined);
    try {
        await layer.spawn({ center: { x: NaN, y: 0 }, width: 64, height: 40 });
        await layer.spawn({ center: { x: 0, y: 0 }, width: 0, height: 40 });
        expect(load).not.toHaveBeenCalled();
        expect(layer.active).toBe(false);
    } finally {
        load.mockRestore();
    }
});
