import { describe, expect, spyOn, test } from "bun:test";
import { TexturePool } from "pixi.js";

import { PixiApp } from "./PixiApp";
import { releaseIdlePixiTextures } from "./releaseIdlePixiTextures";

describe("PixiApp teardown", () => {
    test("releases process-wide filter targets before destroying the renderer", () => {
        const order: string[] = [];
        const pooledTexture = TexturePool.getOptimalTexture(37, 41, 1, false);
        TexturePool.returnTexture(pooledTexture);
        const clearPool = spyOn(pooledTexture, "destroy").mockImplementation(() => {
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
