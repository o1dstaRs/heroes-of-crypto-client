import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

/** Keep multi-gigabyte art outside the bundler's retained asset buffers. */
export function streamedImageAssets(coreDirectory: string): Plugin {
    const generated = path.resolve(coreDirectory, "src/generated/image_imports.ts");
    const images = path.resolve(coreDirectory, "images");
    const copies = new Map<string, { source: string; size: number; mtimeMs: number }>();
    let base = "/";
    let output = "";
    return {
        name: "hoc-streamed-image-assets",
        apply: "build",
        enforce: "pre",
        configResolved(config) {
            base = config.base;
            output = path.resolve(config.root, config.build.outDir);
        },
        async transform(code, id) {
            if (id.split("?", 1)[0] !== generated) return null;
            const pattern = /new URL\("\.\.\/\.\.\/images\/([^"?]+)(?:\?[^\"]*)?", import\.meta\.url\)\.toString\(\)/g;
            let result = "";
            let cursor = 0;
            for (const match of code.matchAll(pattern)) {
                const filename = match[1];
                if (path.basename(filename) !== filename) throw new Error(`Invalid game asset: ${filename}`);
                if (!base.startsWith("/") && !/^https?:\/\//.test(base))
                    throw new Error("Game image streaming requires an absolute Vite base URL");
                const source = path.join(images, filename);
                const before = await stat(source);
                const hash = createHash("sha256");
                for await (const chunk of createReadStream(source)) hash.update(chunk);
                const revision = hash.digest("hex").slice(0, 16);
                const extension = path.extname(filename);
                const target = `${path.basename(filename, extension)}-${revision}${extension}`;
                copies.set(target, { source, size: before.size, mtimeMs: before.mtimeMs });
                result += code.slice(cursor, match.index) + JSON.stringify(`${base}assets/${target}`);
                cursor = match.index! + match[0].length;
            }
            return cursor ? { code: result + code.slice(cursor), map: null } : null;
        },
        async writeBundle() {
            if (!copies.size) return;
            const destination = path.join(output, "assets");
            await mkdir(destination, { recursive: true });
            for (const [filename, entry] of copies) {
                const current = await stat(entry.source);
                if (current.size !== entry.size || current.mtimeMs !== entry.mtimeMs)
                    throw new Error(`Game asset changed during build: ${entry.source}`);
                await copyFile(entry.source, path.join(destination, filename), constants.COPYFILE_FICLONE);
            }
            console.log(`Copied ${copies.size} content-hashed game images without bundler asset buffers.`);
        },
    };
}
