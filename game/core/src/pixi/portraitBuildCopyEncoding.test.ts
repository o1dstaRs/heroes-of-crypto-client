import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

import {
    hasMatchingPortraitCanvasAndAlpha,
    isLosslessWebP,
    isPortraitBuildCopy,
    optimizePortraitBuildCopies,
} from "../build/portraitBuildCopyEncoding";

const temporaryDirectories: string[] = [];
afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

const fixture = async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "hoc-portrait-encoding-test-")));
    temporaryDirectories.push(root);
    const images = path.join(root, "images");
    const canonical = path.join(root, "canonical");
    await Promise.all([mkdir(images), mkdir(canonical)]);
    return { root, images, canonical };
};

const image = async (lossless = true, width = 64, height = 96, alphaOffset = 0) => {
    const pixels = Buffer.alloc(width * height * 4);
    let random = 123456789;
    for (let pixel = 0; pixel < width * height; pixel++) {
        for (let channel = 0; channel < 3; channel++) {
            random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
            pixels[pixel * 4 + channel] = random >>> 24;
        }
        pixels[pixel * 4 + 3] = (pixel * 29 + alphaOffset) % 256;
    }
    return Buffer.from(
        await sharp(pixels, { raw: { width, height, channels: 4 } })
            .webp({ lossless, quality: 90 })
            .toBuffer(),
    );
};

