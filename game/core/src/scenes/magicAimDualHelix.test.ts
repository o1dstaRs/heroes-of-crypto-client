import { describe, expect, test } from "bun:test";
import { Rectangle, Texture, TilingSprite } from "pixi.js";

import { animationAtlases } from "../generated/animation_atlases";
import {
    HoverManager,
    MAGIC_AIM_DUAL_HELIX_FPS,
    MAGIC_AIM_DUAL_HELIX_FRAME_COUNT,
    MAGIC_AIM_DUAL_HELIX_TIME_SCALE,
    magicAimDualHelixFrameIndex,
} from "./HoverManager";

describe("directed magic dual-helix aim atlas", () => {
    test("advances through all frames and wraps without a pause", () => {
        const frameMs = 1000 / MAGIC_AIM_DUAL_HELIX_FPS;

        expect(magicAimDualHelixFrameIndex(0)).toBe(0);
        expect(magicAimDualHelixFrameIndex(frameMs)).toBe(1);
        expect(magicAimDualHelixFrameIndex(frameMs * (MAGIC_AIM_DUAL_HELIX_FRAME_COUNT - 1))).toBe(15);
        expect(magicAimDualHelixFrameIndex(frameMs * MAGIC_AIM_DUAL_HELIX_FRAME_COUNT)).toBe(0);
        expect(magicAimDualHelixFrameIndex(-100)).toBe(0);
    });

    test("keeps runtime slicing in sync with the generated atlas metadata", () => {
        const meta = animationAtlases["Magic Aim Dual Helix"]?.default;

        expect(meta?.frameWidth).toBe(256);
        expect(meta?.frameHeight).toBe(64);
        expect(meta?.frameCount).toBe(MAGIC_AIM_DUAL_HELIX_FRAME_COUNT);
        expect(meta?.fps).toBe(MAGIC_AIM_DUAL_HELIX_FPS);
        expect(meta?.layout).toEqual({ cols: 4, rows: 4 });
    });

    test("advances from the scene update even when the pointer does not move", () => {
        const frames = Array.from(
            { length: MAGIC_AIM_DUAL_HELIX_FRAME_COUNT },
            () => new Texture({ source: Texture.WHITE.source, frame: new Rectangle(0, 0, 1, 1) }),
        );
        const effect = new TilingSprite({ texture: frames[0], width: 256, height: 64 });
        const manager = Object.create(HoverManager.prototype) as HoverManager & Record<string, unknown>;
        Object.assign(manager, {
            hoverGlowPhase: 0,
            magicAimDualHelixElapsedMs: 0,
            magicAimDualHelixFrames: frames,
            magicAimDualHelix: effect,
            updateBoardHoverTween: () => undefined,
            updatePlacementHoverRearm: () => undefined,
        });

        manager.update(1 / (MAGIC_AIM_DUAL_HELIX_FPS * MAGIC_AIM_DUAL_HELIX_TIME_SCALE) + 0.001);

        expect(effect.texture).toBe(frames[1]);
        effect.destroy();
        for (const frame of frames) frame.destroy(false);
    });
});
