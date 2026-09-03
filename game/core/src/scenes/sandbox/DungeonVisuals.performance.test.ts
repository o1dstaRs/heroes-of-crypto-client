import { describe, expect, test } from "bun:test";

import { Container, Sprite, Texture, type ColorMatrixFilter } from "pixi.js";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";

import { DungeonVisuals } from "./DungeonVisuals";
import { DEFAULT_LAVA_ANIMATION_TUNING, type LavaAnimationTuning } from "./lavaAnimationTuning";

if (!("document" in globalThis)) {
    (globalThis as { document?: unknown }).document = {
        createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
        querySelector: () => null,
    };
}

describe("dungeon visual allocation", () => {
    test("retains steady lava filter arrays and matrices between frames", () => {
        const gridSettings = new GridSettings(
            GridConstants.GRID_SIZE,
            GridConstants.MAX_Y,
            GridConstants.MIN_Y,
            GridConstants.MAX_X,
            GridConstants.MIN_X,
            GridConstants.MOVEMENT_DELTA,
            GridConstants.UNIT_SIZE_DELTA,
        );
        const visuals = new DungeonVisuals({
            getStage: () => new Container(),
            getWorldRoot: () => new Container(),
            getViewportSize: () => ({ width: 1000, height: 1000 }),
            getGridSettings: () => gridSettings,
            texAny: () => Texture.WHITE,
            attachToWorldRoot: () => undefined,
        });
        const terrain = new Sprite(Texture.WHITE);
        const internals = visuals as unknown as {
            centerTerrainSprite: Sprite;
            lavaColorFilter?: ColorMatrixFilter;
            applyLavaColorTuning(tuning: LavaAnimationTuning): void;
        };
        internals.centerTerrainSprite = terrain;

        internals.applyLavaColorTuning(DEFAULT_LAVA_ANIMATION_TUNING);
        const filters = terrain.filters;
        const matrix = internals.lavaColorFilter?.matrix;
        internals.applyLavaColorTuning(DEFAULT_LAVA_ANIMATION_TUNING);

        expect(terrain.filters).toBe(filters);
        expect(internals.lavaColorFilter?.matrix).toBe(matrix);
        visuals.destroy();
    });
});
