import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const core = resolve(import.meta.dir, "..");
const checkpoint = resolve(core, "../../site/public/assets/game-checkpoints/2026-09-09");
const manifest = JSON.parse(readFileSync(resolve(checkpoint, "manifest.json"), "utf8")) as {
    files: { file: string; sha256: string; bytes: number }[];
};
const restore = process.argv.includes("--restore-runtime");
for (const entry of manifest.files) {
    const source = resolve(checkpoint, entry.file);
    const bytes = readFileSync(source);
    if (bytes.length !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
        throw new Error(`Checkpoint checksum mismatch: ${entry.file}`);
    }
}
if (restore) {
    mkdirSync(resolve(core, "images"), { recursive: true });
    for (const entry of manifest.files)
        copyFileSync(resolve(checkpoint, entry.file), resolve(core, "images", entry.file));
}
console.log(`${restore ? "Restored" : "Verified"} ${manifest.files.length} approved visual assets.`);
