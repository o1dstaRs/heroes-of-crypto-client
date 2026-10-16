/** The approved pit layers are one map asset group, including the animated fire. */
export const LAVA_PIT_ASSETS = {
    still: "fire_pit_grid_map_palette_v8_512",
    bowl: "fire_pit_dark_bowl_v1_512",
    grate: "fire_pit_grate_burning_exact_v17_512",
    under: "fire_pit_grok_video_fire_under_v2_64_atlas",
    over: "fire_pit_grok_video_fire_over_v2_64_atlas",
    spill: "fire_pit_grok_video_fire_actual_extent_v4_64_atlas",
    extinguished: "fire_pit_extinguished_deep_background_v16_512",
    extinguishedGrate: "fire_pit_grate_burning_charred_v18_512",
} as const;

const assetKeys = new Set<string>(Object.values(LAVA_PIT_ASSETS));
export const isLavaPitAssetKey = (key: string): boolean => assetKeys.has(key);

export const lavaPitTextureKeys = (extinguished: boolean): readonly string[] =>
    extinguished
        ? [LAVA_PIT_ASSETS.extinguished, LAVA_PIT_ASSETS.extinguishedGrate]
        : [
              LAVA_PIT_ASSETS.still,
              LAVA_PIT_ASSETS.bowl,
              LAVA_PIT_ASSETS.grate,
              LAVA_PIT_ASSETS.under,
              LAVA_PIT_ASSETS.over,
              LAVA_PIT_ASSETS.spill,
          ];
