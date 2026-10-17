import { expect, test } from "bun:test";
import { sidebarPageLayout, sidebarPageQuality } from "../build/sidebarPortraitPages";
import { verifySidebarPortraitPages } from "../build/verifySidebarPortraitPages";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test.each([
    { frames: 100, cols: 10 },
    { frames: 98, cols: 10 },
    { frames: 60, cols: 10 },
    { frames: 34, cols: 6 },
])("pages preserve all $frames authored frames and source-row boundaries", ({ frames, cols }) => {
    const pages = sidebarPageLayout(frames, cols);
    expect(pages.flatMap((page) => Array.from({ length: page.frameCount }, (_, i) => page.firstFrame + i))).toEqual(
        Array.from({ length: frames }, (_, i) => i),
    );
    for (const page of pages) {
        expect(page.frameCount).toBeLessThanOrEqual(5);
        expect(page.sourceCol + page.frameCount).toBeLessThanOrEqual(cols);
        expect(page.firstFrame).toBe(page.sourceRow * cols + page.sourceCol);
    }
});

test("page quality ignores invisible RGB but rejects alpha changes", () => {
    const source = Buffer.from([255, 0, 0, 0, 150, 120, 90, 255]);
    const actual = Buffer.from([0, 255, 0, 0, 150, 120, 90, 255]);
    expect(sidebarPageQuality(source, actual)).toEqual({ alphaExact: true, psnr: Infinity });
    actual[3] = 1;
    expect(sidebarPageQuality(source, actual).alphaExact).toBe(false);
    actual[3] = 0;
    actual[4] = 0;
    expect(sidebarPageQuality(source, actual).psnr).toBeLessThan(40);
});

test("invalid atlas geometry is rejected before publishing pages", () => {
    expect(() => sidebarPageLayout(0, 10)).toThrow();
    expect(() => sidebarPageLayout(10, 0)).toThrow();
    expect(() => sidebarPageLayout(5.5, 10)).toThrow();
    expect(() => sidebarPageQuality(Buffer.alloc(4), Buffer.alloc(8))).toThrow();
});

test("production rejects missing pages and same-size stale bytes before enabling streaming", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "hoc-portrait-pages-"));
    const bytes = Buffer.from("approved page bytes");
    const record = {
        key: "portrait_page_00_atlas",
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    try {
        await writeFile(path.join(directory, `${record.key}.webp`), bytes);
        await verifySidebarPortraitPages(directory, [record]);
        await writeFile(path.join(directory, `${record.key}.webp`), Buffer.alloc(bytes.length));
        await expect(verifySidebarPortraitPages(directory, [record])).rejects.toThrow("Missing or stale");
        await rm(path.join(directory, `${record.key}.webp`));
        await expect(verifySidebarPortraitPages(directory, [record])).rejects.toThrow("Missing or stale");
        await expect(verifySidebarPortraitPages(directory, [])).rejects.toThrow("catalog is empty");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
