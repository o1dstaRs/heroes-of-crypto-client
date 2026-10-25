import { afterAll, beforeAll, expect, test } from "bun:test";
import { Container, DOMAdapter, Sprite, Texture, TextureSource } from "pixi.js";
import { HealCrossPops, HEAL_CROSS_MAX_POPS, healCrossFrameAt } from "./HealCrossPops";
import { canPreviewCreatureLabState } from "../../ui/creatureAnimationLabCapabilities";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test.each([1, -1])("Heal follows the flag, preserves proportions and expires at 650ms, mirror %s", async (mirror) => {
    const art = new Texture({ source: new TextureSource({ width: 1254, height: 1254 }) });
    const root = new Container();
    root.scale.set(mirror * 0.8, -0.5);
    let now = 0;
    let anchor: { x: number; y: number } | undefined = { x: 80, y: 150 };
    const layer = new HealCrossPops(
        (c) => {
            root.addChild(c);
        },
        () => now,
        async () => art,
    );
    try {
        await layer.spawn("ally", 64, () => anchor);
        await layer.spawn("ally", 64, () => anchor);
        expect(root.children).toHaveLength(1);
        const pop = root.children[0],
            mesh = pop.children[0];
        expect(pop.scale.y).toBeCloseTo(-1.6);
        anchor = { x: 140, y: 210 };
        now = 500;
        layer.update();
        expect(pop.x).toBe(140);
        expect(pop.y).toBeCloseTo(210 + 64 * 0.07);
        expect(layer.active).toBe(true);
        now = 650;
        layer.update();
        expect(layer.active).toBe(false);
        expect(mesh.destroyed).toBe(true);
        expect(art.source.destroyed).toBe(false);
        await layer.spawn("ally", 64, () => anchor);
        anchor = undefined;
        layer.update();
        expect(root.children).toHaveLength(0);
    } finally {
        layer.clear();
        root.destroy({ children: true });
        art.destroy(true);
    }
});

test.each(["clear", "stale"])("pending Heal cannot appear after %s", async (reason) => {
    const root = new Container(),
        art = new Texture({ source: new TextureSource({ width: 1254, height: 1254 }) });
    let now = 0,
        resolve!: (texture: Texture) => void;
    const layer = new HealCrossPops(
        (c) => {
            root.addChild(c);
        },
        () => now,
        () =>
            new Promise((r) => {
                resolve = r;
            }),
    );
    const pending = layer.spawn("ally", 64, () => ({ x: 0, y: 0 }));
    if (reason === "clear") layer.clear();
    else now = 650;
    resolve(art);
    await pending;
    expect(root.children).toHaveLength(0);
    expect(layer.active).toBe(false);
    expect(art.source.destroyed).toBe(false);
    layer.clear();
    root.destroy();
    art.destroy(true);
});

test("bounded concurrent cues and disposal leave the shared atlas source alive", async () => {
    const root = new Container(),
        art = new Texture({ source: new TextureSource({ width: 1254, height: 1254 }) });
    const layer = new HealCrossPops(
        (c) => {
            root.addChild(c);
        },
        () => 0,
        async () => art,
    );
    await Promise.all(Array.from({ length: 40 }, (_, i) => layer.spawn(String(i), 64, () => ({ x: 0, y: 0 }))));
    expect(root.children).toHaveLength(HEAL_CROSS_MAX_POPS);
    layer.clear();
    layer.clear();
    expect(root.children).toHaveLength(0);
    expect(art.source.destroyed).toBe(false);
    root.destroy();
    art.destroy(true);
});

test("painted sequence reaches every cel and releases frame views without releasing the atlas", async () => {
    const art = new Texture({ source: new TextureSource({ width: 640, height: 640 }) });
    const root = new Container();
    let now = 0;
    const layer = new HealCrossPops(
        (container) => root.addChild(container),
        () => now,
        async () => art,
    );
    await layer.spawn("ally", 64, () => ({ x: 0, y: 0 }));
    const sprite = root.children[0].children[0] as Sprite;
    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite.width).toBeCloseTo(64 * 1.305);
    const views = new Set<Texture>();
    for (now = 0; now < 650; now++) {
        layer.update();
        const index = healCrossFrameAt(now)!;
        expect(sprite.texture.frame.x).toBe((index % 4) * 160);
        expect(sprite.texture.frame.y).toBe(Math.floor(index / 4) * 160);
        views.add(sprite.texture);
    }
    expect(views.size).toBe(16);
    expect(healCrossFrameAt(-10)).toBe(0);
    expect(healCrossFrameAt(650)).toBeUndefined();
    layer.clear();
    for (const frame of views) expect(frame.destroyed).toBe(true);
    expect(art.source.destroyed).toBe(false);
    await layer.spawn("next", 64, () => ({ x: 0, y: 0 }));
    expect(layer.active).toBe(true);
    layer.clear();
    root.destroy();
    art.destroy(true);
});

test("lab offers single Heal only to a caster with that spell", () => {
    expect(canPreviewCreatureLabState({ name: "Healer", abilities: [], spells: ["Life:Heal"] }, "single_heal")).toBe(
        true,
    );
    expect(
        canPreviewCreatureLabState({ name: "Healer", abilities: [], spells: ["Life:Mass Heal"] }, "single_heal"),
    ).toBe(false);
});
