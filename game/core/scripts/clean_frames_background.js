#!/usr/bin/env bun

import { mkdir, readdir, unlink } from "fs/promises";
import { resolve, join, extname } from "path";
import { PNG } from "pngjs";

// ---- Helpers ----

function getPixel(png, x, y) {
    const idx = (png.width * y + x) * 4;
    const d = png.data;
    return {
        r: d[idx],
        g: d[idx + 1],
        b: d[idx + 2],
        a: d[idx + 3],
    };
}

function setPixelAlpha(png, x, y, alpha) {
    const idx = (png.width * y + x) * 4;
    png.data[idx + 3] = alpha;
}

function colorDistanceSq(a, b) {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return dr * dr + dg * dg + db * db;
}

function isCloseColor(c, bg, threshold) {
    const t2 = threshold * threshold;
    return colorDistanceSq(c, bg) <= t2;
}

function isNearWhite(c) {
    return c.r >= 240 && c.g >= 240 && c.b >= 240;
}

function isNearBlack(c) {
    return c.r <= 15 && c.g <= 15 && c.b <= 15;
}

function eraseBackground(png, backgroundColor, threshold) {
    const { width, height } = png;
    const visited = new Uint8Array(width * height);
    const queue = [];

    function tryPush(x, y) {
        const idx = y * width + x;
        if (visited[idx]) return;

        const c = getPixel(png, x, y);
        if (!isCloseColor(c, backgroundColor, threshold)) return;

        visited[idx] = 1;
        queue.push([x, y]);
    }

    for (let x = 0; x < width; x++) {
        tryPush(x, 0);
        tryPush(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
        tryPush(0, y);
        tryPush(width - 1, y);
    }

    while (queue.length > 0) {
        const [x, y] = queue.pop();
        setPixelAlpha(png, x, y, 0);

        const neighbors = [
            [x + 1, y],
            [x - 1, y],
            [x, y + 1],
            [x, y - 1],
        ];

        for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const idx = ny * width + nx;
            if (visited[idx]) continue;

            const c = getPixel(png, nx, ny);
            if (isCloseColor(c, backgroundColor, threshold)) {
                visited[idx] = 1;
                queue.push([nx, ny]);
            }
        }
    }
}

async function processImage(inputPath, outputPath, threshold, shouldDeleteOriginal) {
    const buf = await Bun.file(inputPath).arrayBuffer();
    const png = PNG.sync.read(Buffer.from(buf));
    const { width, height } = png;

    const c1 = getPixel(png, 0, 0);
    const c2 = getPixel(png, width - 1, 0);
    const c3 = getPixel(png, 0, height - 1);
    const c4 = getPixel(png, width - 1, height - 1);

    const corners = [c1, c2, c3, c4];

    const cornerThreshold = threshold;
    const cornersClose =
        isCloseColor(c1, c2, cornerThreshold) &&
        isCloseColor(c1, c3, cornerThreshold) &&
        isCloseColor(c1, c4, cornerThreshold);

    let backgroundColor = null;

    if (cornersClose) {
        backgroundColor = {
            r: Math.round((c1.r + c2.r + c3.r + c4.r) / 4),
            g: Math.round((c1.g + c2.g + c3.g + c4.g) / 4),
            b: Math.round((c1.b + c2.b + c3.b + c4.b) / 4),
            a: 255,
        };
    } else {
        const whiteCount = corners.filter(isNearWhite).length;
        const blackCount = corners.filter(isNearBlack).length;

        if (whiteCount >= 2) {
            backgroundColor = { r: 255, g: 255, b: 255, a: 255 };
        } else if (blackCount >= 2) {
            backgroundColor = { r: 0, g: 0, b: 0, a: 255 };
        } else if (blackCount >= 1) {
            backgroundColor = { r: 0, g: 0, b: 0, a: 255 };
        }
    }

    // Case 1: No background detected
    if (!backgroundColor) {
        console.log(`Skipping (no bg detected): ${inputPath}`);
        // If we are outputting to a different folder, we must copy the file (move behavior)
        if (inputPath !== outputPath) {
            const outBuf = PNG.sync.write(png);
            await Bun.write(outputPath, outBuf);

            // If requested, delete the original (effective move)
            if (shouldDeleteOriginal) {
                await unlink(inputPath);
            }
        }
        return;
    }

    // Case 2: Background detected, process it
    console.log(`Cleaning background in: ${inputPath}`);
    eraseBackground(png, backgroundColor, threshold);

    const outBuf = PNG.sync.write(png);
    await Bun.write(outputPath, outBuf);

    // Delete original if requested and paths differ
    // (If paths are the same, Bun.write already overwrote it, so no unlink needed)
    if (shouldDeleteOriginal && inputPath !== outputPath) {
        await unlink(inputPath);
    }
}

// ---- CLI ----

function parseArgs() {
    const args = Bun.argv.slice(2);
    if (args.length < 1) {
        console.error("Usage: bun clean.js <input_dir> [output_dir] [--bg-threshold 16] [--keep]");
        console.error(
            "Note: By default, original files in <input_dir> are DELETED after processing unless --keep is used.",
        );
        process.exit(1);
    }

    const inputDir = resolve(args[0]);
    let outputDir = inputDir;
    let nextArgIndex = 1;

    if (args[1] && !args[1].startsWith("-")) {
        outputDir = resolve(args[1]);
        nextArgIndex = 2;
    }

    let bgThreshold = 16;
    let keepOriginals = false; // Default is to delete originals

    for (let i = nextArgIndex; i < args.length; i++) {
        const a = args[i];
        if (a === "--bg-threshold" && args[i + 1]) {
            bgThreshold = Number(args[i + 1]);
            i++;
        } else if (a === "--keep") {
            keepOriginals = true;
        }
    }

    if (Number.isNaN(bgThreshold) || bgThreshold < 0) {
        bgThreshold = 16;
    }

    return { inputDir, outputDir, bgThreshold, keepOriginals };
}

async function main() {
    const { inputDir, outputDir, bgThreshold, keepOriginals } = parseArgs();
    const isSameDir = inputDir === outputDir;

    if (isSameDir) {
        console.log(`ℹ️  Overwrite Mode: Processing files in place inside ${inputDir}`);
    } else {
        console.log(`ℹ️  Pipeline Mode: ${inputDir} -> ${outputDir}`);
        if (keepOriginals) {
            console.log(`   --keep flag detected: Original files will be preserved.`);
        } else {
            console.log(`   ⚠️  Original files will be DELETED from input directory after processing.`);
        }
        await mkdir(outputDir, { recursive: true });
    }

    const files = await readdir(inputDir);
    const pngFiles = files.filter((f) => extname(f).toLowerCase() === ".png").sort();

    if (pngFiles.length === 0) {
        console.error("No .png files found in input directory");
        process.exit(1);
    }

    console.log(`Found ${pngFiles.length} frames. Tolerance: ${bgThreshold}`);

    for (const f of pngFiles) {
        const inPath = join(inputDir, f);
        const outPath = join(outputDir, f);

        // If directories are the same, we ignore keepOriginals logic (we physically can't keep the old version if we overwrite it)
        const shouldDelete = isSameDir ? false : !keepOriginals;

        await processImage(inPath, outPath, bgThreshold, shouldDelete);
    }

    console.log("✅ Done.");
}

main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
});
