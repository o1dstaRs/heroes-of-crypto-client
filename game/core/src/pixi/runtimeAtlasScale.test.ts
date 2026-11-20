import { expect, test } from "bun:test";

import { halvedAtlasCandidateKeys, isHalfSizeAtlasKey, runtimeAtlasDivider } from "./runtimeAtlasScale";

test("large-frame creature body clips are halved; effect, portrait and fixed-pixel sheets are not", () => {
    // Halved by the release (halfBodyAtlases.json) or, below its quality floor, by the browser.
    const keys = [...halvedAtlasCandidateKeys()];
    expect(keys.length).toBeGreaterThan(100);
    expect(isHalfSizeAtlasKey("griffin_lab_idle_atlas")).toBe(true);
    expect(isHalfSizeAtlasKey("hydra_lab_melee_attack_up_atlas")).toBe(true);
    // Arbalester's 384 px idle frames already draw near 1:1.
    expect(isHalfSizeAtlasKey("arbalester_idle_atlas")).toBe(false);
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

test("an atlas the release ships at half size is sliced at half and never halved again", async () => {
    const scale = await import("./runtimeAtlasScale");
    const catalog = (await import("./halfBodyAtlases.json")).default as { atlases: Record<string, unknown> };
    const candidates = scale.halvedAtlasCandidateKeys();
    for (const key of Object.keys(catalog.atlases)) {
        // Every catalogued file stands for a known body atlas, and the browser leaves it alone.
        expect(candidates.has(key)).toBe(true);
        expect(scale.isPrebuiltHalfAtlasKey(key)).toBe(true);
        expect(scale.isRuntimeHalvedAtlasKey(key)).toBe(false);
        expect(scale.isHalfSizeAtlasKey(key)).toBe(true);
    }
    // Both halves of the split are body atlases decoded off the main thread, and they never overlap.
    for (const key of scale.runtimeHalvedAtlasKeys()) {
        expect(candidates.has(key)).toBe(true);
        expect(scale.isPrebuiltHalfAtlasKey(key)).toBe(false);
    }
    expect(candidates.size).toBe(scale.runtimeHalvedAtlasKeys().size + Object.keys(catalog.atlases).length);
});
