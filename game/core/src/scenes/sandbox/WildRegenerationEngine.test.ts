import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { Assets, Container, DOMAdapter, Mesh, Texture, TextureSource } from "pixi.js";
import { REGENERATION_ENGINE_MAX_POPS, WildRegenerationEngine } from "./WildRegenerationEngine";
import { CommonFlagPops } from "./CommonFlagPops";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test.each([1, -1])("engine variant follows flag and expires with mirrored camera %s", async (mirror) => {
    const art = new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) });
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    root.scale.set(mirror * 0.8, -0.5);
    let now = 0,
        anchor: { x: number; y: number } | undefined = { x: 80, y: 150 };
    const layer = new WildRegenerationEngine(
        (c) => {
            root.addChild(c);
        },
        () => now,
        async () => art,
    );
    try {
        await layer.spawn("troll", 64, () => anchor);
        await layer.spawn("troll", 64, () => anchor);
        expect(root.children).toHaveLength(1);
        const mesh = root.children[0].children[0];
        const geometry = (mesh as Mesh).geometry;
        const positions = geometry.getBuffer("aPosition").data;
        expect(root.children[0].scale.y).toBeCloseTo(-1.6);
        anchor.x = 140;
        now = 540;
        layer.update();
        expect(root.children[0].x).toBe(140);
        expect((mesh as Mesh).geometry).toBe(geometry);
        expect(geometry.getBuffer("aPosition").data).toBe(positions);
        now = 650;
        layer.update();
        expect(layer.active).toBe(false);
        expect(mesh.destroyed).toBe(true);
        expect(art.source.destroyed).toBe(false);
        now = 1000;
        await layer.spawn("troll", 64, () => anchor);
        anchor = undefined;
        layer.update();
        expect(root.children).toHaveLength(0);
    } finally {
        layer.clear();
        await Promise.resolve();
        unload.mockRestore();
        art.destroy(true);
        root.destroy({ children: true });
    }
});
test("pending loads obey the shared effect ceiling and cancelled generations cannot attach", async () => {
    const root = new Container();
    const art = new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) });
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const resolvers: Array<(texture: Texture) => void> = [];
    const layer = new WildRegenerationEngine(
        (container) => {
            root.addChild(container);
        },
        () => 0,
        () =>
            new Promise((resolve) => {
                resolvers.push(resolve);
            }),
    );
    try {
        const pending = Array.from({ length: REGENERATION_ENGINE_MAX_POPS + 4 }, (_, index) =>
            layer.spawn(String(index), 64, () => ({ x: index * 64, y: 100 })),
        );
        expect(resolvers).toHaveLength(REGENERATION_ENGINE_MAX_POPS);
        layer.clear();
        for (const resolve of resolvers) resolve(art);
        await Promise.all(pending);
        expect(root.children).toHaveLength(0);
        expect(layer.active).toBe(false);
        expect(art.source.destroyed).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        unload.mockRestore();
        root.destroy({ children: true });
        art.destroy(true);
    }
});
test("late loads cannot resurrect a cleared effect", async () => {
    const root = new Container();
    const art = new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) });
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    let resolve!: (t: Texture) => void;
    const layer = new WildRegenerationEngine(
        (c) => {
            root.addChild(c);
        },
        () => 0,
        () =>
            new Promise((r) => {
                resolve = r;
            }),
    );
    try {
        const pending = layer.spawn("troll", 64, () => ({ x: 0, y: 0 }));
        layer.clear();
        resolve(art);
        await pending;
        expect(root.children).toHaveLength(0);
        expect(layer.active).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        unload.mockRestore();
        art.destroy(true);
        root.destroy({ children: true });
    }
});
test("sprite disposal cannot unload a texture used by the engine variant", async () => {
    const root = new Container(),
        art = new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) });
    const load = spyOn(Assets, "load").mockResolvedValue(art as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const sprite = new CommonFlagPops(
        "wild_regeneration",
        (c) => {
            root.addChild(c);
        },
        () => 0,
    );
    const engine = new WildRegenerationEngine(
        (c) => {
            root.addChild(c);
        },
        () => 0,
        async () => art,
    );
    try {
        await sprite.spawn("troll", { x: 0, y: 0 }, 64);
        await engine.spawn("troll", 64, () => ({ x: 0, y: 0 }));
        sprite.clear();
        await Promise.resolve();
        expect(unload).not.toHaveBeenCalled();
        engine.clear();
        await Promise.resolve();
        expect(unload).toHaveBeenCalledTimes(1);
    } finally {
        sprite.clear();
        engine.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
        root.destroy({ children: true });
        art.destroy(true);
    }
});
