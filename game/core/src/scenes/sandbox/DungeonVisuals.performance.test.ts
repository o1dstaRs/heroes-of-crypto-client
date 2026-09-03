import { describe, expect, test } from "bun:test";

import { Container, Graphics, Sprite, Texture, type ColorMatrixFilter } from "pixi.js";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";

import { DungeonVisuals } from "./DungeonVisuals";
import { AMBIENT_FIRE_DEFINITIONS, resolveAmbientFireTuning } from "./ambientFireTuning";
import {
    DEFAULT_LAVA_ANIMATION_TUNING,
    resolveLavaAnimationTuning,
    setLavaAnimationEditorActive,
    type LavaAnimationTuning,
} from "./lavaAnimationTuning";
import { resolveMovementAreaTuning } from "../movementAreaTuning";

if (!("document" in globalThis)) {
    (globalThis as { document?: unknown }).document = {
        createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
        querySelector: () => null,
    };
}

describe("dungeon visual allocation", () => {
    test("reuses the static battlefield layout until the viewport changes", () => {
        const gridSettings = new GridSettings(
            GridConstants.GRID_SIZE,
            GridConstants.MAX_Y,
            GridConstants.MIN_Y,
            GridConstants.MAX_X,
            GridConstants.MIN_X,
            GridConstants.MOVEMENT_DELTA,
            GridConstants.UNIT_SIZE_DELTA,
        );
        const viewport = { width: 1000, height: 1000 };
        const visuals = new DungeonVisuals({
            getStage: () => new Container(),
            getWorldRoot: () => new Container(),
            getViewportSize: () => viewport,
            getGridSettings: () => gridSettings,
            texAny: () => Texture.WHITE,
            attachToWorldRoot: () => undefined,
        });
        const internals = visuals as unknown as { backgroundLayout?: object };

        visuals.ensureBackgroundSprite();
        visuals.layoutBackgroundSquare(1);
        const firstLayout = internals.backgroundLayout;
        visuals.layoutBackgroundSquare(1);
        expect(internals.backgroundLayout).toBe(firstLayout);

        viewport.width = 900;
        visuals.layoutBackgroundSquare(1);
        expect(internals.backgroundLayout).not.toBe(firstLayout);
        visuals.destroy();
    });

    test("keeps the filter-free background state stable between render steps", () => {
        const gridSettings = new GridSettings(
            GridConstants.GRID_SIZE,
            GridConstants.MAX_Y,
            GridConstants.MIN_Y,
            GridConstants.MAX_X,
            GridConstants.MIN_X,
            GridConstants.MOVEMENT_DELTA,
            GridConstants.UNIT_SIZE_DELTA,
        );
        const stage = new Container();
        const visuals = new DungeonVisuals({
            getStage: () => stage,
            getWorldRoot: () => new Container(),
            getViewportSize: () => ({ width: 1000, height: 1000 }),
            getGridSettings: () => gridSettings,
            texAny: () => Texture.WHITE,
            attachToWorldRoot: () => undefined,
        });

        visuals.ensureBackgroundSprite();
        const background = stage.children.find((child) => child instanceof Sprite) as Sprite;
        const filters = background.filters;
        visuals.ensureBackgroundSprite();

        expect(background.filters).toBe(filters);
        visuals.destroy();
    });

    test("reuses steady tuning values between render steps", () => {
        expect(resolveLavaAnimationTuning()).toBe(resolveLavaAnimationTuning());
        expect(resolveAmbientFireTuning(AMBIENT_FIRE_DEFINITIONS[0])).toBe(
            resolveAmbientFireTuning(AMBIENT_FIRE_DEFINITIONS[0]),
        );
        expect(resolveMovementAreaTuning()).toBe(resolveMovementAreaTuning());
    });

    test("does not allocate the lava editor outline during normal play", () => {
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
        const internals = visuals as unknown as {
            lavaEditorOutline?: Graphics;
            updateLavaEditorOutline(
                tuning: LavaAnimationTuning,
                centerX: number,
                centerY: number,
                width: number,
                height: number,
            ): void;
        };

        setLavaAnimationEditorActive(false);
        internals.updateLavaEditorOutline(DEFAULT_LAVA_ANIMATION_TUNING, 100, 100, 200, 200);
        expect(internals.lavaEditorOutline).toBeUndefined();
        setLavaAnimationEditorActive(true);
        internals.updateLavaEditorOutline(DEFAULT_LAVA_ANIMATION_TUNING, 100, 100, 200, 200);
        expect(internals.lavaEditorOutline).toBeInstanceOf(Graphics);
        setLavaAnimationEditorActive(false);
        visuals.destroy();
    });

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

    test("redraws the lava-fire mask only when its geometry changes", () => {
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
        const internals = visuals as unknown as {
            lavaFireMask?: Graphics;
            updateLavaFireMask(
                tuning: LavaAnimationTuning,
                gs: GridSettings,
                target: { x: number; y: number },
                cellSize: number,
            ): void;
        };
        const target = { x: 512, y: 512 };
        internals.updateLavaFireMask(DEFAULT_LAVA_ANIMATION_TUNING, gridSettings, target, 64);
        const mask = internals.lavaFireMask!;
        const originalClear = mask.clear;
        let clearCalls = 0;
        mask.clear = () => {
            clearCalls++;
            return originalClear.call(mask);
        };

        internals.updateLavaFireMask(DEFAULT_LAVA_ANIMATION_TUNING, gridSettings, target, 64);
        expect(clearCalls).toBe(0);
        internals.updateLavaFireMask(
            { ...DEFAULT_LAVA_ANIMATION_TUNING, fireMaskWidthCells: 3 },
            gridSettings,
            target,
            64,
        );
        expect(clearCalls).toBe(1);
        visuals.destroy();
    });

    test("retessellates the lava-pit light only when its geometry changes", () => {
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
        const internals = visuals as unknown as {
            lavaPitLight?: Graphics;
            updateLavaPitLight(
                tuning: LavaAnimationTuning,
                corners: ReadonlyArray<{ x: number; y: number }>,
                fireCenter: { x: number; y: number },
            ): void;
        };
        const corners = [
            { x: 0, y: 100 },
            { x: 100, y: 100 },
            { x: 100, y: 0 },
            { x: 0, y: 0 },
        ];
        const center = { x: 50, y: 50 };
        internals.updateLavaPitLight(DEFAULT_LAVA_ANIMATION_TUNING, corners, center);
        const light = internals.lavaPitLight!;
        const originalClear = light.clear;
        let clearCalls = 0;
        light.clear = () => {
            clearCalls++;
            return originalClear.call(light);
        };

        internals.updateLavaPitLight(DEFAULT_LAVA_ANIMATION_TUNING, corners, center);
        expect(clearCalls).toBe(0);
        internals.updateLavaPitLight(DEFAULT_LAVA_ANIMATION_TUNING, corners, { x: 51, y: 50 });
        expect(clearCalls).toBe(1);
        visuals.destroy();
    });
});
