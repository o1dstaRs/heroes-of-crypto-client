#!/usr/bin/env bun

import { readdir, rm, unlink } from "fs/promises";
import { resolve, join, extname, basename } from "path";
import { PNG } from "pngjs";

const BIG_UNITS = ["angel", "tsar_cannon", "gargantuan", "pegasus", "black_dragon", "hydra", "thunderbird", "behemoth"];

async function loadPng(path) {
    const buf = await Bun.file(path).arrayBuffer();
    return PNG.sync.read(Buffer.from(buf));
}

async function generateWebp(pngPath, webpPath, { quality, lossless, scaleFactor }) {
    const ffmpegPath = Bun.which ? Bun.which("ffmpeg") : null;
    if (!ffmpegPath) {
        console.warn(
            "⚠️ ffmpeg not found in PATH – skipping WebP generation. Install it (e.g. `brew install ffmpeg`).",
        );
        return;
    }

    const args = ["-y", "-i", pngPath];

    if (scaleFactor && scaleFactor !== 1) {
        // scale down by factor (2 => half, 4 => quarter)
        args.push("-vf", `scale=iw/${scaleFactor}:ih/${scaleFactor}`);
    }

    if (lossless) {
        // lossless WebP
        args.push("-c:v", "libwebp", "-lossless", "1");
    } else {
        // lossy WebP with quality
        args.push("-c:v", "libwebp", "-q:v", String(quality));
    }

    args.push(webpPath);

    console.log("Generating WebP with ffmpeg:", [ffmpegPath.toString(), ...args].join(" "));

    const proc = Bun.spawn([ffmpegPath.toString(), ...args], {
        stdout: "inherit",
        stderr: "inherit",
    });

    const code = await proc.exited;
    if (code !== 0) {
        console.error(`❌ ffmpeg WebP generation failed with code ${code}`);
    } else {
        console.log(`✅ WebP atlas: ${webpPath}`);
    }
}

async function buildAtlas(inputDir, outPng, outJson, fps, maxWidth, webpOptions, opts = {}) {
    const { generateHalfWebp = false, cleanup = false } = opts;

    const files = await readdir(inputDir);
    const pngFiles = files.filter((f) => extname(f).toLowerCase() === ".png").sort();

    if (pngFiles.length === 0) {
        console.error("No .png files found in input directory");
        process.exit(1);
    }

    // Load all frames (they should all be same size)
    const frames = [];
    for (const f of pngFiles) {
        const full = join(inputDir, f);
        const png = await loadPng(full);
        frames.push({ name: f, png });
    }

    const frameCount = frames.length;
    const frameWidth = frames[0].png.width;
    const frameHeight = frames[0].png.height;

    // Compute atlas grid
    const maxCols = Math.max(1, Math.floor(maxWidth / frameWidth) || 1);
    const cols = Math.min(frameCount, maxCols);
    const rows = Math.ceil(frameCount / cols);

    const atlasWidth = cols * frameWidth;
    const atlasHeight = rows * frameHeight;

    console.log(`Building atlas: ${frameCount} frames, ${cols}x${rows} grid ⇒ ${atlasWidth}x${atlasHeight}`);

    const atlas = new PNG({ width: atlasWidth, height: atlasHeight });

    // Copy each frame into atlas
    frames.forEach(({ png }, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const dstX = col * frameWidth;
        const dstY = row * frameHeight;

        for (let y = 0; y < frameHeight; y++) {
            for (let x = 0; x < frameWidth; x++) {
                const srcIdx = (png.width * y + x) * 4;
                const dstIdx = (atlas.width * (dstY + y) + (dstX + x)) * 4;

                atlas.data[dstIdx] = png.data[srcIdx];
                atlas.data[dstIdx + 1] = png.data[srcIdx + 1];
                atlas.data[dstIdx + 2] = png.data[srcIdx + 2];
                atlas.data[dstIdx + 3] = png.data[srcIdx + 3];
            }
        }
    });

    const atlasBuf = PNG.sync.write(atlas);
    await Bun.write(outPng, atlasBuf);
    console.log(`✅ Atlas PNG: ${outPng}`);

    // Generate WebP variants alongside PNG
    if (webpOptions.enabled) {
        const baseWebp = outPng.replace(/\.[^.]+$/, ".webp");

        // Original-size WebP
        await generateWebp(outPng, baseWebp, {
            quality: webpOptions.quality,
            lossless: webpOptions.lossless,
            scaleFactor: 1,
        });

        // Half-size WebP (only if requested, e.g. for big units)
        if (generateHalfWebp) {
            const halfWebp = baseWebp.replace(/\.webp$/, "_half.webp");
            await generateWebp(outPng, halfWebp, {
                quality: webpOptions.quality,
                lossless: webpOptions.lossless,
                scaleFactor: 2,
            });
        }

        // Quarter-size WebP (always)
        const quarterWebp = baseWebp.replace(/\.webp$/, "_quarter.webp");
        await generateWebp(outPng, quarterWebp, {
            quality: webpOptions.quality,
            lossless: webpOptions.lossless,
            scaleFactor: 4,
        });

        // Delete the PNG atlas once WebPs are generated
        try {
            await unlink(outPng);
            console.log(`🗑️ Deleted atlas PNG after WebP generation: ${outPng}`);
        } catch (err) {
            console.warn(`⚠️ Failed to delete atlas PNG ${outPng}:`, err);
        }
    }

    const frameDurationSec = fps > 0 ? 1 / fps : null;
    const totalDurationSec = fps > 0 ? frameCount / fps : null;

    const framesMeta = frames.map(({ name }, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = col * frameWidth;
        const y = row * frameHeight;

        return {
            name,
            index,
            x,
            y,
            w: frameWidth,
            h: frameHeight,
            tStart: frameDurationSec != null ? index * frameDurationSec : null,
            tEnd: frameDurationSec != null ? (index + 1) * frameDurationSec : null,
        };
    });

    const json = {
        meta: {
            frameWidth,
            frameHeight,
            atlasWidth,
            atlasHeight,
            frameCount,
            fps,
            frameDurationSec,
            totalDurationSec,
            layout: { cols, rows },
        },
        frames: framesMeta,
    };

    await Bun.write(outJson, JSON.stringify(json, null, 2));
    console.log(`✅ Timemap JSON: ${outJson}`);

    // --- Optional cleanup of original PNG frames directory ---
    if (cleanup) {
        console.log("🧹 Cleanup enabled – removing input directory with frames...");

        try {
            // We know pngFiles.length > 0 here, so this directory definitely had frames.
            await rm(inputDir, { recursive: true, force: true });
            console.log(`🗑️ Deleted input directory: ${inputDir}`);
        } catch (err) {
            console.warn(`⚠️ Failed to delete input directory ${inputDir}:`, err);
        }
    }
}

