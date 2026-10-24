import { describe, expect, test } from "bun:test";
import { CreatureVals } from "@heroesofcrypto/common";
import release from "../../animation-release.json";
import { resolveIntegratedArbalesterPortrait } from "./integratedArbalesterPortrait";
import { resolveLeftSidebarPortraitAnimation, withSidebarPortraitPages } from "./leftSidebarPortraitAnimation";
import { resolveSidebarPortraitPages } from "./sidebarPortraitPageSources";
import catalog from "./sidebarPortraitPages.json";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";

describe("streamed sidebar portrait release", () => {
    test("every animated roster portrait has complete native-resolution pages pinned to its approved master", () => {
        const sources = new Set<string>();
        for (const id of Object.keys(UNIT_ID_TO_NAME).map(Number)) {
            const animation = resolveIntegratedArbalesterPortrait(id, resolveLeftSidebarPortraitAnimation(id));
            if (!animation) continue;
            const sourceFile = new URL(animation.src).pathname.split("/").at(-1)!;
            sources.add(sourceFile);
            const manifest = (
                catalog.animations as Record<string, (typeof catalog.animations)[keyof typeof catalog.animations]>
            )[sourceFile];
            expect(manifest, sourceFile).toBeDefined();
            expect(animation.pages?.length, sourceFile).toBe(manifest.pages.length);
            expect(manifest.frameWidth).toBe(animation.meta.frameWidth);
            expect(manifest.frameHeight).toBe(animation.meta.frameHeight);
            expect(manifest.frameCount).toBe(animation.meta.frameCount);
            expect((release.files as Record<string, { sha256: string }>)[manifest.sourcePath].sha256).toBe(
                manifest.sourceSha256,
            );
            let next = 0;
            for (const page of manifest.pages) {
                expect(page.firstFrame).toBe(next);
                expect(page.frameCount).toBeGreaterThan(0);
                expect(page.frameCount).toBeLessThanOrEqual(5);
                expect(page.cols).toBe(page.frameCount);
                expect(page.rows).toBe(1);
                expect(page.sha256).toMatch(/^[a-f0-9]{64}$/);
                expect(page.releasePath.split("/").at(-1)).toBe(`${page.key}.webp`);
                next += page.frameCount;
            }
            expect(next).toBe(animation.meta.frameCount);
        }
        expect(sources.size).toBe(55);
        expect(Object.keys(catalog.animations).sort()).toEqual([...sources].sort());
    });

    test("production content-hashed master URLs retain the page path instead of downloading the full sheet", () => {
        const [sourceFile, manifest] = Object.entries(catalog.animations)[0];
        const source = resolveLeftSidebarPortraitAnimation(CreatureVals.PEASANT)!;
        const animation = withSidebarPortraitPages(
            {
                src: `https://game.example/assets/${sourceFile.replace(".webp", "-k4h9x2.webp")}`,
                meta: {
                    ...source.meta,
                    frameWidth: manifest.frameWidth,
                    frameHeight: manifest.frameHeight,
                    frameCount: manifest.frameCount,
                },
            },
            sourceFile,
        );
        expect(animation.pages?.length).toBe(manifest.pages.length);
        expect(animation.pages?.[0].src).not.toBe(animation.src);
    });

    test("a stale frame contract cannot sample outside its page", () => {
        const [sourceFile, manifest] = Object.entries(catalog.animations)[0];
        expect(
            resolveSidebarPortraitPages(sourceFile, manifest.frameWidth, manifest.frameHeight, manifest.frameCount + 1),
        ).toBeUndefined();
        expect(
            resolveSidebarPortraitPages(sourceFile, manifest.frameWidth + 1, manifest.frameHeight, manifest.frameCount),
        ).toBeUndefined();
        expect(resolveSidebarPortraitPages("unknown_atlas.webp", 572, 808, 100)).toBeUndefined();
    });
});
