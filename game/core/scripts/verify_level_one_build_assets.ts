import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import levelOneAssets from "../src/animations/levelOneAssets.json";
import environmentAssets from "../src/animations/battlefieldEnvironmentAssets.json";
import shotTrajectoryAssets from "../src/pixi/shotTrajectoryAssets.json";
const assets = [...levelOneAssets, ...environmentAssets, ...shotTrajectoryAssets];
import { shouldPreloadUnitAnimationAtlas } from "../src/pixi/creatureAnimationSettings";

export function verifyLevelOneBuildAssets(): void {
    const mapPath = path.resolve(import.meta.dir, "../src/generated/image_imports.ts");
    const map = readFileSync(mapPath, "utf8");
    if (map.includes("/* CI stub") && process.env.CI === "true") {
        console.log("CI asset stubs: this build is for code checks only and cannot be deployed.");
        return;
    }
    if (map.includes("/* CI stub")) throw new Error("Cannot release a build made with CI image stubs.");
    const imageObject = map.slice(map.indexOf("export const images"));
    for (const asset of assets) {
        const file = path.resolve(import.meta.dir, "../images", `${asset.key}.webp`);
        const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
        if (hash !== asset.sha256) throw new Error(`Stale level-one animation: ${asset.key}. Run build:images.`);
        if (
            (shouldPreloadUnitAnimationAtlas(asset.key, false) ||
                /^arbalester_idle_page_\d{2}_atlas$/.test(asset.key) ||
                asset.kind === "image" ||
                environmentAssets.some((item) => item.key === asset.key)) &&
            !imageObject.includes(`"${asset.key}"`)
        ) {
            throw new Error(`Animation missing from generated image map: ${asset.key}. Run build:images.`);
        }
    }
    console.log(`Release animation guard passed: ${assets.length} pinned assets.`);
}
