import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

import {
    hasMatchingPortraitCanvasAndAlpha,
    isLosslessWebP,
    optimizeAnimationBuildCopies,
} from "../build/portraitBuildCopyEncoding";

test("production atlas encoding retains every cel and alpha value, skips lossy and unreachable files, and preserves Drive masters", async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "hoc-atlas-encoding-")));
    const images = path.join(root, "images");
    const canonical = path.join(root, "canonical");
    try {
        await Promise.all([mkdir(images), mkdir(canonical)]);
        const pixels = Buffer.alloc(256 * 64 * 4);
        let random = 123456789;
        for (let i = 0; i < pixels.length; i += 4) {
            for (let channel = 0; channel < 3; channel++) {
                random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
                pixels[i + channel] = random >>> 24;
            }
            pixels[i + 3] = Math.floor(i / 4) % 256;
        }
        const original = Buffer.from(
            await sharp(pixels, { raw: { width: 256, height: 64, channels: 4 } })
                .webp({ lossless: true })
                .toBuffer(),
        );
        const lossy = Buffer.from(await sharp(original).webp({ quality: 90, alphaQuality: 100 }).toBuffer());
        const files = new Map([
            ["creature_idle_atlas.webp", original],
            ["creature_idle_page_00_atlas.webp", original],
            ["creature_attack_atlas.webp", lossy],
            ["unreachable_atlas.webp", original],
            ["creature_512.webp", original],
        ]);
        for (const [filename, bytes] of files) {
            await writeFile(path.join(images, filename), bytes);
            await writeFile(path.join(canonical, filename), bytes);
        }
        const reachable = new Set([...files.keys()].filter((filename) => filename !== "unreachable_atlas.webp"));
        await symlink(path.join(canonical, "creature_idle_atlas.webp"), path.join(images, "aliased_atlas.webp"));
        reachable.add("aliased_atlas.webp");
        const summary = await optimizeAnimationBuildCopies(images, canonical, reachable);
        expect(summary.optimized).toBe(2);
        expect(summary.alreadyLossy).toBe(1);
        expect(summary.skippedUnsafe).toBe(1);
        expect(summary.bytesAfter).toBeLessThan(summary.bytesBefore);
        for (const [filename, bytes] of files) {
            expect(await readFile(path.join(canonical, filename))).toEqual(bytes);
            const encoded = await readFile(path.join(images, filename));
            if (filename.startsWith("creature_idle")) {
                expect(isLosslessWebP(encoded)).toBe(false);
                expect(await hasMatchingPortraitCanvasAndAlpha(bytes, encoded)).toBe(true);
            } else expect(encoded).toEqual(bytes);
        }
        const repeat = await optimizeAnimationBuildCopies(images, canonical, reachable);
        expect(repeat.optimized).toBe(0);
        expect(repeat.alreadyLossy).toBe(3);
        const refused = await optimizeAnimationBuildCopies(canonical, canonical, reachable);
        expect(refused.skippedReason).toContain("canonical artwork");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
