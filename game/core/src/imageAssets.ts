import { images as generatedImages } from "./generated/image_imports";

/** Project-owned battlefield assets that must survive regeneration of the external image bundle. */
const projectImages = {
    units_overlay_toggle_square_v1: new URL(
        "./assets/ui/units_overlay_toggle_square_v1.png",
        import.meta.url,
    ).toString(),
    chaos_portrait_bg_obsidian_fissure_v1: new URL(
        "./assets/ui/chaos_portrait_bg_obsidian_fissure_v1.webp",
        import.meta.url,
    ).toString(),
    chaos_portrait_bg_obsidian_fissure_corner_fire_v1: new URL(
        "./assets/ui/chaos_portrait_bg_obsidian_fissure_corner_fire_v1.webp",
        import.meta.url,
    ).toString(),
    chaos_portrait_bg_obsidian_fissure_corner_fire_dark10_v1: new URL(
        "./assets/ui/chaos_portrait_bg_obsidian_fissure_corner_fire_dark10_v1.webp",
        import.meta.url,
    ).toString(),
    life_portrait_bg_crowned_shield_v1: new URL(
        "./assets/ui/life_portrait_bg_crowned_shield_v1.webp",
        import.meta.url,
    ).toString(),
    life_portrait_bg_fallen_standard_more_light_v1: new URL(
        "./assets/ui/life_portrait_bg_fallen_standard_more_light_v1.webp",
        import.meta.url,
    ).toString(),
    life_portrait_bg_fallen_standard_v1: new URL(
        "./assets/ui/life_portrait_bg_fallen_standard_v1.webp",
        import.meta.url,
    ).toString(),
    life_portrait_bg_mid_gold_small_crown_v1: new URL(
        "./assets/ui/life_portrait_bg_mid_gold_small_crown_v1.webp",
        import.meta.url,
    ).toString(),
    life_portrait_bg_golden_dawn_v1: new URL(
        "./assets/ui/life_portrait_bg_golden_dawn_v1.webp",
        import.meta.url,
    ).toString(),
    life_portrait_bg_golden_dawn_dim_upper_right_v1: new URL(
        "./assets/ui/life_portrait_bg_golden_dawn_dim_upper_right_v1.webp",
        import.meta.url,
    ).toString(),
    life_portrait_bg_golden_dawn_four_corner_haze_v1: new URL(
        "./assets/ui/life_portrait_bg_golden_dawn_four_corner_haze_v1.webp",
        import.meta.url,
    ).toString(),
    life_portrait_bg_golden_dawn_four_corner_haze_dark10_v1: new URL(
        "./assets/ui/life_portrait_bg_golden_dawn_four_corner_haze_dark10_v1.webp",
        import.meta.url,
    ).toString(),
    life_portrait_bg_sunlit_cuts_v1: new URL(
        "./assets/ui/life_portrait_bg_sunlit_cuts_v1.webp",
        import.meta.url,
    ).toString(),
    nature_portrait_bg_tier_1_2: new URL("./assets/ui/nature_portrait_bg_tier_1_2.webp", import.meta.url).toString(),
    nature_portrait_bg_tier_3_4: new URL("./assets/ui/nature_portrait_bg_tier_3_4.webp", import.meta.url).toString(),
    nature_portrait_bg_xray_leaf_corner_glow_v1: new URL(
        "./assets/ui/nature_portrait_bg_xray_leaf_corner_glow_v1.webp",
        import.meta.url,
    ).toString(),
    nature_portrait_bg_xray_leaf_corner_glow_v2_soft: new URL(
        "./assets/ui/nature_portrait_bg_xray_leaf_corner_glow_v2_soft.webp",
        import.meta.url,
    ).toString(),
    nature_portrait_bg_xray_leaf_corner_glow_v3_deep: new URL(
        "./assets/ui/nature_portrait_bg_xray_leaf_corner_glow_v3_deep.webp",
        import.meta.url,
    ).toString(),
    nature_portrait_bg_claw_scratch_v1: new URL(
        "./assets/ui/nature_portrait_bg_claw_scratch_v1.webp",
        import.meta.url,
    ).toString(),
    might_portrait_bg_shattered_fortress_v1: new URL(
        "./assets/ui/might_portrait_bg_shattered_fortress_v1.webp",
        import.meta.url,
    ).toString(),
    might_portrait_bg_blood_claw_trails_v1: new URL(
        "./assets/ui/might_portrait_bg_blood_claw_trails_v1.webp",
        import.meta.url,
    ).toString(),
    might_portrait_bg_blood_claw_strong_red_corners_v1: new URL(
        "./assets/ui/might_portrait_bg_blood_claw_strong_red_corners_v1.webp",
        import.meta.url,
    ).toString(),
    left_sidebar_valkyrie_hd: new URL("./assets/creatures/left_sidebar_valkyrie_hd.webp", import.meta.url).toString(),
    left_sidebar_peasant_hd: new URL("./assets/creatures/left_sidebar_peasant_hd.webp", import.meta.url).toString(),
    left_sidebar_squire_hd: new URL("./assets/creatures/left_sidebar_squire_hd.webp", import.meta.url).toString(),
    left_sidebar_pikeman_hd: new URL("./assets/creatures/left_sidebar_pikeman_hd.webp", import.meta.url).toString(),
    left_sidebar_healer_hd: new URL("./assets/creatures/left_sidebar_healer_hd.webp", import.meta.url).toString(),
    left_sidebar_battle_mage_hd: new URL(
        "./assets/creatures/left_sidebar_battle_mage_hd.webp",
        import.meta.url,
    ).toString(),
    left_sidebar_elf_hd: new URL("./assets/creatures/left_sidebar_elf_hd.webp", import.meta.url).toString(),
    left_sidebar_nomad_hd: new URL("./assets/creatures/left_sidebar_nomad_hd.webp", import.meta.url).toString(),
    left_sidebar_arbalester_hd: new URL(
        "./assets/creatures/left_sidebar_arbalester_hd.webp",
        import.meta.url,
    ).toString(),
    left_sidebar_blacksmith_hd: new URL(
        "./assets/creatures/left_sidebar_blacksmith_hd.webp",
        import.meta.url,
    ).toString(),
    left_sidebar_fairy_hd: new URL("./assets/creatures/left_sidebar_fairy_hd.webp", import.meta.url).toString(),
    left_sidebar_dryad_hd: new URL("./assets/creatures/left_sidebar_dryad_hd.webp", import.meta.url).toString(),
    left_sidebar_troglodyte_hd: new URL(
        "./assets/creatures/left_sidebar_troglodyte_hd.webp",
        import.meta.url,
    ).toString(),
    left_sidebar_wandering_mage_hd: new URL(
        "./assets/creatures/left_sidebar_wandering_mage_hd.webp",
        import.meta.url,
    ).toString(),
    left_sidebar_centaur_hd: new URL("./assets/creatures/left_sidebar_centaur_hd.webp", import.meta.url).toString(),
    left_sidebar_berserker_hd: new URL("./assets/creatures/left_sidebar_berserker_hd.webp", import.meta.url).toString(),
    left_sidebar_wolf_rider_hd: new URL(
        "./assets/creatures/left_sidebar_wolf_rider_hd.webp",
        import.meta.url,
    ).toString(),
    left_sidebar_mermaid_hd: new URL("./assets/creatures/left_sidebar_mermaid_hd.webp", import.meta.url).toString(),
    troll_board_128: new URL("./assets/creatures/troll_board_128.webp", import.meta.url).toString(),
} as const;

export const images = { ...generatedImages, ...projectImages } as const;

export type ImageKey = keyof typeof images;
