import { resolveImagesLocation } from "../src/assetLocations";
import { findGameImageAssetViolations, MAX_STATIC_GAME_IMAGE_BYTES } from "../src/gameImageAssetPolicy";

if (import.meta.main) {
    // Resolve through the shared helper rather than reading the variable here: it is the one place that
    // states "the art source is always the environment, never a guessed default", trims a copy-pasted
    // path, and refuses a blank one. The merge that brought main's simpler inline check left this file
    // importing the resolver without using it.
    const imageDirectory = resolveImagesLocation(process.env, process.argv[2]);

    const violations = await findGameImageAssetViolations(imageDirectory);
    if (violations.length > 0) {
        console.error("Game image policy failed:");
        for (const violation of violations) {
            console.error(`  - ${violation}`);
        }
        process.exit(1);
    }

    console.log(`Game image policy passed: WebP-only static images at or below ${MAX_STATIC_GAME_IMAGE_BYTES} bytes.`);
}
