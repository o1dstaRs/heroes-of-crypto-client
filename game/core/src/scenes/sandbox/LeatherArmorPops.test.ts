import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import { CommonFlagPops } from "./CommonFlagPops";
import { animationAtlases } from "../../generated/animation_atlases";

test("Leather Armor follows a mirrored flag, restarts at each impact and releases frame views", async () => {
    const meta = animationAtlases["Vfx Leather Armor"].pop;
    const atlas = new Texture({ source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    root.scale.set(-2, -1);
    let now = 0;
    let anchor: { x: number; y: number } | undefined = { x: 100, y: 200 };
    const layer = new CommonFlagPops(
        "leather_armor",
        (container) => root.addChild(container),
        () => now,
    );
    try {
        await layer.spawn("arbalester", anchor, 64, () => anchor);
        const sprite = root.children[0].children[0] as Sprite;
        const firstFrame = sprite.texture;
        now = 300;
        anchor = { x: 160, y: 230 };
        layer.update(0);
        expect(root.children[0].x).toBe(160);
        expect(root.children[0].scale.y).toBe(-2);
        expect(sprite.texture).not.toBe(firstFrame);
        await layer.spawn("arbalester", anchor, 64, () => anchor);
        expect(root.children).toHaveLength(1);
        expect(sprite.texture).toBe(firstFrame);
        now = 949;
        layer.update(0);
        expect(layer.active).toBe(true);
        now = 950;
        layer.update(0);
        expect(layer.active).toBe(false);
        expect(root.children).toHaveLength(0);
        await layer.spawn("arbalester", anchor, 64, () => anchor);
        anchor = undefined;
        layer.update(0);
        expect(layer.active).toBe(false);
        layer.clear();
        expect(firstFrame.destroyed).toBe(true);
        expect(atlas.source.destroyed).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        root.destroy({ children: true });
        load.mockRestore();
        unload.mockRestore();
    }
});

test("a late Leather Armor atlas cannot show a stale impact after the 650ms cue", async () => {
    let resolve!: (texture: Texture) => void;
    const load = spyOn(Assets, "load").mockReturnValue(
        new Promise<Texture>((done) => {
            resolve = done;
        }) as unknown as Promise<Record<string, unknown>>,
    );
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    let now = 0;
    const layer = new CommonFlagPops(
        "leather_armor",
        (container) => root.addChild(container),
        () => now,
    );
    try {
        const pending = layer.spawn("arbalester", { x: 0, y: 0 }, 64);
        now = 700;
        resolve(new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) }));
        await pending;
        expect(root.children).toHaveLength(0);
        expect(layer.active).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        root.destroy({ children: true });
        load.mockRestore();
        unload.mockRestore();
    }
});
