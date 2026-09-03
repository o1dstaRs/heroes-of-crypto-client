import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MAX_FPS } from "../../statics";

describe("battle render loop", () => {
    test("runs gameplay from Pixi's single capped ticker", () => {
        const source = readFileSync(join(import.meta.dir, "MainRuntime.tsx"), "utf8");
        const pixiAppSource = readFileSync(join(import.meta.dir, "../../pixi/PixiApp.ts"), "utf8");

        expect(MAX_FPS).toBe(60);
        expect(source).toContain("manager.getApplication().ticker");
        expect(source).toContain("ticker.add(loop)");
        expect(source).toContain("ticker.remove(loop)");
        expect(source).not.toContain("window.requestAnimationFrame(loop)");
        expect(pixiAppSource).toContain("this.ticker.maxFPS = MAX_FPS");
    });
});
