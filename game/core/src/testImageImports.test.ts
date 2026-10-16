import { expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("core test setup preserves CI image stubs without requiring private art", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "hoc-test-images-"));
    try {
        const scripts = path.join(directory, "scripts");
        const generated = path.join(directory, "src/generated");
        mkdirSync(scripts);
        mkdirSync(generated, { recursive: true });
        const script = path.join(scripts, "generate_image_imports.js");
        copyFileSync(new URL("../scripts/generate_image_imports.js", import.meta.url), script);
        const manifest = "/* CI stub — no private art checkout */\nexport const images = {};\n";
        const catalog = '["ci_asset"]\n';
        writeFileSync(path.join(generated, "image_imports.ts"), manifest);
        writeFileSync(path.join(generated, "image_keys.json"), catalog);

        const result = Bun.spawnSync({
            cmd: [process.execPath, script, "--test"],
            env: { ...process.env, NODE_ENV: "production" },
            stdout: "pipe",
            stderr: "pipe",
        });

        expect(result.exitCode, result.stderr.toString()).toBe(0);
        expect(readFileSync(path.join(generated, "image_imports.ts"), "utf8")).toBe(manifest);
        expect(readFileSync(path.join(generated, "image_keys.json"), "utf8")).toBe(catalog);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
