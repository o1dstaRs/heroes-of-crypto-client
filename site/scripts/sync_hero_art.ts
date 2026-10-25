import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import manifest from "../hero-assets.json";

const siteRoot = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const checkOnly = args[0] === "--check";
const sourceDirectory = checkOnly ? undefined : args[0] || process.env.HOC_SITE_ASSETS_DIR;
if (args.length > 1 || (args[0]?.startsWith("--") && !checkOnly)) {
    throw new Error("Usage: bun scripts/sync_hero_art.ts [--check | <downloaded Google Drive release directory>]");
}

// The committed manifest pins the reviewed Drive release. Never trust paths or hashes
// from a downloaded manifest, and verify every input before changing a runtime file.
const verified = await Promise.all(
    manifest.assets.map(async (asset) => {
        const input = sourceDirectory ? resolve(sourceDirectory, asset.file) : resolve(siteRoot, "public", asset.path);
        let bytes: Buffer;
        try {
            bytes = await readFile(input);
        } catch {
            throw new Error(
                `Missing hero asset: ${asset.file}. Download ${manifest.source.folderUrl} and run bun run sync:hero -- <release-directory>.`,
            );
        }
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (hash !== asset.sha256 || bytes.length !== asset.bytes) {
            throw new Error(`Hero asset differs from the reviewed Google Drive release: ${asset.file}`);
        }
        if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
            throw new Error(`Expected WebP image: ${asset.file}`);
        }
        return { asset, bytes };
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
console.log(
    `Hero assets ${sourceDirectory ? "imported from Drive download and verified" : "verified against Drive release"}: ${verified.length} WebP files (${manifest.release}).`,
);

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

const served = verified.reduce((total, { bytes }) => total + bytes.length, 0);
