import { SIDEBAR_PAGE_RECIPE } from "./sidebarPortraitPages";

/**
 * Pre-halved creature body atlases.
 *
 * The runtime halves large body atlases before GPU upload (`pixi/runtimeAtlasScale.ts`), so players
 * downloaded four times the pixels they display: a cold match fetched about 300 MB of lossless sheets,
 * 195 MB of them halved on arrival (measured 2026-11-20). The release now ships each such atlas already
 * halved (Lanczos-3) and encoded with the sidebar-page recipe — 195 MB became 24 MB for that match.
 *
 * Alpha is exact. Colour is lossy WebP (4:2:0), measured 32–39 dB against a lossless half on the
 * largest sheets and judged by the owner indistinguishable at board scale (2026-11-20). The gate below
 * guards against a regression of that judgement, not against WebP's chroma ceiling.
 */
export const HALF_BODY_ATLAS_RECIPE = SIDEBAR_PAGE_RECIPE;
export const HALF_BODY_ATLAS_FOLDER = "half_body_atlases_v1";
export const HALF_BODY_ATLAS_MIN_PSNR = 30;

export interface HalfBodyAtlasDescriptor {
    /** The approved full-size master this file was derived from. */
    sourcePath: string;
    sourceSha256: string;
    width: number;
    height: number;
    bytes: number;
    sha256: string;
    /** Where the release keeps the derived file, relative to the asset root. */
    releasePath: string;
    psnr: number;
}

export interface HalfBodyAtlasCatalog {
    version: 1;
    recipe: typeof HALF_BODY_ATLAS_RECIPE;
    atlases: Record<string, HalfBodyAtlasDescriptor>;
}

/** The derived file keeps the master's basename, so the flattened image key is unchanged. */
export const halfBodyAtlasReleasePath = (key: string): string =>
    `animations/output/${HALF_BODY_ATLAS_FOLDER}/${key}/atlas/${key}.webp`;
