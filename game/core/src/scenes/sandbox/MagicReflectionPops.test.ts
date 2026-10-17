import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import { animationAtlases } from "../../generated/animation_atlases";
import { MagicReflectionPops, magicReflectionFrameAt } from "./MagicReflectionPops";

const meta = animationAtlases["Vfx Magic Reflection"].pop;

test("reflection plays all nine painted cels and expires at one second", () => {
    expect(meta.frameCount).toBe(9);
    let elapsed = 0;
    for (const [i, duration] of meta.frameDurationsMs!.entries()) {
        expect(magicReflectionFrameAt(elapsed)).toBe(i);
        expect(magicReflectionFrameAt(elapsed + duration - 0.01)).toBe(i);
        elapsed += duration;
    }
    expect(elapsed).toBe(1000);
    expect(magicReflectionFrameAt(1000)).toBeUndefined();
});

test("reflection coalesces hits, follows a rebuilt flag, keeps artwork scale and cleans up", async () => {
    const atlas = new Texture({ source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    root.scale.set(0.8, -0.5);
    let now = 0;
    let anchor: { x: number; y: number } | undefined = { x: 100, y: 200 };
    const layer = new MagicReflectionPops(
        (container) => root.addChild(container),
        () => now,
    );
    try {
        await Promise.all([layer.spawn("dragon", anchor, 64, () => anchor), layer.spawn("dragon", anchor, 64)]);
        expect(root.children).toHaveLength(1);
        const pop = root.children[0];
        const sprite = pop.children[0] as Sprite;
        const width = sprite.width;
        expect(pop.y).toBeCloseTo(200 + 64 * 0.07);
        expect(sprite.anchor.y).toBe(1);
        const first = sprite.texture;
        anchor = { x: 150, y: 250 };
        now = 500;
        layer.update(1 / 240);
        expect(pop.x).toBe(150);
        expect(pop.y).toBeCloseTo(250 + 64 * 0.07);
        expect(pop.scale.y).toBeCloseTo(-1.6);
        expect(sprite.width).toBe(width);
        expect(sprite.texture).not.toBe(first);
        now = 1000;
        layer.update(1 / 240);
        expect(pop.destroyed).toBe(true);
        expect(layer.active).toBe(false);
        await layer.spawn("dragon", anchor, 64, () => anchor);
        anchor = undefined;
        layer.update(0);
        expect(layer.active).toBe(false);
        expect(atlas.destroyed).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
    }
});

test("scene teardown cancels an unfinished reflection texture load", async () => {
    let resolve!: (texture: Texture) => void;
    const load = spyOn(Assets, "load").mockReturnValue(
        new Promise<Texture>((done) => {
            resolve = done;
        }) as unknown as Promise<Record<string, unknown>>,
    );
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    const layer = new MagicReflectionPops((container) => root.addChild(container));
    try {
        const pending = layer.spawn("dragon", { x: 10, y: 20 }, 64);
        layer.clear();
        resolve(Texture.WHITE);
        await pending;
        expect(root.children).toHaveLength(0);
        expect(layer.active).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
    }
});
