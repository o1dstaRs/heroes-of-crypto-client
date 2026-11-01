import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import {
    applySidebarPortraitRepair,
    decodeSidebarPortraitRepair,
    type SidebarPortraitRepair,
} from "../src/build/sidebarPortraitRepair";
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
sharp.cache(false);
for (const [name, animation] of Object.entries(catalog.animations)) {
    const source = inside(animation.sourcePath);
    const repairDescriptor = (animation as typeof animation & { repair?: SidebarPortraitRepair }).repair;
    const repairPixels = repairDescriptor
        ? decodeSidebarPortraitRepair(
              await readFile(inside(repairDescriptor.path)),
              repairDescriptor,
              animation.frameWidth,
              animation.frameHeight,
          )
        : undefined;
    const sourceHash = createHash("sha256");
    for await (const chunk of createReadStream(source)) sourceHash.update(chunk);
    if (sourceHash.digest("hex") !== animation.sourceSha256) throw new Error(`Unapproved portrait master: ${name}`);
    const temporaryRoot = path.resolve(import.meta.dir, "../tmp/portrait-restore");
    await mkdir(temporaryRoot, { recursive: true });
    const temporary = await mkdtemp(path.join(temporaryRoot, "pages-"));
    const rawFile = path.join(temporary, "master.raw");
    // Keep the decoded master on disk. Only one atlas row and one page need to reside in JS memory.
    try {
        const decoded = await sharp(source).metadata();
        if (!decoded.width || !decoded.height) throw new Error(`Missing portrait dimensions: ${name}`);
        await pipeline(sharp(source).ensureAlpha().raw(), createWriteStream(rawFile));
        Bun.gc(true);
        const cols = decoded.width / animation.frameWidth;
        if (!Number.isInteger(cols)) throw new Error(`Invalid portrait geometry: ${name}`);
        const raw = await open(rawFile, "r");
        try {
            if ((await raw.stat()).size !== decoded.width * decoded.height * 4)
                throw new Error(`Unexpected decoded portrait size: ${name}`);
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
                const stride = decoded.width * 4;
                const band = Buffer.allocUnsafe(stride * animation.frameHeight);
                const top = Math.floor(page.firstFrame / cols) * animation.frameHeight;
                let read = 0;
                while (read < band.length) {
                    const result = await raw.read(band, read, band.length - read, top * stride + read);
                    if (!result.bytesRead) throw new Error(`Truncated decoded portrait: ${name}`);
                    read += result.bytesRead;
                }
                const pixels = Buffer.allocUnsafe(width * animation.frameHeight * 4);
                const left = (page.firstFrame % cols) * animation.frameWidth * 4;
                for (let row = 0; row < animation.frameHeight; row++) {
                    band.copy(pixels, row * width * 4, row * stride + left, row * stride + left + width * 4);
                }
                if (repairPixels)
                    applySidebarPortraitRepair(
                        pixels,
                        repairPixels,
                        animation.frameWidth,
                        animation.frameHeight,
                        page.firstFrame,
                        page.frameCount,
                    );
                const bytes = await sharp(pixels, { raw: { width, height: animation.frameHeight, channels: 4 } })
                    .webp(catalog.recipe)
                    .toBuffer();
                if (bytes.length !== page.bytes || digest(bytes) !== page.sha256)
                    throw new Error(
                        `Portrait encoder differs from the release: ${page.key}. Use the pinned Bun lockfile.`,
                    );
                if (!verifyEncoding) {
                    await mkdir(path.dirname(filename), { recursive: true });
                    await writeFile(filename, bytes, { flag: "wx" });
                }
            }
        } finally {
            await raw.close();
        }
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
    Bun.gc(true);
    console.log(`Verified restored pages: ${name}`);
}
