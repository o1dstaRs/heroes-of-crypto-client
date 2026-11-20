import { HALF_BODY_ATLAS_MIN_PSNR, HALF_BODY_ATLAS_RECIPE } from "./halfBodyAtlases";

/**
 * Full-size Q93 copies of the remaining lossless animation atlases.
 *
 * After the half-size body atlases, a cold match still downloaded about 96 MB of lossless sheets that are
 * not halved: frames under 768 px, effect sheets, and the creatures whose helpers slice fixed pixel
 * rectangles (Tsar Cannon, Troll, Leprechaun lab). Re-encoded at the SAME size with the owner-approved
 * recipe they took 48 MB (measured 2026-11-20). Dimensions do not change, so no slicing or shader
 * geometry is affected. Alpha is exact; the same 30 dB floor applies and colour-keyed sheets
 * (COLOUR_THRESHOLD_ATLAS_KEYS) stay lossless.
 */
export const Q93_ATLAS_RECIPE = HALF_BODY_ATLAS_RECIPE;
export const Q93_ATLAS_FOLDER = "q93_atlases_v1";
export const Q93_ATLAS_MIN_PSNR = HALF_BODY_ATLAS_MIN_PSNR;

export interface Q93AtlasDescriptor {
    sourcePath: string;
    sourceSha256: string;
    width: number;
    height: number;
    bytes: number;
    sha256: string;
    releasePath: string;
    psnr: number;
}

export interface Q93AtlasCatalog {
    version: 1;
    recipe: typeof Q93_ATLAS_RECIPE;
    atlases: Record<string, Q93AtlasDescriptor>;
}

/** Same basename as the master, so the flattened image key does not change. */
export const q93AtlasReleasePath = (key: string): string =>
    `animations/output/${Q93_ATLAS_FOLDER}/${key}/atlas/${key}.webp`;

/** Which shipped animation atlases this release re-encodes (everything else keeps its master). */
export function selectQ93AtlasSources(
    releaseFiles: Readonly<Record<string, unknown>>,
    options: {
        replacedByHalf: ReadonlySet<string>;
        colourKeyed: ReadonlySet<string>;
        retired: ReadonlySet<string>;
        isLossless: (releasePath: string) => boolean;
    },
): Map<string, string> {
    const shipped = Object.keys(releaseFiles).filter(
        (name) =>
            /^animations\/output\/.+\/atlas\/[^/]+_atlas(?:_half|_quarter)?\.webp$/.test(name) &&
            !/\/(?:half_body_atlases_v1|q93_atlases_v1|sidebar_portraits_paged_v1)\//.test(name),
    );
    const byBasename = new Map<string, string[]>();
    for (const name of shipped) {
        const base = name.slice(name.lastIndexOf("/") + 1);
        byBasename.set(base, [...(byBasename.get(base) ?? []), name]);
    }
    const selected = new Map<string, string>();
    for (const [base, names] of byBasename) {
        // The copy step flattens by basename; an ambiguous name keeps whichever master it ships today.
        const name = names[0];
        if (names.length !== 1 || name === undefined) continue;
        const key = base.replace(/\.webp$/, "");
        if (options.retired.has(base) || options.replacedByHalf.has(name) || options.colourKeyed.has(key)) continue;
        // Sidebar portrait masters are verified byte for byte by the paged-portrait build.
        if (key.includes("left_screen")) continue;
        if (!options.isLossless(name)) continue;
        selected.set(key, name);
    }
    return selected;
}
