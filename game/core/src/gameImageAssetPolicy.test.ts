import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
    findGameImageAssetViolations,
    MAX_STATIC_GAME_IMAGE_BYTES,
    validateGameImageAsset,
} from "./gameImageAssetPolicy";

const CORE_DIR = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(CORE_DIR, "public");
const SOURCE_DIR = join(CORE_DIR, "src");
const IMAGE_GENERATOR = join(CORE_DIR, "scripts", "generate_image_imports.js");
const ALLOWED_PUBLIC_IMAGES = ["public/favicon.ico"];
const IMAGE_FILE = /\.(?:apng|avif|bmp|gif|heic|heif|ico|jpe?g|png|psd|svg|tiff?|webp)$/i;
const SOURCE_FILE = /\.(?:css|html|js|jsx|scss|ts|tsx)$/i;
const DIRECT_PUBLIC_IMAGE_URL =
    /["'\x60](\/[^"'\x60]+\.(?:apng|avif|bmp|gif|heic|heif|ico|jpe?g|png|psd|svg|tiff?|webp)(?:\?[^"'\x60]*)?)["'\x60]/gi;
const WEBP_HEADER = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

function filesUnder(root: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const filePath = join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...filesUnder(filePath));
        } else if (entry.isFile()) {
            files.push(filePath);
        }
    }
    return files;
}

describe("game image asset policy", () => {
    test("keeps only the approved favicon under game/core/public", () => {
        const publicImages = filesUnder(PUBLIC_DIR)
            .filter((filePath) => IMAGE_FILE.test(filePath))
            .map((filePath) => relative(CORE_DIR, filePath))
            .sort();

        expect(publicImages).toEqual(ALLOWED_PUBLIC_IMAGES);
    });

    test("does not hard-code public game-image URLs in source", () => {
        const violations: string[] = [];

        for (const filePath of filesUnder(SOURCE_DIR).filter((candidate) => SOURCE_FILE.test(candidate))) {
            const contents = readFileSync(filePath, "utf8");
            for (const match of contents.matchAll(DIRECT_PUBLIC_IMAGE_URL)) {
                if (match[1] !== "/favicon.ico") {
                    violations.push(relative(SOURCE_DIR, filePath) + ": " + match[1]);
                }
            }
        }

        expect(violations).toEqual([]);
    });

    test("allows valid static WebPs up to the approved current maximum", () => {
        expect(
            validateGameImageAsset({
                fileName: "largest-approved.webp",
                sizeBytes: MAX_STATIC_GAME_IMAGE_BYTES,
                header: WEBP_HEADER,
            }),
        ).toEqual([]);
    });

    test("rejects non-WebP game images", () => {
        for (const fileName of ["texture.png", "icon.svg", "photo.jpeg", "badge.avif", "favicon.ico"]) {
            expect(
                validateGameImageAsset({
                    fileName,
                    sizeBytes: WEBP_HEADER.length,
                    header: WEBP_HEADER,
                }),
            ).toContain(`${fileName}: game images must use the .webp extension`);
        }
    });

    test("rejects empty, fake, and oversized static WebPs", () => {
        expect(validateGameImageAsset({ fileName: "empty.webp", sizeBytes: 0, header: new Uint8Array() })).toContain(
            "empty.webp: image is empty",
        );
        expect(
            validateGameImageAsset({
                fileName: "renamed-png.webp",
                sizeBytes: 12,
                header: new Uint8Array(12),
            }),
        ).toContain("renamed-png.webp: file contents are not a valid WebP container");
        expect(
            validateGameImageAsset({
                fileName: "too-large.webp",
                sizeBytes: MAX_STATIC_GAME_IMAGE_BYTES + 1,
                header: WEBP_HEADER,
            }).some((violation) => violation.includes("exceeds")),
        ).toBe(true);
    });

    test("exempts animation atlases from only the static-image size ceiling", () => {
        expect(
            validateGameImageAsset({
                fileName: "angel_default_atlas.webp",
                sizeBytes: MAX_STATIC_GAME_IMAGE_BYTES + 1,
                header: WEBP_HEADER,
            }),
        ).toEqual([]);
        expect(
            validateGameImageAsset({
                fileName: "angel_default_atlas.webp",
                sizeBytes: MAX_STATIC_GAME_IMAGE_BYTES + 1,
                header: new Uint8Array(12),
            }),
        ).toContain("angel_default_atlas.webp: file contents are not a valid WebP container");
    });

    test("keeps the generated image manifest WebP-only", () => {
        const generator = readFileSync(IMAGE_GENERATOR, "utf8");

        expect(generator).toContain("isWebPFile(file)");
        expect(generator).not.toContain("SUPPORTED_IMAGE_EXTENSIONS");
    });

    test("validates the configured Dropbox image directory when available", async () => {
        const imageDirectory = process.env.HOC_IMAGES_LOC;
        if (!imageDirectory) {
            return;
        }

        expect(await findGameImageAssetViolations(imageDirectory)).toEqual([]);
    });
});
