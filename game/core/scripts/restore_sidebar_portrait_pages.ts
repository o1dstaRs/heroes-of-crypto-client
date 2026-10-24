import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import catalog from "../src/ui/sidebarPortraitPages.json";

const root = path.resolve(process.argv[2] ?? "");
const verifyEncoding = process.argv.includes("--verify-encoding");
if (!process.argv[2]) throw new Error("Pass the restored heroesofcrypto-assets directory");
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const inside = (relative: string) => {
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root + path.sep)) throw new Error(`Unsafe asset path: ${relative}`);
    return filename;
};
sharp.concurrency(1);
for (const [name, animation] of Object.entries(catalog.animations)) {
    const source = await readFile(inside(animation.sourcePath));
    if (digest(source) !== animation.sourceSha256) throw new Error(`Unapproved portrait master: ${name}`);
    const decoded = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cols = decoded.info.width / animation.frameWidth;
    if (!Number.isInteger(cols)) throw new Error(`Invalid portrait geometry: ${name}`);
    for (const page of animation.pages) {
        const filename = inside(page.releasePath);
        const previous = await readFile(filename).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
            return undefined;
        });
        if (previous) {
            if (previous.length !== page.bytes || digest(previous) !== page.sha256)
                throw new Error(`Existing portrait page differs: ${page.key}`);
            if (!verifyEncoding) continue;
        }
        const width = page.frameCount * animation.frameWidth;
        const pixels = await sharp(decoded.data, { raw: decoded.info })
            .extract({
                left: (page.firstFrame % cols) * animation.frameWidth,
                top: Math.floor(page.firstFrame / cols) * animation.frameHeight,
                width,
                height: animation.frameHeight,
            })
            .raw()
            .toBuffer();
        const bytes = await sharp(pixels, { raw: { width, height: animation.frameHeight, channels: 4 } })
            .webp(catalog.recipe)
            .toBuffer();
        if (bytes.length !== page.bytes || digest(bytes) !== page.sha256)
            throw new Error(`Portrait encoder differs from the release: ${page.key}. Use the pinned Bun lockfile.`);
        if (!verifyEncoding) {
            await mkdir(path.dirname(filename), { recursive: true });
            await writeFile(filename, bytes, { flag: "wx" });
        }
    }
    console.log(`Verified restored pages: ${name}`);
}
