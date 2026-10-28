import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Texture } from "pixi.js";
import { PixiScene } from "./PixiScene";
import { images } from "../imageAssets";

const Scene = PixiScene as unknown as new (context: object) => {
    textures: Record<string, Texture>;
    pixiApp: unknown;
    texAny(key: string): Texture | undefined;
    waitForTexture(key: string): Promise<Texture | undefined>;
    Destroy(): void;
};

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
