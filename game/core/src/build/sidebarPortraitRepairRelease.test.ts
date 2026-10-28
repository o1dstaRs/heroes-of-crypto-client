import { expect, test } from "bun:test";
import release from "../../animation-release.json";
import archives from "../../asset-release-archives.json";
import catalog from "../ui/sidebarPortraitPages.json";
import type { SidebarPortraitRepair } from "./sidebarPortraitRepair";

test("every repaired portrait and generated page is pinned and portable", () => {
    const files = release.files as Record<string, { bytes: number; sha256: string }>;
    const portable = archives.files as Record<
        string,
        { bytes: number; sha256: string; source: string; archive?: string }
    >;
    for (const animation of Object.values(catalog.animations)) {
        const repair = (animation as typeof animation & { repair?: SidebarPortraitRepair }).repair;
        expect(repair).toBeDefined();
        if (!repair) throw new Error("Missing portrait repair");
        expect(repair.format).toBe("normalized-rgba-replace-v1");
        expect(repair.frameCount).toBeGreaterThanOrEqual(animation.frameCount);
        expect(repair.decodedBytes).toBeLessThanOrEqual(128 * 1024 * 1024);
        expect(files[repair.path]).toEqual({ bytes: repair.bytes, sha256: repair.sha256 });
        const restored = portable[`heroesofcrypto-assets/${repair.path}`];
        expect(restored.bytes).toBe(repair.bytes);
        expect(restored.sha256).toBe(repair.sha256);
        expect(restored.source).toBe("archive");
        expect(archives.archives.some((entry) => entry.file === restored.archive)).toBe(true);
        for (const page of animation.pages) {
            expect(files[page.releasePath]).toEqual({ bytes: page.bytes, sha256: page.sha256 });
            expect(portable[`heroesofcrypto-assets/${page.releasePath}`].source).toBe("generated");
        }
    }
});
