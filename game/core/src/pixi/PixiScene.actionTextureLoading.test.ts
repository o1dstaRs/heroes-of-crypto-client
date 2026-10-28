import { expect, mock, spyOn, test } from "bun:test";
import { Assets, Container, ImageSource, Texture } from "pixi.js";
import { PixiScene } from "./PixiScene";
import { images } from "../imageAssets";

const Scene = PixiScene as unknown as new (context: object) => {
    textures: Record<string, Texture>;
    pixiApp: unknown;
    texAny(key: string): Texture | undefined;
    waitForTexture(key: string): Promise<Texture | undefined>;
    Destroy(): void;
};

test("animation and portrait pixels are released only after their last scene leaves", async () => {
    const keys = ["orc_idle_atlas", "portrait_aaa_front_v1_orc"] as const;
    const bitmap = { width: 3072, height: 4608, close: mock(() => undefined) };
    const texture = new Texture({ source: new ImageSource({ resource: bitmap }) });
    texture.source.once("destroy", () => bitmap.close());
    const roots: Container[] = [];
    const create = () => {
        const scene = new Scene({});
        const sceneRoots = Array.from({ length: 4 }, () => new Container());
        roots.push(...sceneRoots);
        scene.textures = Object.fromEntries(keys.map((key) => [key, texture]));
        scene.pixiApp = {
            getWorldRoot: () => sceneRoots[0],
            getCamera: () => sceneRoots[1],
            getUIContainer: () => sceneRoots[2],
            getCursorOverlayRoot: () => sceneRoots[3],
        };
        for (const key of keys) expect(scene.texAny(key)).toBe(texture);
        return scene;
    };
    const first = create();
    const second = create();
    const unload = spyOn(Assets, "unload").mockImplementation(async () => {
        if (!texture.destroyed) texture.destroy(true);
    });
    try {
        first.Destroy();
        await Promise.resolve();
        expect(unload).not.toHaveBeenCalled();
        second.Destroy();
        await Promise.resolve();
        expect(unload).toHaveBeenCalledTimes(2);
        for (const key of keys) expect(unload).toHaveBeenCalledWith(images[key]);
        expect(bitmap.close).toHaveBeenCalledTimes(1);
    } finally {
        first.Destroy();
        second.Destroy();
        roots.forEach((root) => root.destroy());
        if (!texture.destroyed) texture.destroy(true);
        unload.mockRestore();
    }
});

test("a first attack bypasses queued background atlases while their downloads are still pending", async () => {
    const scene = new Scene({});
    const roots = Array.from({ length: 4 }, () => new Container());
    scene.textures = {};
    scene.pixiApp = {
        getWorldRoot: () => roots[0],
        getCamera: () => roots[1],
        getUIContainer: () => roots[2],
        getCursorOverlayRoot: () => roots[3],
    };
    const requests: string[] = [];
    const completions: Array<() => void> = [];
    const load = spyOn(Assets, "load").mockImplementation(((url: string) => {
        requests.push(url);
        return new Promise<Texture>((resolve) => completions.push(() => resolve(Texture.WHITE)));
    }) as typeof Assets.load);
    const unload = spyOn(Assets, "unload").mockResolvedValue(undefined);
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    try {
        scene.texAny("orc_idle_atlas");
        scene.texAny("orc_walk_atlas");
        scene.texAny("orc_attack_atlas");
        await tick();
        expect(requests).toHaveLength(2);
        const attack = scene.waitForTexture("orc_attack_atlas");
        await tick();
        expect(requests).toEqual([images.orc_idle_atlas, images.orc_walk_atlas, images.orc_attack_atlas]);
        completions[2]();
        await attack;
    } finally {
        scene.Destroy();
        for (const complete of completions) complete();
        await tick();
        roots.forEach((root) => root.destroy());
        load.mockRestore();
        unload.mockRestore();
    }
});