describe("portrait build-copy encoding", () => {
    it("selects only the two complete approved portrait batches", () => {
        expect(isPortraitBuildCopy("peasant_left_screen_x2.webp")).toBe(true);
        expect(isPortraitBuildCopy("magic_dragon_pick_sandbox_x2.webp")).toBe(true);
        for (const filename of [
            "peasant_left_screen_idle_atlas.webp",
            "peasant_left_screen_x2_v2.webp",
            "peasant_portrait_full.webp",
            "peasant_512.webp",
            "life_portrait_bg_emissive_glow_v1.webp",
        ]) {
            expect(isPortraitBuildCopy(filename)).toBe(false);
        }
    });

    it("distinguishes lossless chunks from lossy alpha WebP and truncated input", async () => {
        const original = await image();
        expect(isLosslessWebP(original)).toBe(true);
        expect(isLosslessWebP(await image(false))).toBe(false);
        expect(isLosslessWebP(original.subarray(0, original.length - 1))).toBe(false);
        expect(isLosslessWebP(Buffer.from("not a WebP"))).toBe(false);
    });

    it("reduces lossless copies while retaining the canvas, every alpha value, and canonical bytes", async () => {
        const { images, canonical } = await fixture();
        const original = await image();
        const lossy = await image(false);
        const filename = "peasant_left_screen_x2.webp";
        const target = path.join(images, filename);
        await Promise.all([
            writeFile(target, original),
            writeFile(path.join(canonical, filename), original),
            writeFile(path.join(images, "berserker_pick_sandbox_x2.webp"), lossy),
            writeFile(path.join(images, "champion_portrait_full.webp"), original),
        ]);
        const result = await optimizePortraitBuildCopies(images, canonical);
        const encoded = await readFile(target);
        expect(result.optimized).toBe(1);
        expect(result.alreadyLossy).toBe(1);
        expect(encoded.length).toBeLessThan(original.length);
        expect(await hasMatchingPortraitCanvasAndAlpha(original, encoded)).toBe(true);
        expect(await readFile(path.join(canonical, filename))).toEqual(original);
        expect(await readFile(path.join(images, "berserker_pick_sandbox_x2.webp"))).toEqual(lossy);
        expect(await readFile(path.join(images, "champion_portrait_full.webp"))).toEqual(original);
        expect(result.bytesBefore - result.bytesAfter).toBe(original.length - encoded.length);

        const firstModified = (await stat(target)).mtimeMs;
        expect((await optimizePortraitBuildCopies(images, canonical)).optimized).toBe(0);
        expect((await stat(target)).mtimeMs).toBe(firstModified);
        expect(await readFile(target)).toEqual(encoded);

        // A fresh copy during build:images reuses the result keyed by the original bytes and encoder recipe.
        await writeFile(target, original);
        const rebuilt = await optimizePortraitBuildCopies(images, canonical);
        expect(rebuilt.optimized).toBe(1);
        expect(rebuilt.cached).toBe(1);
        expect(await readFile(target)).toEqual(encoded);
        expect(await readFile(path.join(canonical, filename))).toEqual(original);
    });

    it("rejects an output with a changed canvas or alpha plane", async () => {
        const original = await image();
        expect(await hasMatchingPortraitCanvasAndAlpha(original, await image(true, 32, 48))).toBe(false);
        expect(await hasMatchingPortraitCanvasAndAlpha(original, await image(true, 64, 96, 1))).toBe(false);
    });

    it("encodes approved active full and thumbnail sources while leaving other cutouts untouched", async () => {
        const { images, canonical } = await fixture();
        const original = await image();
        const lossy = await image(false);
        const approved = new Set(["champion_portrait_full.webp", "pick_l2_legacy_troll_512.webp", "elf_512.webp"]);
        await Promise.all([
            ...[...approved, "unused_portrait_full.webp", "unused_512.webp"].map((filename) =>
                writeFile(path.join(images, filename), filename === "elf_512.webp" ? lossy : original),
            ),
            writeFile(path.join(canonical, "champion_portrait_full.webp"), original),
        ]);
        const result = await optimizePortraitBuildCopies(images, canonical, approved);
        expect(result.optimized).toBe(2);
        expect(result.alreadyLossy).toBe(1);
        for (const filename of ["champion_portrait_full.webp", "pick_l2_legacy_troll_512.webp"]) {
            const encoded = await readFile(path.join(images, filename));
            expect(encoded.length).toBeLessThan(original.length);
            expect(await hasMatchingPortraitCanvasAndAlpha(original, encoded)).toBe(true);
        }
        for (const filename of ["unused_portrait_full.webp", "unused_512.webp"]) {
            expect(await readFile(path.join(images, filename))).toEqual(original);
        }
        expect(await readFile(path.join(images, "elf_512.webp"))).toEqual(lossy);
        expect(await readFile(path.join(canonical, "champion_portrait_full.webp"))).toEqual(original);
    });

    it("keeps a lossless original when lossy encoding would make it larger", async () => {
        const { images, canonical } = await fixture();
        const original = Buffer.from(
            await sharp({ create: { width: 1, height: 1, channels: 4, background: "#ff0080" } })
                .webp({ lossless: true })
                .toBuffer(),
        );
        const target = path.join(images, "peasant_pick_sandbox_x2.webp");
        await writeFile(target, original);
        const result = await optimizePortraitBuildCopies(images, canonical);
        expect(result.notSmaller).toBe(1);
        expect(result.optimized).toBe(0);
        expect(await readFile(target)).toEqual(original);
    });

    it("refuses canonical directories and missing source configuration", async () => {
        const { images, canonical } = await fixture();
        const original = await image();
        const target = path.join(canonical, "peasant_left_screen_x2.webp");
        await writeFile(target, original);
        expect((await optimizePortraitBuildCopies(canonical, canonical)).skippedReason).toContain("canonical");
        expect((await optimizePortraitBuildCopies(images, "")).skippedReason).toContain("HOC_IMAGES_LOC");
        expect(await readFile(target)).toEqual(original);
    });

    it("refuses symlinked directories, ancestor aliases, and canonical files", async () => {
        const { root, images, canonical } = await fixture();
        const filename = "peasant_left_screen_x2.webp";
        const original = await image();
        await writeFile(path.join(canonical, filename), original);
        const directAlias = path.join(root, "alias");
        await symlink(canonical, directAlias, "dir");
        expect((await optimizePortraitBuildCopies(directAlias, canonical)).skippedReason).toContain("ordinary");
        const ancestorAlias = path.join(root, "ancestor");
        await symlink(root, ancestorAlias, "dir");
        expect(
            (await optimizePortraitBuildCopies(path.join(ancestorAlias, "images"), canonical)).skippedReason,
        ).toContain("ordinary");
        await symlink(path.join(canonical, filename), path.join(images, filename));
        const result = await optimizePortraitBuildCopies(images, canonical);
        expect(result.skippedUnsafe).toBe(1);
        expect(result.optimized).toBe(0);
        expect(await readFile(path.join(canonical, filename))).toEqual(original);
    });

    it("does not write a symlinked encoding cache", async () => {
        const { root, images, canonical } = await fixture();
        const original = await image();
        await writeFile(path.join(images, "peasant_pick_sandbox_x2.webp"), original);
        await symlink(canonical, path.join(root, ".cache"), "dir");
        expect((await optimizePortraitBuildCopies(images, canonical)).optimized).toBe(1);
        expect(await Bun.file(path.join(canonical, "peasant_pick_sandbox_x2.webp")).exists()).toBe(false);
    });

    it("keeps CI image stubs without requiring private artwork or the encoder", async () => {
        const { root } = await fixture();
        const scripts = path.join(root, "scripts");
        const generated = path.join(root, "src/generated");
        await Promise.all([mkdir(scripts), mkdir(generated, { recursive: true })]);
        const stub = "/* CI stub */\nexport const images = {};\n";
        await writeFile(path.join(generated, "image_imports.ts"), stub);
        const generator = path.join(scripts, "generate_image_imports.js");
        await writeFile(generator, await readFile(new URL("../../scripts/generate_image_imports.js", import.meta.url)));
        const child = Bun.spawn([process.execPath, generator, "--test"], {
            cwd: root,
            env: { ...process.env, HOC_IMAGES_LOC: "", HOC_ANIMATIONS_LOC: "" },
            stdout: "pipe",
            stderr: "pipe",
        });
        const [exitCode, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
        ]);
        expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
        expect(stdout).toContain("Keeping CI image stubs");
        expect(await readFile(path.join(generated, "image_imports.ts"), "utf8")).toBe(stub);
    });

    it("writes a first-time manifest before the encoder resolves authoritative roster URLs", async () => {
        const { root, images } = await fixture();
        const scripts = path.join(root, "scripts");
        const pixi = path.join(root, "src/pixi");
        const build = path.join(root, "src/build");
        await Promise.all([mkdir(scripts), mkdir(pixi, { recursive: true }), mkdir(build, { recursive: true })]);
        await Promise.all([
            writeFile(path.join(images, "active_portrait_full.webp"), await image()),
            writeFile(
                path.join(scripts, "prepare_level_one_assets.ts"),
                "export const prepareLevelOneAssets = () => {};",
            ),
            writeFile(
                path.join(root, "src/gameImageAssetPolicy.ts"),
                "export const isWebPFile = (file) => file.endsWith('.webp');",
            ),
            writeFile(path.join(pixi, "imageAssetTiers.ts"), "export const isProductionOmittedAssetKey = () => false;"),
            writeFile(
                path.join(pixi, "productionImageAssetPolicy.ts"),
                [
                    "isProductionOmittedDisabledUnitAnimationAssetKey",
                    "isProductionOmittedEnvironmentAssetKey",
                    "isProductionOmittedLegacyUiAssetKey",
                    "isProductionOmittedUnreferencedAssetKey",
                ]
                    .map((name) => `export const ${name} = () => false;`)
                    .join("\n"),
            ),
            writeFile(
                path.join(build, "portraitBuildCopyEncoding.ts"),
                `
                export async function approvedRosterPortraitFilenames() {
                    const { images } = await import("../generated/image_imports");
                    if (!images.active_portrait_full) throw new Error("The new manifest is missing its active roster source");
                    return new Set(["active_portrait_full.webp"]);
                }
                export async function optimizePortraitBuildCopies(directory, canonical, approved) {
                    if (!approved.has("active_portrait_full.webp")) throw new Error("Missing roster allowlist");
                    return { optimized: 0 };
                }
            `,
            ),
        ]);
        const generator = path.join(scripts, "generate_image_imports.js");
        await writeFile(generator, await readFile(new URL("../../scripts/generate_image_imports.js", import.meta.url)));
        const child = Bun.spawn([process.execPath, generator, "--test"], {
            cwd: root,
            env: { ...process.env, NODE_ENV: "test" },
            stdout: "pipe",
            stderr: "pipe",
        });
        const [exitCode, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
        ]);
        expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
        expect(stdout).toContain("Image imports generated successfully");
        expect(await readFile(path.join(root, "src/generated/image_imports.ts"), "utf8")).toContain(
            "active_portrait_full",
        );
    });
});
