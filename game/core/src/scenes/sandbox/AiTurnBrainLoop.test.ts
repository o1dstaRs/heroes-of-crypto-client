import { describe, expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";

import { animationAtlases } from "../../generated/animation_atlases";
import { isUnitAnimationAtlasKey } from "../../pixi/unitAtlasKeys";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../../pixi/productionImageAssetPolicy";
import { AiTurnBrainLoop, aiTurnBrainFrameAt } from "./AiTurnBrainLoop";

describe("AI turn brain sprite loop", () => {
    test("uses authored timing with no pause and wraps forever as a production VFX", () => {
        const meta = animationAtlases["Vfx Ai Turn Brain"].loop;
        expect(meta.frameCount).toBe(8);
        expect(meta.loopDurationMs).toBeCloseTo(1200 / 1.66, 8);
        expect(meta.pauseMs).toBe(0);
        let cursor = 0;
        for (let frame = 0; frame < 8; frame++) {
            const duration = meta.frameDurationsMs![frame];
            expect(duration).toBeCloseTo(150 / 1.66, 8);
            expect(aiTurnBrainFrameAt(cursor + 0.001)).toBe(frame);
            expect(aiTurnBrainFrameAt(cursor + duration - 0.001)).toBe(frame);
            expect(aiTurnBrainFrameAt(meta.loopDurationMs! * 100 + cursor + 0.001)).toBe(frame);
            cursor += duration;
        }
        expect(aiTurnBrainFrameAt(-1)).toBe(0);
        expect(aiTurnBrainFrameAt(cursor)).toBe(0);
        expect(isUnitAnimationAtlasKey("vfx_ai_turn_brain_loop_atlas")).toBe(false);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey("vfx_ai_turn_brain_loop_atlas")).toBe(false);
    });

    test("keeps phase during ticks and hydration, follows movement, and removes immediately at handoff", async () => {
        const atlas = new Texture({ source: new TextureSource({ width: 1536, height: 768 }) });
        const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        root.scale.set(0.8, -0.5);
        let now = 0;
        let anchor: { x: number; y: number } | undefined = { x: 100, y: 200 };
        const loop = new AiTurnBrainLoop(
            (node) => root.addChild(node),
            () => now,
        );
        const target = { unitId: "boar", cellSize: 64, follow: () => anchor };
        try {
            await loop.setTarget(target);
            const node = root.children[0];
            const sprite = node.children[0] as Sprite;
            const scale = sprite.scale.x;
            expect(sprite.width).toBeCloseTo(64 * 1.45 * 0.9 * 0.83);
            expect(sprite.anchor.y).toBe(0.82);
            now = 375 / 1.66;
            // A hydrated object supplies a fresh follow callback but the activation must not restart.
            anchor = { x: 250, y: 300 };
            await loop.setTarget({ ...target, follow: () => anchor });
            loop.update();
            expect(root.children).toHaveLength(1);
            expect(sprite.texture.frame.x).toBe(768);
            expect(node.x).toBe(250);
            expect(node.y).toBeCloseTo(300 + 64 * 0.07);
            expect(node.scale.y).toBeCloseTo(-1.6);
            expect(sprite.scale.x).toBe(scale);
            now = animationAtlases["Vfx Ai Turn Brain"].loop.loopDurationMs! * 100 + 1;
            loop.update();
            expect(loop.active).toBe(true);
            expect(sprite.texture.frame.x).toBe(0);
            await loop.setTarget({ ...target, unitId: "berserker" });
            expect(node.destroyed).toBe(true);
            expect(root.children).toHaveLength(1);
            expect(load).toHaveBeenCalledTimes(1);
            await loop.setTarget();
            expect(root.children).toHaveLength(0);
            await loop.setTarget(target);
            anchor = undefined;
            loop.update();
            expect(loop.active).toBe(false);
        } finally {
            loop.clear();
            await Promise.resolve();
            load.mockRestore();
            unload.mockRestore();
        }
    });

    test("an atlas finishing after the turn ends cannot resurrect the indicator; failed loads retry", async () => {
        let resolve!: (texture: Texture) => void;
        const load = spyOn(Assets, "load").mockReturnValue(
            new Promise<Texture>((done) => {
                resolve = done;
            }) as unknown as Promise<Record<string, unknown>>,
        );
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        const loop = new AiTurnBrainLoop((node) => root.addChild(node));
        const target = { unitId: "boar", cellSize: 64, follow: () => ({ x: 0, y: 0 }) };
        try {
            const pending = loop.setTarget(target);
            await loop.setTarget();
            resolve(Texture.WHITE);
            await pending;
            expect(root.children).toHaveLength(0);
            loop.clear();
            load.mockRejectedValueOnce(new Error("decode failed"));
            await loop.setTarget(target);
            expect(loop.active).toBe(false);
            load.mockResolvedValue(Texture.WHITE as unknown as Record<string, unknown>);
            await loop.setTarget(target);
            expect(loop.active).toBe(true);
            loop.clear();
            expect(root.children).toHaveLength(0);
        } finally {
            loop.clear();
            await Promise.resolve();
            load.mockRestore();
            unload.mockRestore();
        }
    });
});
