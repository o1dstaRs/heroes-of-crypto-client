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
    advanceExit: (ticker: Ticker) => void;
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
    // Another file may leave the key present but undefined, so test the value rather than the key.
    if (typeof globalThis.requestAnimationFrame !== "function") {
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
    test("the exit sweeps the bar to 100%, fades the screen out, then resolves; destroy ends it early", async () => {
        const screen = await createScreen();
        const state = screen as unknown as LoadingScreenInternals;
        const register = spyOn(Ticker.shared, "add");
        try {
            screen.animateProgress(0.5);
            for (let frame = 0; frame < 120; frame++) state.advanceProgress({ deltaMS: 1000 / 60 } as Ticker);
            expect(state.progress).toBe(0.5);
            let resolved = false;
            const exit = screen.playExit().then(() => (resolved = true));
            expect(screen.playExit()).toBe(screen.playExit());
            expect(state.progressAnimating).toBe(false);
            // Late progress reports no longer move the bar once the exit owns it.
            screen.animateProgress(0.7);
            expect(state.progressTarget).toBe(0.5);

            const alphas: number[] = [];
            for (let frame = 0; frame < 60 && !resolved; frame++) {
                state.advanceExit({ deltaMS: 1000 / 60 } as Ticker);
                alphas.push(screen.alpha);
                await Promise.resolve();
            }
            await exit;
            expect(state.progress).toBe(1);
            expect(screen.alpha).toBe(0);
            // The bar finishes before the fade begins, and the fade only ever decreases.
            expect(alphas[0]).toBe(1);
            expect(alphas.every((alpha, index) => index === 0 || alpha <= alphas[index - 1])).toBe(true);
            // A stalled frame does not jump the sequence to its end.
            const second = await createScreen();
            const secondState = second as unknown as LoadingScreenInternals;
            const secondExit = second.playExit();
            secondState.advanceExit({ deltaMS: 5000 } as Ticker);
            expect(second.alpha).toBe(1);
            second.destroy();
            await secondExit;
        } finally {
            register.mockRestore();
            screen.destroy();
        }
    });
});
