import { afterAll, beforeAll, expect, test } from "bun:test";
import { Container, DOMAdapter, Sprite, Texture, TextureSource } from "pixi.js";
import { PetrifyingGazePops } from "./PetrifyingGazePops";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

const texture = () => new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) });

test.each([1, -1])(
    "gaze follows the flag, corrects projection and expires on wall time (mirror %s)",
    async (mirror) => {
        const root = new Container();
        root.scale.set(mirror * 0.8, -0.5);
        const art = texture();
        let now = 0,
            anchor: { x: number; y: number } | undefined = { x: 120, y: 300 };
        const layer = new PetrifyingGazePops(
            (c) => root.addChild(c),
            () => now,
            async () => art,
        );
        await layer.spawn("victim", 64, () => anchor);
        expect(layer.active).toBe(true);
        await layer.spawn("victim", 64, () => anchor);
        expect(root.children).toHaveLength(1);
        const pop = root.children[0];
        const sprite = (pop as Container).children[0] as Sprite;
        const firstFrame = sprite.texture;
        expect(firstFrame.frame.width).toBe(384);
        expect(firstFrame.frame.x).toBe(0);
        const scale = sprite.scale.x;
        anchor = { x: 220, y: 410 };
        now = 350 * 0.65;
        layer.update();
        expect(pop.x).toBe(220);
        expect(pop.y).toBeCloseTo(410 + 64 * 0.07);
        expect(pop.scale.y).toBeCloseTo(-1.6);
        expect(sprite.texture.frame.x).toBe(384);
        expect(sprite.texture.frame.y).toBe(384);
        expect(sprite.scale.x).toBe(scale);
        now = 649;
        layer.update();
        expect(sprite.texture.frame.x).toBe(1152);
        expect(sprite.texture.frame.y).toBe(1152);
        expect(pop.alpha).toBeCloseTo(1 / (650 * 0.18));
        now = 650;
        layer.update();
        expect(layer.active).toBe(false);
        expect(pop.destroyed).toBe(true);
        expect(art.destroyed).toBe(false);
        await layer.spawn("victim", 64, () => anchor);
        expect(layer.active).toBe(true);
        anchor = undefined;
        layer.update();
        expect(layer.active).toBe(false);
        layer.clear();
        expect(firstFrame.destroyed).toBe(true);
        expect(art.source.destroyed).toBe(false);
        art.destroy(true);
        root.destroy();
    },
);

test.each(["clear", "late"])("pending gaze never resurrects after %s", async (reason) => {
    const root = new Container();
    const art = texture();
    let now = 0,
        resolve!: (t: Texture) => void;
    const layer = new PetrifyingGazePops(
        (c) => root.addChild(c),
        () => now,
        () =>
            new Promise((done) => {
                resolve = done;
            }),
    );
    const pending = layer.spawn("victim", 64, () => ({ x: 0, y: 0 }));
    if (reason === "clear") layer.clear();
    else now = 1100;
    resolve(art);
    await pending;
    expect(root.children).toHaveLength(0);
    expect(art.destroyed).toBe(false);
    layer.clear();
    root.destroy();
    art.destroy(true);
});
