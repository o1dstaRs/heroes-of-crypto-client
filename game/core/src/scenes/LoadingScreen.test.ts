import { describe, expect, spyOn, test } from "bun:test";

import { Assets, ColorMatrixFilter, Texture, TextureSource, Ticker } from "pixi.js";

import { LoadingScreen } from "./LoadingScreen";

type LoadingScreenInternals = {
    unloadedBarFilter: ColorMatrixFilter;
    ownedTextures: Set<Texture>;
    progress: number;
    progressTarget: number;
    progressAnimating: boolean;
    advanceProgress: (ticker: Ticker) => void;
};

const texture = (width: number, height: number): Texture =>
    new Texture({ source: new TextureSource({ width, height }) });

const createScreen = async () => {
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
    try {
        return await LoadingScreen.create(1280, 720);
    } finally {
        load.mockRestore();
    }
};

describe("LoadingScreen resource lifecycle", () => {
    test("destroy recursively stops its animated children and releases owned filters and frame textures", async () => {
        const screen = await createScreen();
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
    });

    test("bursty asset reports redraw once per frame and keep animating after the intro ends", async () => {
        const screen = await createScreen();
        const state = screen as unknown as LoadingScreenInternals;
        const redraw = spyOn(screen, "setProgress");
        const register = spyOn(Ticker.shared, "add");
        try {
            screen.animateProgress(0.1);
            screen.animateProgress(0.4);
            screen.animateProgress(0.9);
            expect(redraw).not.toHaveBeenCalled();
            expect(register).toHaveBeenCalledTimes(1);
            state.advanceProgress({ deltaMS: 1000 / 60 } as Ticker);
            expect(redraw).toHaveBeenCalledTimes(1);
            expect(state.progress).toBeGreaterThan(0);
            expect(state.progress).toBeLessThan(0.9);
            screen.animateProgress(0.2);
            screen.animateProgress(Number.NaN);
            expect(state.progressTarget).toBe(0.9);
            for (let frame = 0; frame < 180; frame++) state.advanceProgress({ deltaMS: 1000 / 60 } as Ticker);
            expect(state.progress).toBe(0.9);
            expect(state.progressAnimating).toBe(false);
            const settledDraws = redraw.mock.calls.length;
            state.advanceProgress({ deltaMS: 16 } as Ticker);
            expect(redraw).toHaveBeenCalledTimes(settledDraws);

            // Later map preparation still advances smoothly, even after a long initial asset load.
            screen.animateProgress(1);
            expect(state.progress).toBe(0.9);
            expect(state.progressAnimating).toBe(true);
            state.advanceProgress({ deltaMS: 16 } as Ticker);
            expect(state.progress).toBeGreaterThan(0.9);
            expect(state.progress).toBeLessThan(1);
        } finally {
            register.mockRestore();
            redraw.mockRestore();
            screen.destroy();
        }
    });

    test("removing the loader cancels its progress callback and cannot schedule another", async () => {
        const screen = await createScreen();
        const state = screen as unknown as LoadingScreenInternals;
        const unregister = spyOn(Ticker.shared, "remove");
        const register = spyOn(Ticker.shared, "add");
        try {
            screen.animateProgress(0.8);
            screen.destroy();
            expect(unregister).toHaveBeenCalledWith(state.advanceProgress, screen);
            expect(state.progressAnimating).toBe(false);
            register.mockClear();
            screen.animateProgress(1);
            expect(register).not.toHaveBeenCalled();
        } finally {
            screen.destroy();
            unregister.mockRestore();
            register.mockRestore();
        }
    });
});
