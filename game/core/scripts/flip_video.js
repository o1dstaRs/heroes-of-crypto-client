#!/usr/bin/env bun

import { resolve, dirname } from "path";
import { mkdir } from "fs/promises";

function parseArgs() {
    const args = Bun.argv.slice(2);

    if (args.length < 2) {
        console.error("Usage: bun flip_video.js <input_video> <output_video>");
        process.exit(1);
    }

    const inputPath = resolve(args[0]);
    const outputPath = resolve(args[1]);

    return { inputPath, outputPath };
}

async function ensureDirForFile(filePath) {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
}

async function main() {
    const { inputPath, outputPath } = parseArgs();

    await ensureDirForFile(outputPath);

    const ffmpegPath = Bun.which ? Bun.which("ffmpeg") : null;
    if (!ffmpegPath) {
        console.error("ffmpeg not found in PATH. Install it (e.g. `brew install ffmpeg`).");
        process.exit(1);
    }

    const ffmpegArgs = [
        "-i",
        inputPath,
        "-vf",
        "hflip", // horizontal flip
        "-c:v",
        "libx264", // standard H.264
        "-preset",
        "slow", // better compression, higher quality at same size
        "-crf",
        "18", // visually lossless-ish
        "-pix_fmt",
        "yuv420p", // most compatible pixel format
        "-c:a",
        "copy", // keep original audio
        "-movflags",
        "+faststart", // better for web / quick playback
        outputPath,
    ];

    console.log("Running ffmpeg with args:", ffmpegArgs.join(" "));

    const proc = Bun.spawn([ffmpegPath.toString(), ...ffmpegArgs], {
        stdout: "inherit",
        stderr: "inherit",
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
        console.error(`ffmpeg exited with code ${exitCode}`);
        process.exit(exitCode);
    }

    console.log(`✅ Done! Flipped video saved to: ${outputPath}`);
}

main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
});
