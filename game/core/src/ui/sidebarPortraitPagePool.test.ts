import { afterEach, expect, test } from "bun:test";

import { SidebarPortraitPagePool, type SidebarPortraitPage } from "./sidebarPortraitPagePool";
import type { PortraitImageStub } from "./decodedImageCache";

const cleanups: Array<() => void> = [];
const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};
afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    await flush();
});

const fixture = (idleBytes = 16 * 1024 * 1024) => {
    let now = 0;
    let allowed = true;
    const images: PortraitImageStub[] = [];
    const resolve: Array<() => void> = [];
    const reject: Array<() => void> = [];
    const owners = [{}, {}];
    const pool = new SidebarPortraitPagePool(
        () => {
            let src = "";
            let succeed!: () => void;
            let fail!: () => void;
            const promise = new Promise<void>((yes, no) => {
                succeed = yes;
                fail = () => no(new Error("decode aborted"));
            });
            const image: PortraitImageStub = {
                decoding: "",
                naturalWidth: 2860,
                naturalHeight: 808,
                onload: null,
                onerror: null,
                get src() {
                    return src;
                },
                set src(next: string) {
                    src = next;
                    if (!next) fail();
                },
                decode: () => promise,
            };
            images.push(image);
            resolve.push(succeed);
            reject.push(fail);
            return image;
        },
        () => allowed,
        () => now,
        idleBytes,
    );
    cleanups.push(() => {
        for (const owner of owners) pool.release(owner);
    });
    const pages: SidebarPortraitPage[] = Array.from({ length: 8 }, (_, index) => ({
        src: `page-${index}`,
        firstFrame: index * 5,
        frameCount: 5,
        cols: 5,
        rows: 1,
    }));
    return {
        pool,
        owners,
        pages,
        images,
        allow: (value: boolean) => {
            allowed = value;
        },
        time: (value: number) => {
            now = value;
        },
        finish: async (index: number) => {
            resolve[index]();
            await flush();
        },
        fail: async (index: number) => {
            reject[index]();
            await flush();
        },
    };
};

test("three lookahead pages share one low-priority decoder", async () => {
    const f = fixture();
    f.pool.update(f.owners[0], f.pages.slice(0, 3));
    expect(f.images).toHaveLength(1);
    expect(f.images[0].fetchPriority).toBe("low");
    expect(f.pool.get("page-0")).toBeUndefined();
    await f.finish(0);
    expect(f.pool.get("page-0")).toBe(f.images[0] as unknown as HTMLImageElement);
    expect(f.images).toHaveLength(2);
    await f.finish(1);
    expect(f.images).toHaveLength(3);
    await f.finish(2);
    expect(f.images).toHaveLength(3);
});

test("rapid switching aborts an obsolete download before decoding the new portrait", async () => {
    const f = fixture(0);
    f.pool.update(f.owners[0], [f.pages[0]]);
    f.pool.update(f.owners[0], [f.pages[1]]);
    expect(f.images[0].src).toBe("");
    expect(f.images).toHaveLength(1);
    await flush();
    expect(f.images).toHaveLength(2);
    expect(f.images[1].src).toBe("page-1");
    await f.finish(0);
    expect(f.pool.get("page-0")).toBeUndefined();
    await f.finish(1);
    expect(f.pool.get("page-1")).toBe(f.images[1] as unknown as HTMLImageElement);
});

test("a mounted owner keeps another owner from aborting its shared page", async () => {
    const f = fixture(0);
    f.pool.update(f.owners[0], [f.pages[0]]);
    f.pool.update(f.owners[1], [f.pages[0]]);
    f.pool.release(f.owners[0]);
    expect(f.images[0].src).toBe("page-0");
    expect(f.images).toHaveLength(1);
    await f.finish(0);
    expect(f.pool.get("page-0")).toBe(f.images[0] as unknown as HTMLImageElement);
    f.pool.release(f.owners[1]);
    expect(f.pool.decodedBytes).toBe(0);
    expect(f.images[0].src).toBe("");
});

test("optional pages wait while the selected still portrait is decoding", async () => {
    const f = fixture();
    f.allow(false);
    f.pool.update(f.owners[0], [f.pages[0]]);
    expect(f.images).toHaveLength(0);
    f.allow(true);
    f.pool.update(f.owners[0], [f.pages[0]]);
    expect(f.images).toHaveLength(1);
    await f.finish(0);
});

test("sliding playback and repeated unit swaps keep decoded inactive pages under the byte budget", async () => {
    const f = fixture();
    const pageBytes = 2860 * 808 * 4;
    f.pool.update(f.owners[0], f.pages.slice(0, 3));
    for (let index = 0; index < 3; index++) await f.finish(index);
    expect(f.pool.decodedBytes).toBe(pageBytes * 3);
    f.time(1);
    f.pool.update(f.owners[0], f.pages.slice(3, 6));
    for (let index = 3; index < 6; index++) await f.finish(index);
    expect(f.pool.decodedBytes).toBeLessThanOrEqual(pageBytes * 3 + 16 * 1024 * 1024);
    f.pool.release(f.owners[0]);
    expect(f.pool.decodedBytes).toBeLessThanOrEqual(16 * 1024 * 1024);
    f.pool.update(f.owners[0], [f.pages[5]]);
    expect(f.images).toHaveLength(6);
    expect(f.pool.get("page-5")).toBeDefined();
});

test("failed pages retry with a delay without flooding decode requests", async () => {
    const f = fixture();
    f.pool.update(f.owners[0], [f.pages[0]]);
    await f.fail(0);
    for (let i = 0; i < 30; i++) f.pool.update(f.owners[0], [f.pages[0]]);
    expect(f.images).toHaveLength(1);
    f.time(2001);
    f.pool.update(f.owners[0], [f.pages[0]]);
    expect(f.images).toHaveLength(2);
    await f.finish(1);
    expect(f.pool.get("page-0")).toBeDefined();
});
