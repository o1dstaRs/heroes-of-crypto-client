import { describe, expect, test } from "bun:test";
import { BufferImageSource, Texture } from "pixi.js";
import {
    ArbalesterIdlePager,
    ArbalesterIdlePagePool,
    arbalesterIdlePages,
    type ArbalesterIdlePage,
    type ArbalesterIdlePages,
    type ArbalesterPageResource,
} from "./ArbalesterIdlePager";

const flush = async () => {
    for (let tick = 0; tick < 12; tick++) await Promise.resolve();
};
const format: ArbalesterIdlePages = {
    frameWidth: 384,
    frameHeight: 384,
    frameCount: 1354,
    durations: Array(1354).fill(20),
    pages: Array.from({ length: 22 }, (_, index) => ({
        imageKey: `arbalester_idle_page_${String(index).padStart(2, "0")}_atlas`,
        firstFrame: index * 64,
        frameCount: Math.min(64, 1354 - index * 64),
        cols: 8,
        rows: index === 21 ? 2 : 8,
        width: 3072,
        height: index === 21 ? 768 : 3072,
    })),
};
const resource = (page: ArbalesterIdlePage, unloaded: string[]): ArbalesterPageResource => ({
    frames: Array.from(
        { length: page.frameCount },
        () =>
            new Texture({
                source: new BufferImageSource({ resource: new Uint8Array(4), width: 384, height: 384 }),
            }),
    ),
    async unload() {
        unloaded.push(page.imageKey);
    },
});

