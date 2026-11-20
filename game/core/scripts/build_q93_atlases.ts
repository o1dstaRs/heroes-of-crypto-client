import { createHash } from "node:crypto";
import { closeSync, openSync, readSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import release from "../animation-release.json";
import retiredImageFiles from "../src/build/retiredImageAssets.json";
import { COLOUR_THRESHOLD_ATLAS_KEYS } from "../src/build/halfBodyAtlases";
import {
    Q93_ATLAS_FOLDER,
    Q93_ATLAS_MIN_PSNR,
    Q93_ATLAS_RECIPE,
    q93AtlasReleasePath,
    selectQ93AtlasSources,
    type Q93AtlasCatalog,
    type Q93AtlasDescriptor,
} from "../src/build/q93Atlases";
import { sidebarPageQuality } from "../src/build/sidebarPortraitPages";
import halfBodyAtlases from "../src/pixi/halfBodyAtlases.json";

/**
 * Re-encode the remaining lossless animation atlases at full size (see src/build/q93Atlases.ts).
 *
 *   bun scripts/build_q93_atlases.ts --assets=<asset root holding animations/output> \
 *       --catalog=src/pixi/q93Atlases.json --release=animation-release.json [--release-version=<name>]
 *
 * Same guarantees as build_half_body_atlases.ts: masters verified against animation-release.json,
 * unchanged outputs reused, a different existing file never overwritten, new copies pinned in
 * animation-release.json and asset-release-archives.json (restored from the shared Drive).
 */
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const writeNew = async (filename: string, bytes: Buffer) => {
    try {
        const existing = await readFile(filename);
        if (!existing.equals(bytes)) throw new Error(`Refusing to overwrite different output: ${filename}`);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await mkdir(path.dirname(filename), { recursive: true });
        await writeFile(filename, bytes, { flag: "wx" });
    }
};

async function buildQ93Atlases(assetRoot: string, catalogFile: string, releaseFile?: string, releaseVersion?: string) {
    const files = release.files as Record<string, { sha256: string; bytes: number }>;
    const isLossless = (name: string) => {
        const fd = openSync(path.join(assetRoot, name), "r");
        try {
            const head = Buffer.alloc(64);
            readSync(fd, head, 0, 64, 0);
            return head.includes(Buffer.from("VP8L"));
        } finally {
            closeSync(fd);
        }
    };
    const sources = selectQ93AtlasSources(files, {
        replacedByHalf: new Set(Object.values(halfBodyAtlases.atlases).map((atlas) => atlas.sourcePath)),
        colourKeyed: COLOUR_THRESHOLD_ATLAS_KEYS,
        retired: new Set(retiredImageFiles as string[]),
        isLossless,
    });
    const previous: Q93AtlasCatalog | undefined = await readFile(catalogFile, "utf8")
        .then((text) => JSON.parse(text) as Q93AtlasCatalog)
        .catch(() => undefined);
    if (previous && JSON.stringify(previous.recipe) !== JSON.stringify(Q93_ATLAS_RECIPE)) {
        throw new Error("The catalog was built with a different recipe; bump the folder version instead.");
    }
    // Keep only entries whose master is still selected (a master may since be halved or excluded).
    const atlases: Record<string, Q93AtlasDescriptor> = Object.fromEntries(
        Object.entries(previous?.atlases ?? {}).filter(([key, atlas]) => sources.get(key) === atlas.sourcePath),
    );
    const writeCatalog = () =>
        writeFile(
            catalogFile,
            JSON.stringify(
                {
                    version: 1,
                    recipe: Q93_ATLAS_RECIPE,
                    atlases: Object.fromEntries(Object.entries(atlases).sort(([a], [b]) => a.localeCompare(b))),
                } satisfies Q93AtlasCatalog,
                null,
                4,
            ) + "\n",
        );
    const keys = [...sources.keys()].sort();
    sharp.concurrency(1);
    let next = 0;
    let built = 0;
    let reused = 0;
    let sourceBytes = 0;
    let encodedBytes = 0;
    const rejected: string[] = [];
    const work = async () => {
        while (next < keys.length) {
            const key = keys[next++];
            if (key === undefined) break;
            const sourcePath = sources.get(key);
            const pinned = sourcePath ? files[sourcePath] : undefined;
            if (!sourcePath || !pinned) throw new Error(`Unpinned source for ${key}`);
            const source = await readFile(path.join(assetRoot, sourcePath));
            if (source.length !== pinned.bytes || sha256(source) !== pinned.sha256) {
                throw new Error(`Source is not the approved master: ${sourcePath}`);
            }
            const releasePath = q93AtlasReleasePath(key);
            const target = path.join(assetRoot, releasePath);
            const cached = atlases[key];
            if (cached && cached.sourceSha256 === pinned.sha256 && cached.releasePath === releasePath) {
                const bytes = await readFile(target).catch(() => undefined);
                if (bytes && bytes.length === cached.bytes && sha256(bytes) === cached.sha256) {
                    reused++;
                    sourceBytes += source.length;
                    encodedBytes += bytes.length;
                    continue;
                }
            }
            const decoded = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            const bytes = await sharp(decoded.data, { raw: decoded.info }).webp(Q93_ATLAS_RECIPE).toBuffer();
            const quality = sidebarPageQuality(decoded.data, await sharp(bytes).ensureAlpha().raw().toBuffer());
            if (!quality.alphaExact || quality.psnr < Q93_ATLAS_MIN_PSNR || bytes.length >= source.length) {
                // Keep the lossless master: too much detail lost, or nothing to gain.
                delete atlases[key];
                rejected.push(
                    `${key} (${quality.alphaExact ? "" : "alpha changed, "}${quality.psnr.toFixed(2)} dB, ${bytes.length >= source.length ? "no smaller" : "smaller"})`,
                );
                continue;
            }
            await writeNew(target, bytes);
            atlases[key] = {
                sourcePath,
                sourceSha256: pinned.sha256,
                width: decoded.info.width,
                height: decoded.info.height,
                bytes: bytes.length,
                sha256: sha256(bytes),
                releasePath,
                psnr: Math.round(quality.psnr * 100) / 100,
            };
            built++;
            sourceBytes += source.length;
            encodedBytes += bytes.length;
            if (built % 10 === 0) await writeCatalog();
        }
    };
    await Promise.all(Array.from({ length: 4 }, work));
    await writeCatalog();
    if (releaseFile) {
        const manifest = JSON.parse(await readFile(releaseFile, "utf8")) as {
            version: string;
            files: Record<string, { sha256: string; bytes: number }>;
        };
        for (const name of Object.keys(manifest.files)) {
            if (name.includes(`/${Q93_ATLAS_FOLDER}/`)) delete manifest.files[name];
        }
        // Existing entries keep their order; the derived files are appended as one block.
        for (const atlas of Object.values(atlases)) {
            manifest.files[atlas.releasePath] = { sha256: atlas.sha256, bytes: atlas.bytes };
        }
        if (releaseVersion) manifest.version = releaseVersion;
        await writeFile(releaseFile, JSON.stringify(manifest, null, 4) + "\n");
        const restoreFile = path.join(path.dirname(releaseFile), "asset-release-archives.json");
        const restore = JSON.parse(await readFile(restoreFile, "utf8")) as {
            version: string;
            files: Record<string, { sha256: string; bytes: number; source: string; path: string }>;
        };
        for (const name of Object.keys(restore.files)) {
            if (name.includes(`/${Q93_ATLAS_FOLDER}/`)) delete restore.files[name];
        }
        for (const atlas of Object.values(atlases)) {
            restore.files[`heroesofcrypto-assets/${atlas.releasePath}`] = {
                sha256: atlas.sha256,
                bytes: atlas.bytes,
                source: "drive",
                path: atlas.releasePath,
            };
        }
        if (releaseVersion) restore.version = releaseVersion;
        await writeFile(restoreFile, JSON.stringify(restore, null, 4) + "\n");
    }
    console.log(
        `Built ${built}, reused ${reused} of ${keys.length}; ${(sourceBytes / 1048576).toFixed(0)} MB of masters -> ` +
            `${(encodedBytes / 1048576).toFixed(0)} MB.` +
            (rejected.length ? ` Kept lossless: ${rejected.join(", ")}.` : ""),
    );
}

if (import.meta.main) {
    const args = new Map(
        process.argv.slice(2).map((arg) => {
            const at = arg.indexOf("=");
            return [arg.slice(0, at), arg.slice(at + 1)];
        }),
    );
    const assets = args.get("--assets");
    const catalog = args.get("--catalog");
    if (!assets || !catalog) throw new Error("Required: --assets=<asset root> --catalog=FILE [--release=FILE]");
    const releaseFile = args.get("--release");
    await buildQ93Atlases(
        path.resolve(assets),
        path.resolve(catalog),
        releaseFile ? path.resolve(releaseFile) : undefined,
        args.get("--release-version"),
    );
}
