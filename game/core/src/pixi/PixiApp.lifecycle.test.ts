import { describe, expect, spyOn, test } from "bun:test";
import { Application, Ticker, TexturePool, UPDATE_PRIORITY } from "pixi.js";

import { PixiApp } from "./PixiApp";

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
});

describe("PixiApp guarded render", () => {
    test("a throwing render is skipped and logged once instead of killing the ticker loop", () => {
        // The real constructor is async and needs a canvas, so drive installGuardedRender directly
        // with a real Ticker and a stub Application that mirrors TickerPlugin's registration.
        const ticker = new Ticker();
        let renderImpl: () => void = () => {};
        const stubApp = {
            render: () => renderImpl(),
            ticker,
        } as unknown as Application;
        ticker.add(stubApp.render, stubApp, UPDATE_PRIORITY.LOW); // what TickerPlugin does
        const pixiApp = Object.create(PixiApp.prototype) as PixiApp;
        (pixiApp as unknown as { app: Application }).app = stubApp;
        (pixiApp as unknown as { installGuardedRender(): void }).installGuardedRender();

        let renderCalls = 0;
        renderImpl = () => {
            renderCalls += 1;
            throw new TypeError("Cannot read properties of null (reading 'addressModeU')");
        };
        const errors = spyOn(console, "error").mockImplementation(() => {});

        // One ticker pass invokes render exactly once (Pixi's raw registration was replaced), the
        // throw never escapes the update, and it is logged once — not per frame.
        ticker.update();
        expect(renderCalls).toBe(1);
        expect(errors).toHaveBeenCalledTimes(1);
        ticker.update();
        ticker.update();
        expect(renderCalls).toBe(3);
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
});
