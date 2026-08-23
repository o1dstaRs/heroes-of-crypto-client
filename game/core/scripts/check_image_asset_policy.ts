import path from "node:path";

import { findGameImageAssetViolations, MAX_STATIC_GAME_IMAGE_BYTES } from "../src/gameImageAssetPolicy";

if (import.meta.main) {
    const localImageDirectory = path.resolve(import.meta.dir, "../../../../heroesofcrypto-assets/images");
    const configuredImageDirectory = process.env.HOC_IMAGES_LOC;
    const imageDirectory =
        process.argv[2] ||
        (configuredImageDirectory && !configuredImageDirectory.includes("Dropbox")
            ? configuredImageDirectory
            : localImageDirectory);

    const violations = await findGameImageAssetViolations(imageDirectory);
    if (violations.length > 0) {
        console.error("Local game image policy failed:");
        for (const violation of violations) {
            console.error(`  - ${violation}`);
        }
        process.exit(1);
    }

    console.log(
        `Local game image policy passed: WebP-only static images at or below ${MAX_STATIC_GAME_IMAGE_BYTES} bytes.`,
    );
}