describe("native Arbalester idle pages", () => {
    test("validates complete native manifests, dimensions, ordering and durations", () => {
        const meta = { ...format, frameDurationsMs: format.durations };
        expect(arbalesterIdlePages(meta)).toEqual(format);
        expect(arbalesterIdlePages({ ...meta, frameWidth: 96 })).toBeUndefined();
        expect(arbalesterIdlePages({ ...meta, pages: format.pages.slice(1) })).toBeUndefined();
        expect(arbalesterIdlePages({ ...meta, frameDurationsMs: [20] })).toBeUndefined();
        expect(
            arbalesterIdlePages({ ...meta, pages: [{ ...format.pages[0], width: 1 }, ...format.pages.slice(1)] }),
        ).toBeUndefined();
        expect(arbalesterIdlePages({ ...meta, pages: undefined })).toBeUndefined();
    });

    test("preserves all 1354 exposures, exact page boundaries, the final short page and the loop seam", async () => {
        const unloaded: string[] = [];
        const pool = new ArbalesterIdlePagePool(async (page) => resource(page, unloaded));
        const pager = new ArbalesterIdlePager(format, pool);
        for (let frame = 0; frame < 1354; frame++) {
            expect(pager.frameIndex(frame * 20)).toBe(frame);
            expect(pager.frameIndex(frame * 20 + 19.9)).toBe(frame);
        }
        expect(pager.frameIndex(27080)).toBe(0);
        expect(pager.frameIndex(-20)).toBe(0);
        await flush();
        let displayed = -1;
        expect(
            pager.showFrame(1280, (texture, index) => {
                expect(texture.width).toBe(384);
                expect(texture.height).toBe(384);
                displayed = index;
            }),
        ).toBe(true);
        expect(displayed).toBe(64);
        pager.showFrame(27079, () => {});
        await flush();
        expect(
            pager.showFrame(27079, (_texture, index) => {
                displayed = index;
            }),
        ).toBe(true);
        expect(displayed).toBe(1353);
        expect(
            pager.showFrame(27080, (_texture, index) => {
                displayed = index;
            }),
        ).toBe(true);
        expect(displayed).toBe(0);
        pager.dispose();
        await flush();
    });

    test("prefetches only next and releases prior pages after the replacement is displayed", async () => {
        const loaded: string[] = [];
        const unloaded: string[] = [];
        let finish!: (value: ArbalesterPageResource) => void;
        const pool = new ArbalesterIdlePagePool(async (page) => {
            loaded.push(page.imageKey);
            if (page.firstFrame === 128)
                return new Promise((resolve) => {
                    finish = resolve;
                });
            return resource(page, unloaded);
        });
        const pager = new ArbalesterIdlePager(format, pool);
        await flush();
        expect(loaded).toEqual(format.pages.slice(0, 2).map((page) => page.imageKey));
        pager.showFrame(0, () => {});
        pager.showFrame(1280, () => {
            expect(unloaded).not.toContain(format.pages[0].imageKey);
        });
        await flush();
        expect(unloaded).toContain(format.pages[0].imageKey);
        expect(
            pager.showFrame(2560, () => {
                throw new Error("not decoded");
            }),
        ).toBe(false);
        await flush();
        expect(unloaded).not.toContain(format.pages[1].imageKey);
        finish(resource(format.pages[2], unloaded));
        await flush();
        expect(
            pager.showFrame(2560, () => {
                expect(unloaded).not.toContain(format.pages[1].imageKey);
            }),
        ).toBe(true);
        await flush();
        expect(unloaded).toContain(format.pages[1].imageKey);
        pager.dispose();
        await flush();
        expect(new Set(unloaded)).toEqual(new Set(loaded));
    });

    test("shares pages between stacks and releases late decodes after all owners leave", async () => {
        const loaded: string[] = [];
        const unloaded: string[] = [];
        const completions: Array<() => void> = [];
        const pool = new ArbalesterIdlePagePool((page) => {
            loaded.push(page.imageKey);
            return new Promise((resolve) => completions.push(() => resolve(resource(page, unloaded))));
        });
        const first = new ArbalesterIdlePager(format, pool);
        const second = new ArbalesterIdlePager(format, pool);
        await flush();
        expect(loaded).toHaveLength(2);
        first.dispose();
        completions.forEach((complete) => complete());
        await flush();
        expect(unloaded).toHaveLength(0);
        expect(second.showFrame(0, () => {})).toBe(true);
        second.dispose();
        await flush();
        expect(unloaded).toHaveLength(2);
        const late = new ArbalesterIdlePager(format, pool);
        await flush();
        late.dispose();
        completions.slice(2).forEach((complete) => complete());
        await flush();
        expect(unloaded).toHaveLength(4);
        expect(
            late.showFrame(0, () => {
                throw new Error("disposed");
            }),
        ).toBe(false);
    });

    test("backs off errors and safely reloads a page reclaimed during asynchronous unload", async () => {
        let now = 0;
        let attempts = 0;
        let finishUnload!: () => void;
        const onePage = {
            ...format,
            frameCount: 64,
            durations: format.durations.slice(0, 64),
            pages: format.pages.slice(0, 1),
        };
        const pool = new ArbalesterIdlePagePool(
            async (page) => {
                if (++attempts === 1) throw new Error("temporary decode failure");
                return {
                    ...resource(page, []),
                    unload: () =>
                        new Promise<void>((resolve) => {
                            finishUnload = resolve;
                        }),
                };
            },
            () => now,
        );
        const first = new ArbalesterIdlePager(onePage, pool);
        await flush();
        expect(first.showFrame(0, () => {})).toBe(false);
        await flush();
        expect(attempts).toBe(1);
        now = 1000;
        first.showFrame(0, () => {});
        await flush();
        expect(first.showFrame(0, () => {})).toBe(true);
        first.dispose();
        await flush();
        const second = new ArbalesterIdlePager(onePage, pool);
        expect(second.showFrame(0, () => {})).toBe(false);
        expect(attempts).toBe(2);
        finishUnload();
        await flush();
        expect(attempts).toBe(3);
        expect(second.showFrame(0, () => {})).toBe(true);
        second.dispose();
        await flush();
        finishUnload();
        await flush();
    });
});
