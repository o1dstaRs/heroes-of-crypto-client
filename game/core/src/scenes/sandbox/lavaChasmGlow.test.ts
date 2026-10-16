import { describe, expect, test } from "bun:test";

import {
    LAVA_CHASM_GLOW_FRAME_COUNT,
    LAVA_CHASM_GLOW_FPS,
    lavaChasmGlowAlphaAtTime,
    lavaChasmGlowAtlasKeyForBackground,
    lavaChasmGlowFrameAtTime,
} from "./lavaChasmGlow";

describe("lava chasm glow sprite loop", () => {
    test("selects the atlas matching each baked narrowing painting", () => {
        expect(
            lavaChasmGlowAtlasKeyForBackground("background_stone_tiles_sinister_16x16_first_ring_destroyed_aaa_v3"),
        ).toBe("lava_chasm_glow_narrowing_level_1_atlas");
        expect(
            lavaChasmGlowAtlasKeyForBackground("background_stone_tiles_sinister_16x16_five_rings_destroyed_aaa_v4"),
        ).toBe("lava_chasm_glow_narrowing_level_5_atlas");
        expect(lavaChasmGlowAtlasKeyForBackground("background_new")).toBeUndefined();
    });

    test("loops deterministically on wall-clock time", () => {
        expect(lavaChasmGlowFrameAtTime(0)).toBe(0);
        expect(lavaChasmGlowFrameAtTime(1 / LAVA_CHASM_GLOW_FPS)).toBe(1);
        expect(lavaChasmGlowFrameAtTime(LAVA_CHASM_GLOW_FRAME_COUNT / LAVA_CHASM_GLOW_FPS)).toBe(0);
        expect(lavaChasmGlowFrameAtTime(Number.NaN)).toBe(0);
    });

    test("keeps the additive glow bright without exceeding full opacity", () => {
        const samples = Array.from({ length: 240 }, (_, index) => lavaChasmGlowAlphaAtTime(index / 60));
        expect(Math.min(...samples)).toBeGreaterThan(0.54);
        expect(Math.max(...samples)).toBeLessThan(0.96);
    });
});
