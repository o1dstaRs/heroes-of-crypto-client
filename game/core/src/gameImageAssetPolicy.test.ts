import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const CORE_DIR = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(CORE_DIR, "public");
const SOURCE_DIR = join(CORE_DIR, "src");
const IMAGE_FILE = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const SOURCE_FILE = /\.(?:css|html|js|jsx|scss|ts|tsx)$/i;
const DIRECT_PUBLIC_IMAGE_URL = /["'\x60](\/[^"'\x60]+\.(?:avif|gif|jpe?g|png|svg|webp)(?:\?[^"'\x60]*)?)["'\x60]/gi;

function filesUnder(root: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...filesUnder(path));
        } else if (entry.isFile()) {
            files.push(path);
        }
    }
    return files;
}

describe("game image asset policy", () => {
    test("keeps runtime image binaries out of game/core/public", () => {
        const publicImages = filesUnder(PUBLIC_DIR)
            .filter((file) => IMAGE_FILE.test(file))
            .map((file) => relative(CORE_DIR, file));

        expect(publicImages).toEqual([]);
    });

    test("does not hard-code public image URLs in game source", () => {
        const violations: string[] = [];

        for (const file of filesUnder(SOURCE_DIR).filter((path) => SOURCE_FILE.test(path))) {
            const contents = readFileSync(file, "utf8");
            for (const match of contents.matchAll(DIRECT_PUBLIC_IMAGE_URL)) {
                violations.push(relative(SOURCE_DIR, file) + ": " + match[1]);
            }
        }

        expect(violations).toEqual([]);
    });
});
