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

import { join } from "node:path";

/**
 * Where the art comes from. ALWAYS the environment variable — there is deliberately no default.
 *
 * OWNER CALL (2026-08-28): the art source is configuration, so it must be stated, never guessed.
 * Every consumer used to guess in the same two ways, and both ways silently destroyed art:
 *
 *   1. A fallback to a sibling `heroesofcrypto-assets` checkout that does not exist on any current
 *      machine. `build:images` runs `rimraf images` BEFORE the copy, so an unset variable deleted the
 *      art set and then copied nothing over it. That is an art rollback with a green exit code — the
 *      failure mode that prompted this rule.
 *   2. Ignoring the variable whenever its path contained "Dropbox", from the era when Dropbox art was
 *      known-nonconforming. The art has since moved to Google Drive, but the exclusion stayed and kept
 *      the image-policy gate pointed at that same missing directory (see the note in
 *      gameImageAssetPolicy.ts: the gate was vacuous for as long as that hack outlived its reason).
 *
 * So: resolve from the environment or throw. A wrong path fails loudly at the first readdir, an unset
 * one fails here, and neither can quietly hand back a stale or empty art set. An explicit command-line
 * argument still wins, because that is a visible, deliberate choice at the call site rather than a
 * guess made on the caller's behalf.
 */

/** Raised when an asset location is neither passed explicitly nor configured in the environment. */
export class MissingAssetLocationError extends Error {
    public constructor(variableName: string, purpose: string) {
        super(
            `${variableName} is not set. It must name the directory holding the ${purpose}; ` +
                `there is deliberately no default, because guessing one has silently rolled the art back before. ` +
                `Example: ${variableName}="$HOME/Google Drive/My Drive/heroesofcrypto/${
                    variableName === "HOC_ANIMATIONS_LOC" ? "animations" : "images"
                }"`,
        );
        this.name = "MissingAssetLocationError";
    }
}

type AssetEnvironment = Record<string, string | undefined>;

const requireLocation = (env: AssetEnvironment, variableName: string, purpose: string, override?: string): string => {
    const explicit = override?.trim();
    if (explicit) {
        return explicit;
    }

    const configured = env[variableName]?.trim();
    if (!configured) {
        throw new MissingAssetLocationError(variableName, purpose);
    }

    return configured;
};

/**
 * The directory holding the shared WebP art set, from HOC_IMAGES_LOC.
 *
 * @param override an explicit path from the command line, which wins over the environment.
 */
export function resolveImagesLocation(env: AssetEnvironment, override?: string): string {
    return requireLocation(env, "HOC_IMAGES_LOC", "shared WebP art set", override);
}

/**
 * The directory holding exported animation atlases, from HOC_ANIMATIONS_LOC.
 *
 * The exports live in an `output` subdirectory of the configured root, so callers get that joined path
 * rather than the root itself — an explicit override, by contrast, is used exactly as given, since the
 * caller has already named the directory they mean.
 */
export function resolveAnimationsOutputLocation(env: AssetEnvironment, override?: string): string {
    const explicit = override?.trim();
    if (explicit) {
        return explicit;
    }

    return join(requireLocation(env, "HOC_ANIMATIONS_LOC", "exported animation atlases", undefined), "output");
}
