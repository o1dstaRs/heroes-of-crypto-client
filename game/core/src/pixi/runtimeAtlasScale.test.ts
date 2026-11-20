import { expect, test } from "bun:test";

import { isRuntimeHalvedAtlasKey, runtimeAtlasDivider, runtimeHalvedAtlasKeys } from "./runtimeAtlasScale";

test("large-frame creature body clips are halved; effect, portrait and fixed-pixel sheets are not", () => {
    const keys = [...runtimeHalvedAtlasKeys()];
    expect(keys.length).toBeGreaterThan(100);
    expect(isRuntimeHalvedAtlasKey("griffin_lab_idle_atlas")).toBe(true);
    expect(isRuntimeHalvedAtlasKey("hydra_lab_melee_attack_up_atlas")).toBe(true);
    // Arbalester's 384 px idle frames already draw near 1:1.
    expect(isRuntimeHalvedAtlasKey("arbalester_idle_atlas")).toBe(false);
    for (const key of keys) {
        expect(key).toMatch(/_(idle|walk|flight_walk|hit|death|cast|(melee_)?attack(_up|_down)?)_atlas$/);
        expect(key.startsWith("vfx_")).toBe(false);
        expect(key).not.toContain("left_screen");
        expect(/^(leprechaun_lab_|troll_|tsar_cannon)/.test(key)).toBe(false);
    }
});

test("the divider measures halved atlases and keeps suffix variants and fallbacks exact", () => {
    const meta = { atlasWidth: 6144 };
    expect(runtimeAtlasDivider("griffin_lab_idle_atlas", meta, 3072)).toBe(2);
    // A browser without createImageBitmap resizing keeps the full-size sheet.
    expect(runtimeAtlasDivider("griffin_lab_idle_atlas", meta, 6144)).toBe(1);
    expect(runtimeAtlasDivider("griffin_idle_atlas_half", meta, 3072)).toBe(2);
    expect(runtimeAtlasDivider("griffin_idle_atlas_quarter", meta, 1536)).toBe(4);
    // Unlisted sheets, such as single-frame static sprites, never derive a divider from their size.
    expect(runtimeAtlasDivider("static_battlefield_sprite", { atlasWidth: 768 }, 512)).toBe(1);
    // Only an exact half counts; a sheet of any other size keeps the authored frame rectangles.
    expect(runtimeAtlasDivider("griffin_lab_idle_atlas", meta, 4096)).toBe(1);
});
