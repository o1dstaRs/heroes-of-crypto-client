import { describe, expect, test } from "bun:test";
import {
    isProductionOmittedEnvironmentAssetKey,
    isProductionOmittedLegacyUiAssetKey,
} from "./productionImageAssetPolicy";

describe("production environment image policy", () => {
    test("keeps every environment atlas used by the live dungeon", () => {
        for (const key of [
            "lava_center_anim_atlas",
            "fire_pit_variant_1_low_front_fire_overlay_seamless_v2_64_atlas_half",
            "ambient_fire_video_torch_left_natural_v4_64_atlas",
            "ambient_fire_video_torch_right_natural_v4_64_atlas",
        ]) {
            expect(isProductionOmittedEnvironmentAssetKey(key)).toBe(false);
        }
    });

    test("omits superseded and disabled environment experiments", () => {
        for (const key of [
            "fire_pit_unified_front_wide_48_atlas",
            "fire_pit_high_fire_overlay_smooth_64_atlas",
            "ambient_fire_video_torch_left_seamless_v2_64_atlas",
            "background_stone_tiles_sinister_16x16_curbfix_v6",
            "background_test_abyss_underlay_v4",
            "active_turn_blue_fire_atlas",
            "cemetery_obstacles_9x_256_atlas",
            "dungeon_god_rays_v2",
            "dungeon_volumetric_fog_v2",
        ]) {
            expect(isProductionOmittedEnvironmentAssetKey(key)).toBe(true);
        }
    });

    test("does not classify unrelated images", () => {
        expect(isProductionOmittedEnvironmentAssetKey("background_new")).toBe(false);
        expect(isProductionOmittedEnvironmentAssetKey("wolf_512")).toBe(false);
        expect(isProductionOmittedEnvironmentAssetKey("ui_banner_green_soft_wide")).toBe(false);
    });

    test("omits only replaced legacy UI exports", () => {
        for (const key of [
            "book_1024",
            "book_1024_pre",
            "book_1024_previous",
            "ui_banner_green_soft_wide",
            "ui_banner_red_soft_wide",
        ]) {
            expect(isProductionOmittedLegacyUiAssetKey(key)).toBe(true);
        }
        for (const key of [
            "book_1024_clean_pages_v1",
            "ui_close_button_square_gothic_frame_v1",
            "ui_container_frame_1_9slice",
            "ui_container_frame_2_9slice",
            "ui_outer_frame_3_9slice",
        ]) {
            expect(isProductionOmittedLegacyUiAssetKey(key)).toBe(false);
        }
    });
});
