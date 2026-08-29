import { images } from "../generated/image_imports";

const backgroundSurfaceBase = {
    backgroundColor: "transparent",
} as const;

/** Compact queue texture. The WebP itself carries the requested 15% transparency, keeping queue content
 * fully opaque and avoiding a visually ineffective opacity layer over another near-black surface. */
export const upNextSmokyChainsBackgroundLayer = {
    ...backgroundSurfaceBase,
    backgroundImage: `url(${images.ui_up_next_smoky_chains_bg_85pct_v5})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
} as const;

/** Wide 27%-transparent chain artwork over the original semi-transparent dark radial surface. CSS paints
 * the first background first, so the chain panorama is the upper visual layer and the radial is beneath it. */
export const upNextWideSmokyChainsBackgroundSurface = {
    ...backgroundSurfaceBase,
    backgroundImage: `url(${images.ui_up_next_smoky_chains_bg_wide_73pct_v4}), radial-gradient(ellipse at 50% 62%, rgba(0, 0, 0, 0.46) 0%, rgba(0, 0, 0, 0.66) 72%, rgba(0, 0, 0, 0.74) 100%)`,
    backgroundSize: "cover, 100% 100%",
    backgroundPosition: "center, center",
    backgroundRepeat: "no-repeat, no-repeat",
} as const;
