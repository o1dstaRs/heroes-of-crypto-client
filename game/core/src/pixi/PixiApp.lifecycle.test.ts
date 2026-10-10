import { describe, expect, spyOn, test } from "bun:test";
import { Application, TexturePool, Ticker, UPDATE_PRIORITY } from "pixi.js";

import { PixiApp } from "./PixiApp";
import { releaseIdlePixiTextures } from "./releaseIdlePixiTextures";

describe("PixiApp teardown", () => {
    test("releases idle filter targets first and empties the pool only once the renderer is gone", () => {
        const order: string[] = [];
        const heldByText = TexturePool.getOptimalTexture(64, 64, 1, false);
        const clearPool = spyOn(TexturePool, "clear").mockImplementation(() => {
            order.push("pool");
        });
        const app = new PixiApp();
        const internals = app as unknown as {
            ticker: { stop(): void };
            app: { renderer: object; destroy(): void };
        };
        internals.ticker = { stop: () => order.push("ticker") };
        internals.app = {
            renderer: {},
            // Tearing a Text down hands its pooled canvas texture back; its bucket has to still be there.
            destroy: () => {
                TexturePool.returnTexture(heldByText);
                order.push("app");
            },
        };

        app.destroy();
        app.destroy();

        expect(order).toEqual(["ticker", "app", "pool"]);
        expect(clearPool).toHaveBeenCalledTimes(1);
        clearPool.mockRestore();
        TexturePool.clear();
    });

    test("resizing releases idle targets while text can return a texture borrowed before cleanup", () => {
        const borrowed = TexturePool.getOptimalTexture(77, 43, 1, false);
        const idle = TexturePool.getOptimalTexture(77, 43, 1, false);
        TexturePool.returnTexture(idle);
        releaseIdlePixiTextures();
        expect(idle.destroyed).toBe(true);
        expect(borrowed.destroyed).toBe(false);
        expect(() => TexturePool.returnTexture(borrowed)).not.toThrow();
        const reused = TexturePool.getOptimalTexture(77, 43, 1, false);
        expect(reused).toBe(borrowed);
        TexturePool.returnTexture(reused);
        releaseIdlePixiTextures();
    });
});

describe("PixiApp guarded render", () => {
    test("a throwing render is skipped and logged once instead of killing the ticker loop", () => {
        // The real constructor is async and needs a canvas, so drive installGuardedRender directly
        // with a real Ticker and a stub Application that mirrors TickerPlugin's registration.
        const ticker = new Ticker();
        let renderImpl: () => void = () => {};
        const filter = { _filterStackIndex: 0, _filterStack: [], _activeFilterData: null };
        const stubApp = {
            render: () => renderImpl(),
            ticker,
            renderer: { filter },
        } as unknown as Application;
        ticker.add(stubApp.render, stubApp, UPDATE_PRIORITY.LOW); // what TickerPlugin does
        const pixiApp = Object.create(PixiApp.prototype) as PixiApp;
        (pixiApp as unknown as { app: Application }).app = stubApp;
        (pixiApp as unknown as { installGuardedRender(): void }).installGuardedRender();

        let renderCalls = 0;
        renderImpl = () => {
            renderCalls += 1;
            filter._filterStackIndex = 1;
            throw new TypeError("Cannot read properties of null (reading 'addressModeU')");
        };
        const errors = spyOn(console, "error").mockImplementation(() => {});

        // One ticker pass invokes render exactly once (Pixi's raw registration was replaced), the
        // throw never escapes the update, and it is logged once — not per frame.
        ticker.update();
        expect(renderCalls).toBe(1);
        expect(filter._filterStackIndex).toBe(0);
        expect(errors).toHaveBeenCalledTimes(1);
        ticker.update();
        ticker.update();
        expect(renderCalls).toBe(3);
        expect(filter._filterStackIndex).toBe(0);
        expect(errors).toHaveBeenCalledTimes(1);

        // ...and rendering resumes the moment the emitter clears.
        renderImpl = () => {
            renderCalls += 1;
        };
        ticker.update();
        expect(renderCalls).toBe(4);
        errors.mockRestore();
        ticker.destroy();
    });

    test("the installed ticker guard clears stale state before drawing and silent leftovers afterward", () => {
        const ticker = new Ticker();
        const filter = { _filterStackIndex: 2, _filterStack: [], _activeFilterData: null };
        const depthsAtDraw: number[] = [];
        const stubApp = {
            render: () => {
                depthsAtDraw.push(filter._filterStackIndex);
                filter._filterStackIndex = 1; // An effect swallowed its error without popping.
            },
            ticker,
            renderer: { filter },
        } as unknown as Application;
        ticker.add(stubApp.render, stubApp, UPDATE_PRIORITY.LOW);
        const pixiApp = Object.create(PixiApp.prototype) as PixiApp;
        (pixiApp as unknown as { app: Application }).app = stubApp;
        (pixiApp as unknown as { installGuardedRender(): void }).installGuardedRender();
        try {
            for (let frame = 0; frame < 10; frame++) {
                ticker.update();
                expect(filter._filterStackIndex).toBe(0);
            }
            expect(depthsAtDraw).toEqual(Array(10).fill(0));
        } finally {
            ticker.destroy();
        }
    });

    test("a texture-pool cleanup error cannot kill the ticker or retain a filter offset", () => {
        const ticker = new Ticker();
        const texture = TexturePool.getOptimalTexture({ width: 64, height: 64 });
        const filter = {
            _filterStackIndex: 0,
            _filterStack: [{ skip: false, inputTexture: texture, backTexture: null }],
            _activeFilterData: null,
        };
        let calls = 0;
        const stubApp = {
            render: () => {
                calls++;
                if (calls === 1) {
                    filter._filterStackIndex = 1;
                    throw new Error("interrupted draw");
                }
                expect(filter._filterStackIndex).toBe(0);
            },
            ticker,
            renderer: { filter, renderTarget: { renderSurface: texture } },
        } as unknown as Application;
        ticker.add(stubApp.render, stubApp, UPDATE_PRIORITY.LOW);
        const pixiApp = Object.create(PixiApp.prototype) as PixiApp;
        (pixiApp as unknown as { app: Application }).app = stubApp;
        (pixiApp as unknown as { installGuardedRender(): void }).installGuardedRender();
        const returnTexture = spyOn(TexturePool, "returnTexture").mockImplementation(() => {
            throw new Error("interrupted texture cleanup");
        });
        const errors = spyOn(console, "error").mockImplementation(() => {});
        try {
            expect(() => ticker.update()).not.toThrow();
            expect(filter._filterStackIndex).toBe(0);
            expect(errors).toHaveBeenCalledTimes(1);
            ticker.update();
            expect(calls).toBe(2);
        } finally {
            returnTexture.mockRestore();
            errors.mockRestore();
            ticker.destroy();
            TexturePool.returnTexture(texture);
            TexturePool.clear();
        }
    });
});
