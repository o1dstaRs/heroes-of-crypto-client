import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

interface ApprovedAnimationAsset {
    key: string;
    kind: "animation" | "image";
    path: string;
    sha256: string;
}

/** Test runs may reuse approved local bytes; release builds always verify their canonical sources. */
export function installApprovedAnimationAssets(
    assets: readonly ApprovedAnimationAsset[],
    destination: string,
    roots: Record<ApprovedAnimationAsset["kind"], string>,
    reuseVerifiedInstalled = false,
): void {
    const sha256 = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");
    // Validate the entire package before copying anything, including when only part needs repairing.
    const sources = assets.map((asset) => {
        const installed = path.join(destination, `${asset.key}.webp`);
        if (reuseVerifiedInstalled && existsSync(installed) && sha256(installed) === asset.sha256) {
            return { source: installed, destination: installed };
        }
        const source = path.join(roots[asset.kind], asset.path);
        if (!existsSync(source)) throw new Error(`Missing approved animation asset: ${source}`);
        if (sha256(source) !== asset.sha256) throw new Error(`Wrong revision of approved animation asset: ${source}`);
        return { source, destination: installed };
    });
    mkdirSync(destination, { recursive: true });
    for (const item of sources) {
        if (path.resolve(item.source) !== path.resolve(item.destination)) copyFileSync(item.source, item.destination);
    }
}
