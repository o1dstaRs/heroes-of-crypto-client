/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { stat } from "node:fs/promises";

import { resolveAnimationsOutputLocation, resolveImagesLocation } from "../src/assetLocations";

/**
 * Gate for the shell steps of the image pipeline: `bun scripts/require_asset_location.ts images && ...`.
 *
 * `build:images` deletes `images/` before copying the new set in, so an unset or wrong HOC_IMAGES_LOC
 * destroys the art and leaves nothing behind it — a rollback that exits 0. Failing here, BEFORE the
 * destructive step, is the whole point: the `&&` in the npm script stops the chain.
 *
 * Existence is checked too, not just configuration. A path that points nowhere copies zero files just
 * as quietly as an unset variable does.
 */
const KINDS = {
    images: { resolve: resolveImagesLocation, label: "image" },
    animations: { resolve: resolveAnimationsOutputLocation, label: "animation" },
} as const;

if (import.meta.main) {
    const kind = process.argv[2] as keyof typeof KINDS;
    const selected = KINDS[kind];
    if (!selected) {
        console.error(`Usage: bun scripts/require_asset_location.ts <${Object.keys(KINDS).join("|")}>`);
        process.exit(2);
    }

    let directory: string;
    try {
        directory = selected.resolve(process.env);
    } catch (error) {
        console.error(String(error instanceof Error ? error.message : error));
        process.exit(1);
    }

    try {
        const directoryStat = await stat(directory);
        if (!directoryStat.isDirectory()) {
            console.error(`The configured ${selected.label} location is not a directory: ${directory}`);
            process.exit(1);
        }
    } catch {
        console.error(
            `The configured ${selected.label} location does not exist: ${directory}\n` +
                `Copying from it would leave the art set empty, so the pipeline stops here.`,
        );
        process.exit(1);
    }

    console.log(`Using ${selected.label} source: ${directory}`);
}
