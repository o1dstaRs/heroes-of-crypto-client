import { expect, test } from "bun:test";

import { selectQ93AtlasSources } from "./q93Atlases";

test("only unambiguous, lossless, shipped animation atlases are re-encoded", () => {
    const files = {
        "animations/output/a/atlas/a_walk_atlas.webp": {},
        "animations/output/b/atlas/b_walk_atlas.webp": {},
        "animations/output/c/atlas/c_idle_atlas_quarter.webp": {},
        "animations/output/d/atlas/dup_atlas.webp": {},
        "animations/output/e/atlas/dup_atlas.webp": {},
        "animations/output/f/atlas/f_left_screen_idle_atlas.webp": {},
        "animations/output/g/atlas/g_walk_atlas.webp": {},
        "animations/output/h/atlas/h_hit_atlas.webp": {},
        "animations/output/i/atlas/i_retired_atlas.webp": {},
        "animations/output/half_body_atlases_v1/a_walk_atlas/atlas/a_walk_atlas.webp": {},
        "animations/output/a/a_walk_meta.json": {},
        "images/static_256.webp": {},
    };
    const selected = selectQ93AtlasSources(files, {
        replacedByHalf: new Set(["animations/output/a/atlas/a_walk_atlas.webp"]),
        colourKeyed: new Set(["g_walk_atlas"]),
        retired: new Set(["i_retired_atlas.webp"]),
        isLossless: (name) => !name.includes("/h/"),
    });
    expect([...selected.entries()].sort()).toEqual([
        ["b_walk_atlas", "animations/output/b/atlas/b_walk_atlas.webp"],
        ["c_idle_atlas_quarter", "animations/output/c/atlas/c_idle_atlas_quarter.webp"],
    ]);
});

test("every full-size Q93 copy is pinned, restorable and never overlaps a half-size copy", async () => {
    const { readFileSync } = await import("node:fs");
    const catalog = (await import("../pixi/q93Atlases.json")).default;
    const half = (await import("../pixi/halfBodyAtlases.json")).default;
    const { COLOUR_THRESHOLD_ATLAS_KEYS } = await import("./halfBodyAtlases");
    const { Q93_ATLAS_MIN_PSNR, Q93_ATLAS_RECIPE, q93AtlasReleasePath } = await import("./q93Atlases");
    type Pin = { bytes: number; sha256: string };
    const release = JSON.parse(readFileSync(new URL("../../animation-release.json", import.meta.url), "utf8")) as {
        files: Record<string, Pin>;
    };
    const restore = JSON.parse(readFileSync(new URL("../../asset-release-archives.json", import.meta.url), "utf8")) as {
        files: Record<string, Pin & { source: string; path: string }>;
    };
    expect(catalog.recipe).toEqual(Q93_ATLAS_RECIPE);
    const atlases = catalog.atlases as Record<
        string,
        { releasePath: string; sourcePath: string; sourceSha256: string; sha256: string; bytes: number; psnr: number }
    >;
    for (const [key, atlas] of Object.entries(atlases)) {
        expect(key in half.atlases, key).toBe(false);
        expect(COLOUR_THRESHOLD_ATLAS_KEYS.has(key), key).toBe(false);
        expect(atlas.releasePath, key).toBe(q93AtlasReleasePath(key));
        expect(atlas.sourcePath.endsWith(`/atlas/${key}.webp`), key).toBe(true);
        expect(atlas.psnr, key).toBeGreaterThanOrEqual(Q93_ATLAS_MIN_PSNR);
        expect(release.files[atlas.sourcePath]?.sha256, key).toBe(atlas.sourceSha256);
        expect(release.files[atlas.releasePath], key).toEqual({ sha256: atlas.sha256, bytes: atlas.bytes });
        expect(restore.files[`heroesofcrypto-assets/${atlas.releasePath}`], key).toEqual({
            sha256: atlas.sha256,
            bytes: atlas.bytes,
            source: "drive",
            path: atlas.releasePath,
        });
    }
    const pinned = Object.keys(release.files).filter((name) => name.includes("/q93_atlases_v1/"));
    expect(pinned.sort()).toEqual(
        Object.values(atlases)
            .map((atlas) => atlas.releasePath)
            .sort(),
    );
});
