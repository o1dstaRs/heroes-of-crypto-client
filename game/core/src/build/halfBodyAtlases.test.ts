import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import catalog from "../pixi/halfBodyAtlases.json";
import { HALF_BODY_ATLAS_MIN_PSNR, HALF_BODY_ATLAS_RECIPE, halfBodyAtlasReleasePath } from "./halfBodyAtlases";

type Pin = { bytes: number; sha256: string };
const release = JSON.parse(readFileSync(new URL("../../animation-release.json", import.meta.url), "utf8")) as {
    files: Record<string, Pin>;
};
const restore = JSON.parse(readFileSync(new URL("../../asset-release-archives.json", import.meta.url), "utf8")) as {
    files: Record<string, Pin & { source: string; path: string }>;
};

test("every shipped half-size body atlas is pinned, restorable and derived from an approved master", () => {
    expect(catalog.recipe).toEqual(HALF_BODY_ATLAS_RECIPE);
    for (const [key, atlas] of Object.entries(catalog.atlases)) {
        // Same basename as the master: the flattened image key, and every caller, stay unchanged.
        expect(atlas.releasePath, key).toBe(halfBodyAtlasReleasePath(key));
        expect(atlas.sourcePath.endsWith(`/atlas/${key}.webp`), key).toBe(true);
        expect(atlas.psnr, key).toBeGreaterThanOrEqual(HALF_BODY_ATLAS_MIN_PSNR);
        // The master it was derived from is still the approved release copy.
        expect(release.files[atlas.sourcePath]?.sha256, key).toBe(atlas.sourceSha256);
        // The derived file is pinned like art and restored from its exact shared Drive path.
        expect(release.files[atlas.releasePath], key).toEqual({ sha256: atlas.sha256, bytes: atlas.bytes });
        const record = restore.files[`heroesofcrypto-assets/${atlas.releasePath}`];
        expect(record, key).toEqual({
            sha256: atlas.sha256,
            bytes: atlas.bytes,
            source: "drive",
            path: atlas.releasePath,
        });
    }
    // Nothing stale: every pinned derived file still has its catalog entry.
    const pinned = Object.keys(release.files).filter((name) => name.includes("/half_body_atlases_v1/"));
    expect(pinned.sort()).toEqual(
        Object.values(catalog.atlases)
            .map((atlas) => atlas.releasePath)
            .sort(),
    );
});
