/** Identical sRGB recipes for React portraits and the Pixi roster. Never grade the combined card. */
export const CHAOS_PORTRAIT_BACKGROUND_FILTER = "contrast(0.76) brightness(1.12)";

// CSS contrast, then brightness: lift black to 34/255 without clipping the painted fire to white.
export const CHAOS_PORTRAIT_BACKGROUND_MATRIX = [
    0.8512, 0, 0, 0, 0.1344, 0, 0.8512, 0, 0, 0.1344, 0, 0, 0.8512, 0, 0.1344, 0, 0, 0, 1, 0,
] as const;

/** Olive scales match the battlefield Hydra; alpha, geometry and animation cels remain untouched. */
export const HYDRA_PORTRAIT_SCALE_MATRIX = [
    0.7, 0.15, 0.05, 0, 0, 0.15, 0.7, 0.25, 0, 0, 0.06, 0.1, 0.27, 0, 0, 0, 0, 0, 1, 0,
] as const;

// Warm horns, leather, mouths and cloth keep their source colour. The separate brightness mask
// preserves the luminous blue eye while allowing dim cyan rim light on scales to become green.
export const HYDRA_PORTRAIT_WARM_MASK = [8, -6, -2] as const;
export const HYDRA_PORTRAIT_NON_EMISSIVE_MASK = [0, 0, -4, 0, 2.5] as const;

export type CreaturePortraitArtPalette = "hydra";
export type CreaturePortraitBackgroundTone = "chaos";
