import { images } from "../imageAssets";
import catalog from "./sidebarPortraitPages.json";
import type { SidebarPortraitPage } from "./sidebarPortraitPagePool";

interface PageManifest {
    sourceSha256: string;
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    pages: Array<{ key: string; firstFrame: number; frameCount: number; cols: number; rows: number }>;
}

/** A partial or mismatched export keeps the complete-sheet fallback; never sample outside a page. */
export function resolveSidebarPortraitPages(
    sourceFile: string,
    frameWidth: number,
    frameHeight: number,
    frameCount: number,
): readonly SidebarPortraitPage[] | undefined {
    // Use the canonical filename: production URLs contain Vite's content hash in their basename.
    const manifest = (catalog.animations as Record<string, PageManifest>)[sourceFile];
    if (
        !manifest ||
        manifest.frameWidth !== frameWidth ||
        manifest.frameHeight !== frameHeight ||
        manifest.frameCount !== frameCount
    )
        return;
    let firstFrame = 0;
    const pages: SidebarPortraitPage[] = [];
    for (const page of manifest.pages) {
        const url = (images as Record<string, string | undefined>)[page.key];
        if (
            !url ||
            page.firstFrame !== firstFrame ||
            !Number.isInteger(page.frameCount) ||
            page.frameCount < 1 ||
            page.frameCount > 5 ||
            page.cols * page.rows !== page.frameCount
        )
            return;
        pages.push({ src: url, firstFrame, frameCount: page.frameCount, cols: page.cols, rows: page.rows });
        firstFrame += page.frameCount;
    }
    return firstFrame === frameCount ? pages : undefined;
}