// ---- CLI ----

function parseArgs() {
    const args = Bun.argv.slice(2);
    if (args.length < 3) {
        console.error(
            "Usage: bun frames_to_atlas.js <input_dir> <out_atlas.png> <out_meta.json> [--fps 12] [--max-width 4096] [--no-webp] [--webp-quality 85] [--webp-lossless] [--cleanup]",
        );
        process.exit(1);
    }

    const inputDir = resolve(args[0]);
    const outPng = resolve(args[1]);
    const outJson = resolve(args[2]);

    let fps = 0; // 0 = no timing, just indices
    let maxWidth = 4096;

    let webpEnabled = true;
    let webpQuality = 85; // good default for web
    let webpLossless = false;
    let cleanup = false;

    for (let i = 3; i < args.length; i++) {
        const a = args[i];
        if (a === "--fps" && args[i + 1]) {
            fps = Number(args[++i]);
        } else if (a === "--max-width" && args[i + 1]) {
            maxWidth = Number(args[++i]);
        } else if (a === "--no-webp") {
            webpEnabled = false;
        } else if (a === "--webp-quality" && args[i + 1]) {
            webpQuality = Number(args[++i]);
        } else if (a === "--webp-lossless") {
            webpLossless = true;
        } else if (a === "--cleanup") {
            cleanup = true;
        }
    }

    if (Number.isNaN(fps) || fps < 0) fps = 0;
    if (Number.isNaN(maxWidth) || maxWidth <= 0) maxWidth = 4096;
    if (Number.isNaN(webpQuality) || webpQuality <= 0 || webpQuality > 100) {
        webpQuality = 85;
    }

    return {
        inputDir,
        outPng,
        outJson,
        fps,
        maxWidth,
        webpOptions: {
            enabled: webpEnabled,
            quality: webpQuality,
            lossless: webpLossless,
        },
        cleanup,
    };
}

// Derive unit name from something like "angel_default_atlas.png" → "angel"
function getUnitNameFromOutPng(outPng) {
    const base = basename(outPng, extname(outPng)); // e.g. "angel_default_atlas"
    const withoutAtlas = base.replace(/_atlas$/, ""); // "angel_default"
    const parts = withoutAtlas.split("_");
    if (parts.length < 2) return null;
    // everything except the last part (state) is the unit base
    return parts.slice(0, -1).join("_"); // "angel"
}

async function main() {
    const { inputDir, outPng, outJson, fps, maxWidth, webpOptions, cleanup } = parseArgs();

    const unitName = getUnitNameFromOutPng(outPng);
    const generateHalfWebp = BIG_UNITS.includes(unitName);

    console.log(`Unit name inferred from output: ${unitName ?? "unknown"}`);
    if (generateHalfWebp) {
        console.log("✅ Will generate _half and _quarter WebP atlases for this unit.");
    } else {
        console.log("✅ Will generate only _quarter WebP atlas for this unit (no _half).");
    }

    await buildAtlas(inputDir, outPng, outJson, fps, maxWidth, webpOptions, {
        generateHalfWebp,
        cleanup,
    });
}

main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
});
