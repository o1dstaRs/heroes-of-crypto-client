import path from "node:path";
import { resolveAnimationsOutputLocation, resolveImagesLocation } from "../src/assetLocations";
import { installApprovedAnimationAssets } from "../src/build/approvedAnimationAssets";
import levelOneAssets from "../src/animations/levelOneAssets.json";
import environmentAssets from "../src/animations/battlefieldEnvironmentAssets.json";
import shotTrajectoryAssets from "../src/pixi/shotTrajectoryAssets.json";
const assets = [...levelOneAssets, ...environmentAssets, ...shotTrajectoryAssets];

export function prepareLevelOneAssets(
    destination = path.resolve(import.meta.dir, "../images"),
    { reuseVerifiedInstalled = false } = {},
): void {
    const roots = {
        animation: resolveAnimationsOutputLocation(process.env),
        image: resolveImagesLocation(process.env),
    };
    // Canonical verification remains mandatory for builds. Tests can reuse matching installed bytes
    // without downloading and copying hundreds of megabytes from Drive on every invocation.
    installApprovedAnimationAssets(
        assets as Parameters<typeof installApprovedAnimationAssets>[0],
        destination,
        roots,
        reuseVerifiedInstalled,
    );
    console.log(`Approved level-one animation package: ${assets.length} assets verified and installed.`);
}
if (import.meta.main) prepareLevelOneAssets();
