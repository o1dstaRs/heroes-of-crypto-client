import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("every pinned runtime image is reproducible from the published restore sources", () => {
    type FilePin = { bytes: number; sha256: string };
    const release = JSON.parse(readFileSync(new URL("../../animation-release.json", import.meta.url), "utf8")) as {
        files: Record<string, FilePin>;
    };
    const restore = JSON.parse(readFileSync(new URL("../../asset-release-archives.json", import.meta.url), "utf8")) as {
        files: Record<string, FilePin & { source: string; path: string }>;
    };
    for (const [name, pin] of Object.entries(release.files)) {
        const record = restore.files["heroesofcrypto-assets/" + name];
        expect(record, name).toBeDefined();
        expect({ bytes: record.bytes, sha256: record.sha256 }, name).toEqual(pin);
        expect(["archive", "drive"], name).toContain(record.source);
    }
    // INTENDED: retirement cleanup removed the old alias. Approved bytes must be restorable
    // from their actual shared filename, without recreating or overwriting a canonical master.
    const floor =
        restore.files["heroesofcrypto-assets/images/background_stone_tiles_sinister_16x16_original_restored.webp"];
    expect(floor.source).toBe("drive");
    expect(floor.path).toBe("images/background_stone_tiles_sinister_16x16_original_restored.webp");
});
