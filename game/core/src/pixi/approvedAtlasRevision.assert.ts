import { expect } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import release from "../../animation-release.json";

/** The authored revision stays pinned; a smaller build copy gets its own content revision. */
export function expectApprovedAtlasRevision(
    image: string,
    source: keyof typeof release.files,
    expectedSourceSha256: string,
): void {
    expect(release.files[source].sha256).toBe(expectedSourceSha256);
    const url = new URL(image);
    const revision = url.searchParams.get("v");
    expect(revision).toMatch(/^[a-f0-9]{16}$/);
    // CI fixtures carry the canonical revision and do not contain private artwork.
    if (revision === expectedSourceSha256.slice(0, 16)) return;
    expect(url.protocol).toBe("file:");
    const encoded = readFileSync(fileURLToPath(url));
    expect(revision).toBe(createHash("sha256").update(encoded).digest("hex").slice(0, 16));
}
