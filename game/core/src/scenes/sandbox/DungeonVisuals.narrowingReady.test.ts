import { expect, test } from "bun:test";
import { Container, Sprite, Texture } from "pixi.js";
import { GridSettings } from "@heroesofcrypto/common";
import { DungeonVisuals } from "./DungeonVisuals";

const backgrounds = [
    "background_stone_tiles_sinister_16x16_first_ring_destroyed_aaa_v3",
    "background_stone_tiles_sinister_16x16_two_rings_destroyed_aaa_v7",
    "background_stone_tiles_sinister_16x16_three_rings_destroyed_aaa_v3",
    "background_stone_tiles_sinister_16x16_four_rings_destroyed_aaa_v7",
    "background_stone_tiles_sinister_16x16_five_rings_destroyed_aaa_v4",
];

test("cached narrowing glow never appears over a painting that is still loading", () => {
    const stage = new Container();
    const worldRoot = new Container();
    const ready = new Map<string, Texture>();
    const visuals = new DungeonVisuals({
        getStage: () => stage,
        getWorldRoot: () => worldRoot,
        getViewportSize: () => ({ width: 1280, height: 720 }),
        getGridSettings: () => new GridSettings(16, 2048, 0, 1024, -1024, 128, 64),
        texAny: (key) => (backgrounds.includes(key) ? ready.get(key) : Texture.WHITE),
        attachToWorldRoot: (object) => {
            worldRoot.addChild(object);
        },
    });
    const state = visuals as unknown as {
        chasmGlowFrames: Map<string, Texture[]>;
        chasmGlowSprite?: Sprite;
        activeChasmGlowAtlasKey?: string;
        backgroundTextureKey?: string;
        bgSprite?: Sprite;
    };
    for (let stage = 1; stage <= 5; stage++) {
        state.chasmGlowFrames.set(`lava_chasm_glow_narrowing_level_${stage}_atlas`, [Texture.WHITE]);
    }
    visuals.ensureBackgroundSprite();
    visuals.layoutBackgroundSquare(1);
    for (let layer = 1; layer <= 5; layer++) {
        const previousKey = state.backgroundTextureKey;
        visuals.setNarrowingLayers(layer);
        visuals.layoutBackgroundSquare(1);
        visuals.updateFireLight(layer * 100);
        expect(state.backgroundTextureKey).not.toBe(backgrounds[layer - 1]);
        expect(state.activeChasmGlowAtlasKey).not.toBe(`lava_chasm_glow_narrowing_level_${layer}_atlas`);
        // Missing paintings fall back to the intact board; no lava glow may cover its cells.
        expect(state.chasmGlowSprite?.visible ?? false).toBe(false);
        expect(previousKey).toBeDefined();
        const painting = new Texture({ source: Texture.WHITE.source });
        ready.set(backgrounds[layer - 1], painting);
        visuals.layoutBackgroundSquare(1);
        visuals.updateFireLight(layer * 100 + 20);
        expect(state.bgSprite?.texture).toBe(painting);
        expect(state.backgroundTextureKey).toBe(backgrounds[layer - 1]);
        expect(state.activeChasmGlowAtlasKey).toBe(`lava_chasm_glow_narrowing_level_${layer}_atlas`);
        expect(state.chasmGlowSprite?.visible).toBe(true);
    }
    visuals.destroy();
});
