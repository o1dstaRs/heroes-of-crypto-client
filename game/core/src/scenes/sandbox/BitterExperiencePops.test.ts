import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import { animationAtlases } from "../../generated/animation_atlases";
import { CommonFlagPops, commonFlagFrameAt } from "./CommonFlagPops";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../../pixi/imageAssetTiers";

test.each([false, true])(
    "a cold Bitter Experience atlas drops stale cues and retains a newer strike: %s",
    async (thirdStrike) => {
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
            "bitter_experience",
            (container) => root.addChild(container),
            () => now,
        );
        try {
            const pending = layer.spawn("unit", { x: 0, y: 0 }, 64);
            now = 700;
            if (thirdStrike) await layer.spawn("unit", { x: 0, y: 0 }, 64);
            now = 900;
            resolve(new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) }));
            await pending;
            expect(layer.active).toBe(thirdStrike);
            expect(root.children).toHaveLength(thirdStrike ? 1 : 0);
            now = 1500;
            layer.update(0);
            expect(layer.active).toBe(false);
        } finally {
            layer.clear();
            await Promise.resolve();
            root.destroy({ children: true });
            load.mockRestore();
            unload.mockRestore();
        }
    },
);

test("Bitter Experience normalizes 16 authored cels to 650ms and restarts on a third strike without stacking", async () => {
    const multi = animationAtlases["Vfx Bitter Experience"].pop;
    expect(multi.frameCount).toBe(16);
    let elapsed = 0;
    for (const [i, duration] of multi.frameDurationsMs!.entries()) {
        expect(commonFlagFrameAt("bitter_experience", elapsed)).toBe(i);
        elapsed += duration;
    }
    expect(elapsed).toBe(800);
    expect(isLazyCombatEffectAssetKey("vfx_bitter_experience_pop_atlas")).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_bitter_experience_pop_atlas")).toBe(false);
    const atlas = new Texture({ source: new TextureSource({ width: multi.atlasWidth, height: multi.atlasHeight }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    let now = 0;
    const layer = new CommonFlagPops(
        "bitter_experience",
        (container) => root.addChild(container),
        () => now,
    );
    try {
        layer.preload();
        await layer.spawn("unit", { x: 100, y: 200 }, 64);
        const sprite = root.children[0].children[0] as Sprite;
        const first = sprite.texture;
        now = 500;
        layer.update(0);
        expect(sprite.texture).not.toBe(first);
        await layer.spawn("unit", { x: 150, y: 250 }, 64);
        expect(root.children).toHaveLength(1);
        expect(sprite.texture).toBe(first);
        expect(root.children[0].x).toBe(150);
        now = 1149;
        layer.update(0);
        expect(layer.active).toBe(true);
        now = 1150;
        layer.update(0);
        expect(layer.active).toBe(false);
        expect(load).toHaveBeenCalledTimes(1);
    } finally {
        layer.clear();
        await Promise.resolve();
        root.destroy({ children: true });
        load.mockRestore();
        unload.mockRestore();
    }
});
