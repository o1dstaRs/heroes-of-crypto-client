import { describe, expect, spyOn, test } from "bun:test";
import { TexturePool } from "pixi.js";

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
