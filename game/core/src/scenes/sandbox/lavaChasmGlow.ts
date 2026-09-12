export const LAVA_CHASM_GLOW_FRAME_WIDTH = 512;
export const LAVA_CHASM_GLOW_FRAME_HEIGHT = 448;
export const LAVA_CHASM_GLOW_FRAME_COUNT = 12;
export const LAVA_CHASM_GLOW_COLUMNS = 4;
export const LAVA_CHASM_GLOW_FPS = 8;

const LAVA_CHASM_GLOW_ATLAS_BY_BACKGROUND: Readonly<Record<string, string>> = Object.freeze({
    background_stone_tiles_sinister_16x16_first_ring_destroyed_aaa_v3: "lava_chasm_glow_narrowing_level_1_atlas",
    background_stone_tiles_sinister_16x16_two_rings_destroyed_aaa_v7: "lava_chasm_glow_narrowing_level_2_atlas",
    background_stone_tiles_sinister_16x16_three_rings_destroyed_aaa_v3: "lava_chasm_glow_narrowing_level_3_atlas",
    background_stone_tiles_sinister_16x16_four_rings_destroyed_aaa_v7: "lava_chasm_glow_narrowing_level_4_atlas",
    background_stone_tiles_sinister_16x16_five_rings_destroyed_aaa_v4: "lava_chasm_glow_narrowing_level_5_atlas",
});

/** Animated chasm art is authored against a specific baked narrowing background. */
export const lavaChasmGlowAtlasKeyForBackground = (backgroundKey: string): string | undefined =>
    LAVA_CHASM_GLOW_ATLAS_BY_BACKGROUND[backgroundKey];

/** Wall-clock playback keeps the ambient loop independent from the quarter-speed simulation clock. */
export const lavaChasmGlowFrameAtTime = (nowSeconds: number): number => {
    if (!Number.isFinite(nowSeconds)) return 0;
    return Math.floor(Math.max(0, nowSeconds) * LAVA_CHASM_GLOW_FPS) % LAVA_CHASM_GLOW_FRAME_COUNT;
};

/** A readable secondary breath reinforces the travelling atlas frames without lighting the whole floor. */
export const lavaChasmGlowAlphaAtTime = (nowSeconds: number): number => {
    const time = Number.isFinite(nowSeconds) ? nowSeconds : 0;
    return 0.75 + Math.sin(time * 2.2) * 0.15 + Math.sin(time * 4.7 + 0.8) * 0.05;
};
