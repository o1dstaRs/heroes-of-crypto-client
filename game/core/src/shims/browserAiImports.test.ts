import { expect, test } from "bun:test";
import path from "node:path";

const core = path.resolve(import.meta.dir, "../..");

for (const mode of ["development", "production"] as const) {
    test(`the ${mode} browser can import the shipped A19 search with Vite's Node shims`, () => {
        // Native compiler buffers and imported data-URL modules survive a test VM's teardown.
        // A fresh process per mode releases both before the next browser bundle is compiled.
        const result = Bun.spawnSync({
            cmd: [process.execPath, "--smol", path.join(core, "scripts/verify_browser_ai_imports.ts"), mode],
            cwd: core,
            stdout: "pipe",
            stderr: "pipe",
        });
        expect(result.exitCode, result.stderr.toString()).toBe(0);
        expect(JSON.parse(result.stdout.toString().trim().split("\n").at(-1)!)).toEqual({
            mode,
            exports: ["searchSandboxAiDecision", "searchSandboxPremiumDecision"],
        });
    });
}
