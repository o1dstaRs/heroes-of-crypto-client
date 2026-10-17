import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import release from "../animation-release.json";
import { resolveAnimationsOutputLocation, resolveImagesLocation } from "../src/assetLocations";

type AssetManifest = Record<string, { sha256: string; bytes: number }>;

export async function verifyAnimationRelease(
    env: Record<string, string | undefined> = process.env,
    files: AssetManifest = release.files,
): Promise<void> {
    const images = resolveImagesLocation(env);
    const animations = resolveAnimationsOutputLocation(env);
    const entries = Object.entries(files);
    const failures: string[] = [];
    let next = 0;
    await Promise.all(
        Array.from({ length: Math.min(8, entries.length) }, async () => {
            while (next < entries.length) {
                const [name, expected] = entries[next++];
                const prefix = name.startsWith("images/") ? "images/" : "animations/output/";
                const relative = name.slice(prefix.length);
                if (
                    !name.startsWith(prefix) ||
                    !relative ||
                    relative.split(/[\\/]/).includes("..") ||
                    path.isAbsolute(relative)
                ) {
                    failures.push(`${name}: invalid manifest path`);
                    continue;
                }
                const file = path.join(prefix === "images/" ? images : animations, relative);
                try {
                    if ((await stat(file)).size !== expected.bytes) throw new Error("size mismatch");
                    const hash = createHash("sha256");
                    for await (const chunk of createReadStream(file)) hash.update(chunk);
                    if (hash.digest("hex") !== expected.sha256) throw new Error("SHA-256 mismatch");
                } catch (error) {
                    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }),
    );
    if (failures.length) {
        throw new Error(
            `Animation release ${release.version}: ${failures.length} missing or outdated assets.\n` +
                failures.slice(0, 20).join("\n") +
                "\nRestore the pinned assets following ANIMATION_RELEASE.md before building.",
        );
    }
}

if (import.meta.main) {
    await verifyAnimationRelease();
    console.log(`Animation release ${release.version}: ${Object.keys(release.files).length} assets verified.`);
}
