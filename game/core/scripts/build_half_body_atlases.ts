import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import release from "../animation-release.json";
import {
    HALF_BODY_ATLAS_FOLDER,
    HALF_BODY_ATLAS_MIN_PSNR,
    HALF_BODY_ATLAS_RECIPE,
    COLOUR_THRESHOLD_ATLAS_KEYS,
    halfBodyAtlasReleasePath,
    type HalfBodyAtlasCatalog,
    type HalfBodyAtlasDescriptor,
} from "../src/build/halfBodyAtlases";
import { sidebarPageQuality } from "../src/build/sidebarPortraitPages";

/**
 * Derive the half-size release copy of every runtime-halved body atlas (see src/build/halfBodyAtlases.ts).
 *
 *   bun scripts/build_half_body_atlases.ts --assets=<asset root holding animations/output> \
 *       --catalog=src/pixi/halfBodyAtlases.json --release=animation-release.json [--release-version=<name>]
 *
 * Sources must match the approved masters pinned in animation-release.json. Outputs go beside them under
 * animations/output/half_body_atlases_v1/. A rerun reuses every output whose master and recipe are
 * unchanged and refuses to overwrite a different file, like the sidebar portrait pages.
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

async function buildHalfBodyAtlases(
    assetRoot: string,
    catalogFile: string,
    only?: ReadonlySet<string>,
    releaseFile?: string,
    releaseVersion?: string,
) {
    const { halvedAtlasCandidateKeys } = await import("../src/pixi/runtimeAtlasScale");
    const files = release.files as Record<string, { sha256: string; bytes: number }>;
    const previous: HalfBodyAtlasCatalog | undefined = await readFile(catalogFile, "utf8")
        .then((text) => JSON.parse(text) as HalfBodyAtlasCatalog)
        .catch(() => undefined);
    if (previous && JSON.stringify(previous.recipe) !== JSON.stringify(HALF_BODY_ATLAS_RECIPE)) {
        throw new Error("The catalog was built with a different recipe; bump the folder version instead.");
    }
    const atlases: Record<string, HalfBodyAtlasDescriptor> = { ...previous?.atlases };
    // A colour-keyed atlas keeps its lossless master (the browser halves it); drop any earlier copy.
    for (const key of COLOUR_THRESHOLD_ATLAS_KEYS) delete atlases[key];
    const keys = [...halvedAtlasCandidateKeys()]
        .filter((key) => !COLOUR_THRESHOLD_ATLAS_KEYS.has(key) && (!only || only.has(key)))
        .sort();
    sharp.concurrency(1);
    let next = 0;
    let built = 0;
    let reused = 0;
    let sourceBytes = 0;
    let halfBytes = 0;
    const missing: string[] = [];
    const rejected: string[] = [];
    const writeCatalog = () =>
        writeFile(
            catalogFile,
            JSON.stringify(
                {
                    version: 1,
                    recipe: HALF_BODY_ATLAS_RECIPE,
                    atlases: Object.fromEntries(Object.entries(atlases).sort(([a], [b]) => a.localeCompare(b))),
                } satisfies HalfBodyAtlasCatalog,
                null,
                4,
            ) + "\n",
        );
    const work = async () => {
        while (next < keys.length) {
            const key = keys[next++];
            if (key === undefined) break;
            const sourcePath = Object.keys(files).find(
                (name) =>
                    name.endsWith(`/atlas/${key}.webp`) &&
                    name.startsWith("animations/output/") &&
                    !name.includes(`/${HALF_BODY_ATLAS_FOLDER}/`),
            );
            if (!sourcePath) {
                missing.push(key);
                continue;
            }
            const pinned = files[sourcePath];
            if (!pinned) throw new Error(`Unpinned source: ${sourcePath}`);
            const source = await readFile(path.join(assetRoot, sourcePath));
            if (source.length !== pinned.bytes || sha256(source) !== pinned.sha256) {
                throw new Error(`Source is not the approved master: ${sourcePath}`);
            }
            const releasePath = halfBodyAtlasReleasePath(key);
            const target = path.join(assetRoot, releasePath);
            const cached = atlases[key];
            if (cached && cached.sourceSha256 === pinned.sha256 && cached.releasePath === releasePath) {
                const bytes = await readFile(target).catch(() => undefined);
                if (bytes && bytes.length === cached.bytes && sha256(bytes) === cached.sha256) {
                    reused++;
                    sourceBytes += source.length;
                    halfBytes += bytes.length;
                    continue;
                }
            }
            const meta = await sharp(source).metadata();
            if (!meta.width || !meta.height || meta.width % 2 || meta.height % 2) {
                throw new Error(`${sourcePath}: ${meta.width}x${meta.height} does not halve exactly`);
            }
            const width = meta.width / 2;
            const height = meta.height / 2;
            const reference = await sharp(source)
                .resize(width, height, { kernel: "lanczos3" })
                .ensureAlpha()
                .raw()
                .toBuffer();
            const bytes = await sharp(reference, { raw: { width, height, channels: 4 } })
                .webp(HALF_BODY_ATLAS_RECIPE)
                .toBuffer();
            const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer();
            const quality = sidebarPageQuality(reference, decoded);
            if (!quality.alphaExact || quality.psnr < HALF_BODY_ATLAS_MIN_PSNR) {
                // Too much detail is lost to the recipe: keep shipping the master, which the browser halves.
                delete atlases[key];
                rejected.push(
                    `${key} (alpha ${quality.alphaExact ? "exact" : "changed"}, ${quality.psnr.toFixed(2)} dB)`,
                );
                continue;
            }
            await writeNew(target, bytes);
            atlases[key] = {
                sourcePath,
                sourceSha256: pinned.sha256,
                width,
                height,
                bytes: bytes.length,
                sha256: sha256(bytes),
                releasePath,
                psnr: Math.round(quality.psnr * 100) / 100,
            };
            built++;
            // Long runs keep their progress if a later sheet fails to read.
            if (built % 10 === 0) await writeCatalog();
            sourceBytes += source.length;
            halfBytes += bytes.length;
            console.log(
                `${key}: ${(source.length / 1048576).toFixed(1)} MB -> ${(bytes.length / 1048576).toFixed(2)} MB, ${quality.psnr.toFixed(1)} dB`,
            );
        }
    };
    await Promise.all(Array.from({ length: 4 }, work));
    const catalog: HalfBodyAtlasCatalog = {
        version: 1,
        recipe: HALF_BODY_ATLAS_RECIPE,
        atlases: Object.fromEntries(Object.entries(atlases).sort(([a], [b]) => a.localeCompare(b))),
    };
    await writeFile(catalogFile, JSON.stringify(catalog, null, 4) + "\n");
    if (releaseFile) {
        // Pin every derived file in the release manifest, so a deploy verifies and restores it like art.
        const manifest = JSON.parse(await readFile(releaseFile, "utf8")) as {
            version: string;
            files: Record<string, { sha256: string; bytes: number }>;
        };
        for (const [name] of Object.entries(manifest.files)) {
            if (name.includes(`/${HALF_BODY_ATLAS_FOLDER}/`)) delete manifest.files[name];
        }
        for (const descriptor of Object.values(catalog.atlases)) {
            manifest.files[descriptor.releasePath] = { sha256: descriptor.sha256, bytes: descriptor.bytes };
        }
        // Existing entries keep their order; the derived files are appended as one block.
        if (releaseVersion) manifest.version = releaseVersion;
        await writeFile(releaseFile, JSON.stringify(manifest, null, 4) + "\n");
        // The restore package fetches each derived file from its exact shared Drive path.
        const restoreFile = path.join(path.dirname(releaseFile), "asset-release-archives.json");
        const restore = JSON.parse(await readFile(restoreFile, "utf8")) as {
            version: string;
            files: Record<string, { sha256: string; bytes: number; source: string; path: string }>;
        };
        for (const name of Object.keys(restore.files)) {
            if (name.includes(`/${HALF_BODY_ATLAS_FOLDER}/`)) delete restore.files[name];
        }
        for (const descriptor of Object.values(catalog.atlases)) {
            restore.files[`heroesofcrypto-assets/${descriptor.releasePath}`] = {
                sha256: descriptor.sha256,
                bytes: descriptor.bytes,
                source: "drive",
                path: descriptor.releasePath,
            };
        }
        if (releaseVersion) restore.version = releaseVersion;
        await writeFile(restoreFile, JSON.stringify(restore, null, 4) + "\n");
    }
    console.log(
        `Built ${built}, reused ${reused}; ${(sourceBytes / 1048576).toFixed(0)} MB of masters -> ` +
            `${(halfBytes / 1048576).toFixed(0)} MB.` +
            (missing.length ? ` No release master for: ${missing.join(", ")}.` : "") +
            (rejected.length ? ` Below the quality floor, shipped full size: ${rejected.join(", ")}.` : ""),
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
    if (!assets || !catalog) throw new Error("Required: --assets=<asset root> --catalog=FILE [--only=key,key]");
    const only = args.get("--only");
    const releaseFile = args.get("--release");
    await buildHalfBodyAtlases(
        path.resolve(assets),
        path.resolve(catalog),
        only ? new Set(only.split(",")) : undefined,
        releaseFile ? path.resolve(releaseFile) : undefined,
        args.get("--release-version"),
    );
}
