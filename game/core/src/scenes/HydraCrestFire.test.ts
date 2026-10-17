import { expect, test } from "bun:test";
import { Container, Rectangle, Sprite, Texture, TextureSource } from "pixi.js";
import { hydraCrestAnchor, hydraCrestFirePhase } from "./HydraCrestFire";
import { syncHydraCrestFire } from "./HydraCrestFireVisuals";

test("fire follows all walk poses and mirror transforms without resizing the figure", () => {
    const parent = new Container();
    const bodyTexture = new Texture({ source: new TextureSource({ width: 768, height: 768 }) });
    const atlas = new Texture({ source: new TextureSource({ width: 1024, height: 1024 }) });
    const sprite = new Sprite(bodyTexture);
    sprite.anchor.set(0.5, 730 / 768);
    sprite.position.set(120, 240);
    parent.addChild(sprite);
    for (const mirror of [-1, 1]) {
        sprite.scale.set(mirror * 0.4, -0.4);
        for (let frame = 0; frame < 8; frame++) {
            syncHydraCrestFire(sprite, "walk", frame, frame * 73, atlas);
            const layer = parent.children.find((child) => child.label === "hydra-crest-fire")!;
            const flame = layer.children[0] as Sprite;
            const [x, y] = hydraCrestAnchor("walk", frame);
            expect(layer.scale.x).toBe(sprite.scale.x);
            expect(layer.scale.y).toBe(sprite.scale.y);
            expect(flame.x).toBeCloseTo(x - 384);
            expect(flame.y).toBeCloseTo(y - 730);
            expect(sprite.texture).toBe(bodyTexture);
            expect(sprite.width).toBeCloseTo(307.2);
            expect(sprite.anchor.y).toBe(730 / 768);
            expect(flame.texture.frame).toBeInstanceOf(Rectangle);
        }
    }
    const layer = parent.children[1];
    syncHydraCrestFire(sprite, undefined, 0, 900);
    expect(layer.visible).toBe(false);
    syncHydraCrestFire(sprite, "idle", 47, 950, atlas);
    expect(layer.visible).toBe(true);
    sprite.destroy();
    expect(layer.destroyed).toBe(true);
    expect(parent.children).toHaveLength(0);
});

test("fire loop wraps continuously and playful idle retains its measured crest track", () => {
    expect(hydraCrestFirePhase(799)).toEqual({ frame: 15, next: 0, blend: 0.9800000000000004 });
    expect(hydraCrestFirePhase(800)).toEqual({ frame: 0, next: 1, blend: 0 });
    for (let frame = 32; frame < 80; frame++) {
        expect(hydraCrestAnchor("idle", frame)).toEqual(hydraCrestAnchor("idle", frame % 32));
    }
});
