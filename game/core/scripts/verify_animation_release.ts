import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import path from "node:path";

import release from "../animation-release.json";
import { resolveAnimationsOutputLocation, resolveImagesLocation } from "../src/assetLocations";

type AssetManifest = Record<string, { sha256: string; bytes: number }>;

/** Flattened production imports must be reproducible from the published restore package. */
export function verifyProductionImageSources(filenames: readonly string[], files: AssetManifest = release.files): void {
    const declared = new Set(Object.keys(files).map((filename) => path.basename(filename)));
    const missing = filenames.filter((filename) => !declared.has(filename));
    if (missing.length) throw new Error(`Production images missing from animation-release.json: ${missing.join(", ")}`);
}

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
            const buffer = Buffer.allocUnsafe(1024 * 1024);
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
                    const handle = await open(file, "r");
                    try {
                        const before = await handle.stat();
                        if (before.size !== expected.bytes) throw new Error("size mismatch");
                        const hash = createHash("sha256");
                        let position = 0;
                        // Read the known size explicitly. Waiting for a stream's extra EOF read can
                        // stall on mounted Drive files; bounded reads also reject truncated delivery.
                        while (position < expected.bytes) {
                            const { bytesRead } = await handle.read(
                                buffer,
                                0,
                                Math.min(buffer.length, expected.bytes - position),
                                position,
                            );
                            if (bytesRead === 0) throw new Error("incomplete read");
                            hash.update(buffer.subarray(0, bytesRead));
                            position += bytesRead;
                        }
                        const after = await handle.stat();
                        // Cloud hydration can update timestamps without changing the pinned bytes.
                        if (after.size !== before.size) throw new Error("asset changed during verification");
                        if (hash.digest("hex") !== expected.sha256) throw new Error("SHA-256 mismatch");
                    } finally {
                        await handle.close();
                    }
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
