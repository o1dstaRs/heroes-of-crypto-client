import { describe, expect, spyOn, test } from "bun:test";
import { TexturePool } from "pixi.js";

import { PixiApp } from "./PixiApp";

describe("PixiApp teardown", () => {
    test("releases process-wide filter targets before destroying the renderer", () => {
        const order: string[] = [];
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
            destroy: () => order.push("app"),
        };

        app.destroy();
        app.destroy();

        expect(order).toEqual(["ticker", "pool", "app"]);
        expect(clearPool).toHaveBeenCalledTimes(1);
        clearPool.mockRestore();
    });
});
