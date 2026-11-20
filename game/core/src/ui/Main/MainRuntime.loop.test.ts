import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MAX_FPS } from "../../statics";

const code = (path: string) =>
    readFileSync(join(import.meta.dir, path), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");

describe("battle render loop", () => {
    // Architectural guard: PixiApp.init needs a WebGL canvas and MainRuntime is a React effect, so the
    // "one capped loop" rule has no headless behavioral seam.
    test("runs gameplay from Pixi's single capped ticker", () => {
        const runtime = code("MainRuntime.tsx");

        expect(MAX_FPS).toBe(60);
        expect(runtime).toContain("ticker.add(loop)");
        expect(runtime).toContain("ticker.remove(loop)");
        // A second browser loop beside Pixi's would run the simulation twice per frame.
        expect(runtime).not.toMatch(/requestAnimationFrame\(|setInterval\(/);
        expect(code("../../pixi/PixiApp.ts")).toContain("this.ticker.maxFPS = MAX_FPS");
    });
});
