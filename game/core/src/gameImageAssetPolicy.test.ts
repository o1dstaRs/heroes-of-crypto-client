import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const CORE_DIR = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(CORE_DIR, "public");
const SOURCE_DIR = join(CORE_DIR, "src");
const ALLOWED_PUBLIC_IMAGES = ["public/favicon.ico"];
const IMAGE_FILE = /\.(?:apng|avif|bmp|gif|heic|heif|ico|jpe?g|png|psd|svg|tiff?|webp)$/i;
const SOURCE_FILE = /\.(?:css|html|js|jsx|scss|ts|tsx)$/i;
const DIRECT_PUBLIC_IMAGE_URL =
    /["'\x60](\/[^"'\x60]+\.(?:apng|avif|bmp|gif|heic|heif|ico|jpe?g|png|psd|svg|tiff?|webp)(?:\?[^"'\x60]*)?)["'\x60]/gi;

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
});
