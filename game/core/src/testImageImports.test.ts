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

test("CI image stubs preserve fallback behavior while excluding retired assets from old catalogs", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "hoc-ci-images-"));
    try {
        for (const folder of ["scripts", "src/generated", "src/animations", "src/pixi", "src/build"]) {
            mkdirSync(path.join(directory, folder), { recursive: true });
        }
        const script = path.join(directory, "scripts/generate_ci_stubs.js");
        copyFileSync(new URL("../scripts/generate_ci_stubs.js", import.meta.url), script);
        copyFileSync(
            new URL("./build/retiredImageAssets.json", import.meta.url),
            path.join(directory, "src/build/retiredImageAssets.json"),
        );
        for (const file of [
            "src/animations/battlefieldEnvironmentAssets.json",
            "src/animations/levelOneAssets.json",
            "src/pixi/shotTrajectoryAssets.json",
        ]) {
            writeFileSync(path.join(directory, file), "[]");
        }
        writeFileSync(
            path.join(directory, "src/pixi/battlefieldTextureKeys.ts"),
            "export const FINAL_STATIC_BATTLEFIELD_TEXTURES = {};",
        );
        writeFileSync(
            path.join(directory, "src/pixi/creaturePortraitAssetKeys.ts"),
            "export const CREATURE_PORTRAIT_ASSET_KEYS = [];",
        );
        for (const file of ["src/pixi/imageAssetTiers.ts", "src/pixi/unitAtlasKeys.ts"]) {
            writeFileSync(path.join(directory, file), "");
        }
        writeFileSync(
            path.join(directory, "src/generated/image_keys.json"),
            JSON.stringify(["dryad_idle_atlas_quarter", "dryad_painted_idle_atlas", "artifact_t1_runed_staff_256"]),
        );
        writeFileSync(
            path.join(directory, "animation-release.json"),
            JSON.stringify({ files: { "dryad_painted_idle_atlas.webp": { sha256: "a".repeat(64) } } }),
        );
        const generated = Bun.spawnSync({ cmd: [process.execPath, script], stdout: "pipe", stderr: "pipe" });
        expect(generated.exitCode, generated.stderr.toString()).toBe(0);

        const probe = path.join(directory, "probe.ts");
        writeFileSync(
            probe,
            `import { images } from "./src/generated/image_imports";
const legacy = images.dryad_idle_atlas_quarter;
delete images.dryad_idle_atlas_quarter;
const removed = { value: typeof images.dryad_idle_atlas_quarter, present: "dryad_idle_atlas_quarter" in images, listed: Object.keys(images).includes("dryad_idle_atlas_quarter") };
images.dryad_idle_atlas_quarter = legacy;
console.log(JSON.stringify({ missing: typeof images.nonexistent_fixture_asset, retired: typeof images.artifact_t1_runed_staff_256, removed, restored: images.dryad_idle_atlas_quarter === legacy, approved: images.dryad_painted_idle_atlas }));`,
        );
        const result = Bun.spawnSync({ cmd: [process.execPath, probe], stdout: "pipe", stderr: "pipe" });
        expect(result.exitCode, result.stderr.toString()).toBe(0);
        const report = JSON.parse(result.stdout.toString());
        expect(report.missing).toBe("undefined");
        expect(report.retired).toBe("undefined");
        expect(report.removed).toEqual({ value: "undefined", present: false, listed: false });
        expect(report.restored).toBe(true);
        const approved = new URL(report.approved);
        expect(path.basename(approved.pathname)).toBe("dryad_painted_idle_atlas.webp");
        expect(approved.searchParams.get("v")).toBe("a".repeat(16));
        expect(approved.hash).toBe("#ci-stub");
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
