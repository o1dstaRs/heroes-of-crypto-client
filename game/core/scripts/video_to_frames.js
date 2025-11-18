#!/usr/bin/env bun

import { mkdir } from "fs/promises";
import { resolve } from "path";

// Simple CLI parser
function parseArgs() {
    const args = Bun.argv.slice(2);

    if (args.length < 2) {
        console.error(
            "Usage: bun video_to_frames.js <input.mp4> <output_dir> [--fps 12] [--crop-top 50] [--crop-bottom 80] [--descale 4]",
        );
        process.exit(1);
    }

    const inputPath = resolve(args[0]);
    const outputDir = resolve(args[1]);

    let fps = 0; // 0 = use original fps
    let cropTop = 0;
    let cropBottom = 0;
    let descale = 1; // 1 = no scaling

    for (let i = 2; i < args.length; i++) {
        const a = args[i];
        if (a === "--fps" && args[i + 1]) {
            fps = Number(args[++i]);
        } else if (a === "--crop-top" && args[i + 1]) {
            cropTop = Number(args[++i]);
        } else if (a === "--crop-bottom" && args[i + 1]) {
            cropBottom = Number(args[++i]);
        } else if (a === "--descale" && args[i + 1]) {
            descale = Number(args[++i]);
        }
    }

    if (Number.isNaN(fps) || fps < 0) fps = 0;
    if (Number.isNaN(cropTop) || cropTop < 0) cropTop = 0;
    if (Number.isNaN(cropBottom) || cropBottom < 0) cropBottom = 0;
    if (Number.isNaN(descale) || descale < 1) descale = 1;

    return { inputPath, outputDir, fps, cropTop, cropBottom, descale };
}

async function ensureDir(dir) {
    await mkdir(dir, { recursive: true });
}

async function main() {
    const { inputPath, outputDir, fps, cropTop, cropBottom, descale } = parseArgs();

    await ensureDir(outputDir);

    const outputPattern = resolve(outputDir, "frame_%05d.png");

    const ffmpegArgs = ["-i", inputPath];

    // Build filter chain: fps -> crop -> scale
    const filters = [];

    if (fps > 0) {
        filters.push(`fps=${fps}`);
    }

    if (cropTop > 0 || cropBottom > 0) {
        const totalCrop = cropTop + cropBottom;
        // crop=width:height:x:y  (in_w / in_h are input width/height)
        filters.push(`crop=in_w:in_h-${totalCrop}:0:${cropTop}`);
    }

    if (descale > 1) {
        // scale=iw/descale:ih/descale
        filters.push(`scale=iw/${descale}:ih/${descale}`);
    }

    if (filters.length > 0) {
        ffmpegArgs.push("-vf", filters.join(","));
    }

    ffmpegArgs.push(outputPattern);

    console.log("Running ffmpeg with args:", ffmpegArgs.join(" "));

    const ffmpegPath = Bun.which ? Bun.which("ffmpeg") : null;
    if (!ffmpegPath) {
        console.error("ffmpeg not found in PATH. Install it (e.g. `brew install ffmpeg`).");
        process.exit(1);
    }

    const proc = Bun.spawn([ffmpegPath.toString(), ...ffmpegArgs], {
        stdout: "inherit",
        stderr: "inherit",
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
        console.error(`ffmpeg exited with code ${exitCode}`);
        process.exit(exitCode);
    }

    console.log(`✅ Done! Frames saved to: ${outputDir}`);
}

main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
});
