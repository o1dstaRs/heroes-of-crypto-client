import { resolveImagesLocation } from "../src/assetLocations";
import { findGameImageAssetViolations, MAX_STATIC_GAME_IMAGE_BYTES } from "../src/gameImageAssetPolicy";

if (import.meta.main) {
    // Always the configured art source: this gate spent its whole life checking a directory that did
    // not exist, so it reports which directory it read rather than passing quietly.
    const imageDirectory = resolveImagesLocation(process.env, process.argv[2]);

    const violations = await findGameImageAssetViolations(imageDirectory);
    if (violations.length > 0) {
        console.error("Local game image policy failed:");
        for (const violation of violations) {
            console.error(`  - ${violation}`);
        }
        process.exit(1);
    }

    console.log(
        `Local game image policy passed for ${imageDirectory}: ` +
            `WebP-only static images at or below ${MAX_STATIC_GAME_IMAGE_BYTES} bytes.`,
    );
}
