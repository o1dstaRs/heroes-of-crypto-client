import { findGameImageAssetViolations, MAX_STATIC_GAME_IMAGE_BYTES } from "../src/gameImageAssetPolicy";

if (import.meta.main) {
    const imageDirectory = process.argv[2] || process.env.HOC_IMAGES_LOC;

    if (!imageDirectory) {
        console.error("Set HOC_IMAGES_LOC or pass the Dropbox image directory as the first argument.");
        process.exit(2);
    }

    const violations = await findGameImageAssetViolations(imageDirectory);
    if (violations.length > 0) {
        console.error("Dropbox game image policy failed:");
        for (const violation of violations) {
            console.error(`  - ${violation}`);
        }
        process.exit(1);
    }

    console.log(
        `Dropbox game image policy passed: WebP-only static images at or below ${MAX_STATIC_GAME_IMAGE_BYTES} bytes.`,
    );
}
