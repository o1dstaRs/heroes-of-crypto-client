import path from "node:path";
import { resolveAnimationsOutputLocation, resolveImagesLocation } from "../src/assetLocations";
import { installApprovedAnimationAssets } from "../src/build/approvedAnimationAssets";
import { installHalfBodyAtlases } from "./install_half_body_atlases";
import halfBodyAtlases from "../src/pixi/halfBodyAtlases.json";
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
        (key) => (halfBodyAtlases.atlases as Record<string, { sha256: string } | undefined>)[key]?.sha256,
    );
    // The package verifies and installs masters; ship the pinned half-size copy where the release has one.
    const half = installHalfBodyAtlases(destination, roots.animation, (key) =>
        assets.some((asset) => asset.key === key),
    );
    console.log(
        `Approved level-one animation package: ${assets.length} assets verified and installed` +
            ` (${half.installed} as their half-size release copies).`,
    );
}
if (import.meta.main) prepareLevelOneAssets();
