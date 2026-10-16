import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Texture } from "pixi.js";

import { PixiScene } from "./PixiScene";
import type { TextureLoadOptions } from "./boardFirstTextureLoads";
import { images } from "../imageAssets";
import { LAVA_PIT_ASSETS } from "../scenes/sandbox/lavaPitAssets";

const SceneConstructor = PixiScene as unknown as new (settings: object) => {
    textures: Record<string, Texture>;
    pixiApp: unknown;
    texAny(key: string, options?: TextureLoadOptions): Texture | undefined;
    preloadTextureKeys(keys: readonly string[], options?: TextureLoadOptions): Promise<void>;
    Destroy(): void;
};

const fixture = () => {
    const scene = new SceneConstructor({});
    const roots = Array.from({ length: 4 }, () => new Container());
    scene.textures = {};
    scene.pixiApp = {
        getWorldRoot: () => roots[0],
        getCamera: () => roots[1],
        getUIContainer: () => roots[2],
        getCursorOverlayRoot: () => roots[3],
    };
    return {
        scene,
        dispose: () => {
            scene.Destroy();
            roots.forEach((root) => root.destroy());
        },
    };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("map preparation waits for decoding, and evicts an unclaimed firepit texture that arrives after leaving", async () => {
    const { scene, dispose } = fixture();
    let finish!: (texture: Texture) => void;
    const load = spyOn(Assets, "load").mockImplementation(
        (() =>
            new Promise<Texture>((resolve) => {
                finish = resolve;
            })) as typeof Assets.load,
    );
    const unload = spyOn(Assets, "unload").mockResolvedValue(undefined);
    let ready = false;
    try {
        const preparation = scene.preloadTextureKeys([LAVA_PIT_ASSETS.over], { priority: "visible" }).then(() => {
            ready = true;
        });
        await tick();
        expect(load).toHaveBeenCalledTimes(1);
        expect(ready).toBe(false);
        scene.Destroy();
        finish(Texture.WHITE);
        await preparation;
        await tick();
        expect(scene.textures[LAVA_PIT_ASSETS.over]).toBeUndefined();
        expect(unload).toHaveBeenCalledTimes(1);
        expect(unload).toHaveBeenCalledWith(images[LAVA_PIT_ASSETS.over]);
    } finally {
        dispose();
        load.mockRestore();
        unload.mockRestore();
    }
});

test("a replacement scene keeps a shared in-flight firepit atlas until its own teardown", async () => {
    const first = fixture();
    const second = fixture();
    let finish!: (texture: Texture) => void;
    const load = spyOn(Assets, "load").mockImplementation(
        (() =>
            new Promise<Texture>((resolve) => {
                finish = resolve;
            })) as typeof Assets.load,
    );
    const unload = spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
        first.scene.texAny(LAVA_PIT_ASSETS.under, { priority: "visible" });
        second.scene.texAny(LAVA_PIT_ASSETS.under, { priority: "visible" });
        await tick();
        expect(load).toHaveBeenCalledTimes(1);
        first.scene.Destroy();
        finish(Texture.WHITE);
        await tick();
        expect(second.scene.texAny(LAVA_PIT_ASSETS.under)).toBe(Texture.WHITE);
        expect(unload).not.toHaveBeenCalled();
        second.scene.Destroy();
        await tick();
        expect(unload).toHaveBeenCalledTimes(1);
        expect(unload).toHaveBeenCalledWith(images[LAVA_PIT_ASSETS.under]);
    } finally {
        first.dispose();
        second.dispose();
        load.mockRestore();
        unload.mockRestore();
    }
});
