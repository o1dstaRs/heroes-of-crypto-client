import { afterEach, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

const directories: string[] = [];
afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const fixture = () => {
    const root = mkdtempSync(path.join(tmpdir(), "hoc-release-atlas-"));
    directories.push(root);
    for (const folder of ["scripts", "src/generated", "src/build", "src/ui", "src/pixi", "art/output/example/atlas"]) {
        mkdirSync(path.join(root, folder), { recursive: true });
    }
    copyFileSync(
        new URL("../../scripts/generate_animation_atlases.js", import.meta.url),
        path.join(root, "scripts/generate_animation_atlases.js"),
    );
    copyFileSync(new URL("../assetLocations.ts", import.meta.url), path.join(root, "src/assetLocations.ts"));
    copyFileSync(
        new URL("./retiredImageAssets.json", import.meta.url),
        path.join(root, "src/build/retiredImageAssets.json"),
    );
    writeFileSync(path.join(root, "src/ui/sidebarPortraitPages.json"), JSON.stringify({ animations: {} }));
    copyFileSync(
        new URL("../../scripts/install_half_body_atlases.ts", import.meta.url),
        path.join(root, "scripts/install_half_body_atlases.ts"),
    );
    writeFileSync(path.join(root, "src/pixi/halfBodyAtlases.json"), JSON.stringify({ atlases: {} }));
    writeFileSync(path.join(root, "src/pixi/q93Atlases.json"), JSON.stringify({ atlases: {} }));
    const index = path.join(root, "src/generated/animation_atlases.ts");
    const approved = "export const animationAtlases = { Example: { attack: { frameCount: 8, fps: 10 } } };\n";
    writeFileSync(index, approved);
    const atlas = Buffer.from("atlas bytes copied without interpretation");
    const source = path.join(root, "art/output/example/atlas");
    writeFileSync(path.join(source, "example_attack_atlas.webp"), atlas);
    writeFileSync(
        path.join(source, "example_attack_meta.json"),
        JSON.stringify({
            meta: {
                frameWidth: 16,
                frameHeight: 16,
                frameCount: 2,
                layout: { cols: 2, rows: 1 },
                fps: 2,
                totalDurationSec: 1,
            },
        }),
    );
    const run = (args: string[]) =>
        Bun.spawnSync({
            cmd: [process.execPath, path.join(root, "scripts/generate_animation_atlases.js"), ...args],
            env: { ...process.env, HOC_ANIMATIONS_LOC: path.join(root, "art") },
            stdout: "pipe",
            stderr: "pipe",
        });
    return { root, index, approved, atlas, run };
};

test("release copies preserve the published frame cadence while copying new runtime sheets", () => {
    const f = fixture();
    const result = f.run(["--copy-only"]);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(readFileSync(f.index, "utf8")).toBe(f.approved);
    expect(readFileSync(path.join(f.root, "images/example_attack_atlas.webp"))).toEqual(f.atlas);
    writeFileSync(path.join(f.root, "images/example_attack_atlas.webp"), "optimized build copy");
    expect(readFileSync(path.join(f.root, "art/output/example/atlas/example_attack_atlas.webp"))).toEqual(f.atlas);
});

test("explicit authoring regeneration still updates the animation index", () => {
    const f = fixture();
    const result = f.run([]);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(readFileSync(f.index, "utf8")).not.toBe(f.approved);
    expect(readFileSync(f.index, "utf8")).toContain('"frameCount": 2');
});

test("restoring an old animation package cannot copy retired sheets back into runtime images", () => {
    const f = fixture();
    const retired = "fire_pit_high_fire_overlay_48_atlas.webp";
    const source = path.join(f.root, "art/output/example/atlas", retired);
    writeFileSync(source, f.atlas);
    const result = f.run(["--copy-only"]);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(existsSync(path.join(f.root, "images", retired))).toBe(false);
    expect(readFileSync(source)).toEqual(f.atlas);
    expect(readFileSync(path.join(f.root, "images/example_attack_atlas.webp"))).toEqual(f.atlas);
});

test("a release cannot silently replace a missing published index with authoring defaults", () => {
    const f = fixture();
    rmSync(f.index);
    const result = f.run(["--copy-only"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("requires the versioned");
    expect(existsSync(f.index)).toBe(false);
    expect(existsSync(path.join(f.root, "images/example_attack_atlas.webp"))).toBe(false);
});

test("a pinned half-size release copy ships in place of its master, never under its own name", () => {
    const f = fixture();
    const half = Buffer.from("half-size release copy");
    const releasePath = "animations/output/half_body_atlases_v1/example_attack_atlas/atlas/example_attack_atlas.webp";
    const file = path.join(
        f.root,
        "art/output/half_body_atlases_v1/example_attack_atlas/atlas/example_attack_atlas.webp",
    );
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, half);
    const pin = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
    const catalog = (sha256: string) =>
        writeFileSync(
            path.join(f.root, "src/pixi/halfBodyAtlases.json"),
            JSON.stringify({ atlases: { example_attack_atlas: { releasePath, sha256 } } }),
        );
    catalog(pin(half));
    const result = f.run(["--copy-only"]);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(readFileSync(path.join(f.root, "images/example_attack_atlas.webp"))).toEqual(half);
    // The master is untouched and the derived file does not appear as an extra image.
    expect(readFileSync(path.join(f.root, "art/output/example/atlas/example_attack_atlas.webp"))).toEqual(f.atlas);
    // A derived file that no longer matches its pin is refused instead of shipped.
    catalog(pin(Buffer.from("a different revision")));
    const refused = f.run(["--copy-only"]);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr.toString()).toContain("does not match its pinned release copy");
});
