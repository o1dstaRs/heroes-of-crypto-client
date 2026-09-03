import { describe, expect, spyOn, test } from "bun:test";

import { Assets, ColorMatrixFilter, Texture, TextureSource } from "pixi.js";

import { LoadingScreen } from "./LoadingScreen";

type LoadingScreenInternals = {
    unloadedBarFilter: ColorMatrixFilter;
    ownedTextures: Set<Texture>;
};

const texture = (width: number, height: number): Texture =>
    new Texture({ source: new TextureSource({ width, height }) });

describe("LoadingScreen resource lifecycle", () => {
    test("destroy recursively stops its animated children and releases owned filters and frame textures", async () => {
        if (!("document" in globalThis)) {
            (globalThis as { document?: unknown }).document = {
                createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
                querySelector: () => null,
            };
        }
        if (!("requestAnimationFrame" in globalThis)) {
            (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = () => 1;
            (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = () => undefined;
        }
        const loaded = [
            texture(1672, 941),
            texture(652, 27),
            texture(105, 105),
            texture(1672, 941),
            texture(1024, 384),
            texture(512, 384),
        ];
        let loadIndex = 0;
        const load = spyOn(Assets, "load").mockImplementation(() => Promise.resolve(loaded[loadIndex++]));

        const screen = await LoadingScreen.create(1280, 720);
        const state = screen as unknown as LoadingScreenInternals;
        const ownedTextures = [...state.ownedTextures];
        const filterDestroy = spyOn(state.unloadedBarFilter, "destroy");

        expect(screen.children.length).toBeGreaterThan(0);
        expect(ownedTextures.length).toBeGreaterThan(20);
        screen.destroy();

        expect(screen.destroyed).toBe(true);
        expect(filterDestroy).toHaveBeenCalledTimes(1);
        expect(ownedTextures.every((owned) => owned.destroyed)).toBe(true);

        // The guard makes repeated lifecycle cleanup harmless.
        screen.destroy();
        expect(filterDestroy).toHaveBeenCalledTimes(1);
        load.mockRestore();
    });
});
