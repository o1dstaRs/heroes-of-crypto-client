import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import manifest from "../hero-assets.json";

const siteRoot = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const checkOnly = args[0] === "--check";
const sourceDirectory = checkOnly ? undefined : args[0] || process.env.HOC_SITE_ASSETS_DIR;
if (args.length > 1 || (args[0]?.startsWith("--") && !checkOnly)) {
    throw new Error("Usage: bun scripts/sync_hero_art.ts [--check | <downloaded Google Drive release directory>]");
}

/**
 * The masters on Drive are what the art review approved; `public/` holds the web EXPORTS that are actually
 * served, which for the four that shipped as lossless WebP are much smaller re-encodes. `asset.encode` is
 * the exact cwebp recipe that turns one into the other, so the optimisation is reproducible rather than a
 * one-off someone did by hand, and `asset.source` still pins the master — re-importing from Drive verifies
 * the reviewed bytes first and only then re-encodes.
 */
const encodeExport = async (masterBytes: Buffer, encode: readonly string[], file: string): Promise<Buffer> => {
    if (!encode.length) return masterBytes;
    // Scratch lives in the OS temp dir, never in the repo: one asset throwing rejects the whole
    // Promise.all, and anything written next to the site would survive as untracked litter.
    const stem = join(tmpdir(), `hoc-hero-${process.pid}-${file}`);
    const master = `${stem}.master.webp`;
    const decoded = `${stem}.png`;
    const exported = `${stem}.export.webp`;
    try {
        await writeFile(master, masterBytes);
        // cwebp will not take WebP in, so the master is decoded first; both tools ship with libwebp.
        const toPng = Bun.spawnSync(["dwebp", "-quiet", master, "-o", decoded]);
        if (toPng.exitCode !== 0) {
            throw new Error(`dwebp failed for ${file}. Install libwebp (brew install webp) to re-import art.`);
        }
        const toWebp = Bun.spawnSync(["cwebp", "-quiet", ...encode, decoded, "-o", exported]);
        if (toWebp.exitCode !== 0) {
            throw new Error(`cwebp failed for ${file}: ${new TextDecoder().decode(toWebp.stderr)}`);
        }
        return await readFile(exported);
    } finally {
        await Promise.all([master, decoded, exported].map((p) => unlink(p).catch(() => undefined)));
    }
};

// The committed manifest pins the reviewed Drive release. Never trust paths or hashes
// from a downloaded manifest, and verify every input before changing a runtime file.
const verified = await Promise.all(
    manifest.assets.map(async (asset) => {
        const importing = Boolean(sourceDirectory);
        const input = importing ? resolve(sourceDirectory!, asset.file) : resolve(siteRoot, "public", asset.path);
        // Importing checks the Drive MASTER; verifying checks the export that is actually served.
        const expected = importing ? asset.source : asset;
        let bytes: Buffer;
        try {
            bytes = await readFile(input);
        } catch {
            throw new Error(
                `Missing hero asset: ${asset.file}. Download ${manifest.source.folderUrl} and run bun run sync:hero -- <release-directory>.`,
            );
        }
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (hash !== expected.sha256 || bytes.length !== expected.bytes) {
            throw new Error(
                importing
                    ? `Hero master differs from the reviewed Google Drive release: ${asset.file}`
                    : `Hero export differs from the one this manifest pins: ${asset.file}. Re-run bun run sync:hero -- <release-directory>.`,
            );
        }
        if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
            throw new Error(`Expected WebP image: ${asset.file}`);
        }
        return { asset, bytes: importing ? await encodeExport(bytes, asset.encode, asset.file) : bytes };
    }),
);

if (sourceDirectory) {
    for (const { asset, bytes } of verified) {
        const output = resolve(siteRoot, "public", asset.path);
        await mkdir(dirname(output), { recursive: true });
        const pending = `${output}.tmp-${process.pid}`;
        await writeFile(pending, bytes);
        await rename(pending, output);
    }
}
const served = verified.reduce((total, { bytes }) => total + bytes.length, 0);
console.log(
    `Hero assets ${sourceDirectory ? "imported from Drive download, re-encoded and verified" : "verified against Drive release"}: ${verified.length} WebP files, ${(served / 1048576).toFixed(2)} MiB served (${manifest.release}).`,
);
