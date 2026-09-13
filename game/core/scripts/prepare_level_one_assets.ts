import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveAnimationsOutputLocation, resolveImagesLocation } from "../src/assetLocations";
import levelOneAssets from "../src/animations/levelOneAssets.json";
import environmentAssets from "../src/animations/battlefieldEnvironmentAssets.json";
const assets = [...levelOneAssets, ...environmentAssets];

export function prepareLevelOneAssets(destination = path.resolve(import.meta.dir, "../images")): void {
    const roots = {
        animation: resolveAnimationsOutputLocation(process.env),
        image: resolveImagesLocation(process.env),
    };
    // Validate the entire package before copying anything. A missing or stale Drive checkout must fail
    // the build instead of silently shipping static fallback creatures again.
    const sources = assets.map((asset) => {
        const source = path.join(roots[asset.kind as keyof typeof roots], asset.path);
        if (!existsSync(source)) throw new Error(`Missing approved animation asset: ${source}`);
        const hash = createHash("sha256").update(readFileSync(source)).digest("hex");
        if (hash !== asset.sha256) throw new Error(`Wrong revision of approved animation asset: ${source}`);
        return { source, destination: path.join(destination, `${asset.key}.webp`) };
    });
    mkdirSync(destination, { recursive: true });
    for (const item of sources)
        if (path.resolve(item.source) !== path.resolve(item.destination)) copyFileSync(item.source, item.destination);
    console.log(`Approved level-one animation package: ${sources.length} assets verified and installed.`);
}
if (import.meta.main) prepareLevelOneAssets();
