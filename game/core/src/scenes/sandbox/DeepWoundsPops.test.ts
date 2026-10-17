import { describe, expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";
import { isUnitAnimationAtlasKey } from "../../pixi/unitAtlasKeys";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../../pixi/productionImageAssetPolicy";
import { DeepWoundsPops, deepWoundsFrameAt } from "./DeepWoundsPops";

const levels = [1, 2, 3] as const;

describe("painted Deep Wounds flag effects", () => {
    for (const level of levels) {
        test(`${level} cuts play every cel once and expire at exactly 1000ms`, () => {
            const meta = animationAtlases["Vfx Deep Wounds Level"][String(level)];
            expect(meta.frameCount).toBe(16);
            expect(meta.loopDurationMs).toBe(1000);
            expect(meta.pauseMs).toBe(0);
            expect(meta.frameDurationsMs!.reduce((a, b) => a + b, 0)).toBe(1000);
            let elapsed = 0;
            for (const [frame, duration] of meta.frameDurationsMs!.entries()) {
                expect(deepWoundsFrameAt(level, elapsed)).toBe(frame);
                expect(deepWoundsFrameAt(level, elapsed + duration - 0.01)).toBe(frame);
                elapsed += duration;
            }
            expect(deepWoundsFrameAt(level, -1)).toBe(0);
            expect(deepWoundsFrameAt(level, 1000)).toBeUndefined();
            expect(deepWoundsFrameAt(level, 1500)).toBeUndefined();
            const key = `vfx_deep_wounds_level_${level}_atlas`;
            expect(isUnitAnimationAtlasKey(key)).toBe(false);
            expect(isProductionOmittedDisabledUnitAnimationAssetKey(key)).toBe(false);
        });
    }
    test("loads the selected cut count, follows a rebuilt flag, preserves scale, and coalesces a double punch", async () => {
        const atlas = new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) });
        const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        root.scale.set(0.8, -0.5);
        let now = 0;
        let anchor: { x: number; y: number } | undefined = { x: 100, y: 200 };
        const layer = new DeepWoundsPops(
            (container) => root.addChild(container),
            () => now,
        );
        try {
            await Promise.all([
                layer.spawn("victim", 2, anchor, 64, () => anchor),
                layer.spawn("victim", 2, anchor, 64, () => anchor),
            ]);
            expect(load).toHaveBeenCalledTimes(1);
            expect<unknown>(load.mock.calls[0][0]).toBe(images.vfx_deep_wounds_level_2_atlas);
            expect(root.children).toHaveLength(1);
            const container = root.children[0];
            const sprite = container.children[0] as Sprite;
            const scale = { x: sprite.scale.x, y: sprite.scale.y };
            anchor = { x: 150, y: 250 };
            now = 500;
            layer.update(1 / 240);
            expect(container.x).toBe(150);
            expect(container.y).toBe(250);
            expect(sprite.anchor.x).toBe(0.5);
            expect(sprite.anchor.y).toBe(0.5);
            expect(container.scale.y).toBeCloseTo(-1.6);
            expect(sprite.scale.x).toBe(scale.x);
            expect(sprite.scale.y).toBe(scale.y);
            expect(sprite.texture.width).toBe(384);
            expect(sprite.texture.frame.x).toBe((deepWoundsFrameAt(2, 500)! % 4) * 384);
            expect(container.alpha).toBe(1); // The sprite already carries its fade.
            now = 1000;
            layer.update(1 / 240);
            expect(layer.active).toBe(false);
            expect(container.destroyed).toBe(true);
            expect(atlas.destroyed).toBe(false);
            await layer.spawn("victim", 2, anchor, 64, () => anchor);
            expect(layer.active).toBe(true);
            anchor = undefined;
            layer.update(0);
            expect(layer.active).toBe(false);
        } finally {
            layer.clear();
            await Promise.resolve();
            load.mockRestore();
            unload.mockRestore();
        }
    });
    test("scene teardown cancels an in-flight load without resurrecting a flag pop", async () => {
        let resolve!: (texture: Texture) => void;
        const load = spyOn(Assets, "load").mockReturnValue(
            new Promise<Texture>((done) => {
                resolve = done;
            }) as unknown as Promise<Record<string, unknown>>,
        );
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        const layer = new DeepWoundsPops((container) => root.addChild(container));
        try {
            const pending = layer.spawn("victim", 3, { x: 100, y: 200 }, 64);
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
    test("a failed variant load can be retried without dropping other active variants", async () => {
        const atlas = new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) });
        const load = spyOn(Assets, "load")
            .mockResolvedValueOnce(atlas as unknown as Record<string, unknown>)
            .mockRejectedValueOnce(new Error("failed decode"))
            .mockResolvedValueOnce(atlas as unknown as Record<string, unknown>);
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        const layer = new DeepWoundsPops((container) => root.addChild(container));
        try {
            await layer.spawn("a", 1, { x: 100, y: 200 }, 64);
            await layer.spawn("b", 3, { x: 300, y: 200 }, 64);
            expect(root.children).toHaveLength(1);
            await layer.spawn("b", 3, { x: 300, y: 200 }, 64);
            expect(root.children).toHaveLength(2);
        } finally {
            layer.clear();
            await Promise.resolve();
            load.mockRestore();
            unload.mockRestore();
        }
    });
});
