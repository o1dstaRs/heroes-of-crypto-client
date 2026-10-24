import { afterEach, expect, mock, spyOn, test } from "bun:test";

import { playPagedSidebarAtlas, sidebarPageWindow, type PagedSidebarAtlas } from "./pagedSidebarAtlasCanvas";
import type { SidebarPortraitPagePool } from "../sidebarPortraitPagePool";

const globals = new Map(
    ["window", "document", "ResizeObserver"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);
afterEach(() => {
    mock.restore();
    for (const [name, value] of globals) {
        if (value) Object.defineProperty(globalThis, name, value);
        else Reflect.deleteProperty(globalThis, name);
    }
});
const format: PagedSidebarAtlas = {
    frameWidth: 572,
    frameHeight: 808,
    fps: 10,
    pages: Array.from({ length: 4 }, (_, index) => ({
        src: `page-${index}`,
        firstFrame: index * 5,
        frameCount: 5,
        cols: 5,
        rows: 1,
    })),
};
const loop = { frameForElapsed: (elapsed: number) => Math.floor(elapsed / 100) % 20 };

const fixture = (density = 3) => {
    let now = 0;
    let id = 0;
    let hidden = false;
    let resize = () => {};
    spyOn(performance, "now").mockImplementation(() => now);
    const frames = new Map<number, FrameRequestCallback>();
    const timers = new Map<number, { fn: () => void; delay: number }>();
    const visibility = new Set<() => void>();
    const images = new Map<string, HTMLImageElement>();
    const context = { clearRect: mock(() => {}), drawImage: mock((..._args: unknown[]) => {}) };
    const canvas = {
        dataset: {} as Record<string, string>,
        width: 300,
        height: 150,
        clientWidth: 286,
        clientHeight: 404,
        getContext: () => context,
    };
    const pool = { update: mock(() => {}), release: mock(() => {}), get: (src: string) => images.get(src) };
    const first = mock(() => {});
    const disconnect = mock(() => {});
    Object.defineProperties(globalThis, {
        window: {
            configurable: true,
            value: {
                devicePixelRatio: density,
                requestAnimationFrame: (fn: FrameRequestCallback) => {
                    const handle = ++id;
                    frames.set(handle, fn);
                    return handle;
                },
                cancelAnimationFrame: (handle: number) => frames.delete(handle),
                setTimeout: (fn: () => void, delay: number) => {
                    const handle = ++id;
                    timers.set(handle, { fn, delay });
                    return handle;
                },
                clearTimeout: (handle: number) => timers.delete(handle),
            },
        },
        document: {
            configurable: true,
            value: {
                get hidden() {
                    return hidden;
                },
                addEventListener: (_name: string, fn: () => void) => visibility.add(fn),
                removeEventListener: (_name: string, fn: () => void) => visibility.delete(fn),
            },
        },
        ResizeObserver: {
            configurable: true,
            value: class {
                public constructor(fn: () => void) {
                    resize = fn;
                }
                public observe() {}
                public disconnect = disconnect;
            },
        },
    });
    const start = () =>
        playPagedSidebarAtlas(
            canvas as unknown as HTMLCanvasElement,
            format,
            loop,
            first,
            pool as unknown as SidebarPortraitPagePool,
        )!;
    return {
        canvas,
        context,
        pool,
        first,
        frames,
        timers,
        disconnect,
        visibility,
        start,
        load: (index: number) =>
            images.set(`page-${index}`, { naturalWidth: 2860, naturalHeight: 808 } as HTMLImageElement),
        timer: () => {
            const entry = timers.entries().next().value!;
            timers.delete(entry[0]);
            now += entry[1].delay;
            entry[1].fn();
        },
        tick: (time: number) => {
            now = time;
            const callbacks = [...frames.values()];
            frames.clear();
            for (const fn of callbacks) fn(time);
        },
        resize: () => resize(),
        hide: (value: boolean, time = now) => {
            hidden = value;
            now = time;
            for (const fn of visibility) fn();
        },
    };
};

test("fast selection changes cancel the settling timer before any optional page is requested", () => {
    const f = fixture();
    const stop = f.start();
    expect(f.pool.update).not.toHaveBeenCalled();
    expect(f.timers.size).toBe(1);
    stop();
    expect(f.timers.size).toBe(0);
    expect(f.frames.size).toBe(0);
    expect(f.pool.update).not.toHaveBeenCalled();
    expect(f.pool.release).toHaveBeenCalledTimes(1);
});

test("the still remains until a decoded first page is painted, with no React-driven frame loop", () => {
    const f = fixture();
    const stop = f.start();
    f.timer();
    expect(f.pool.update).toHaveBeenCalledTimes(1);
    expect(f.context.drawImage).not.toHaveBeenCalled();
    expect(f.first).not.toHaveBeenCalled();
    f.load(0);
    f.tick(136);
    expect(f.first).toHaveBeenCalledTimes(1);
    expect(f.context.drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 572, 808, 0, 0, 572, 808]);
    f.tick(152);
    expect(f.context.drawImage).toHaveBeenCalledTimes(1);
    f.tick(236);
    expect(f.context.drawImage.mock.calls[1].slice(1)).toEqual([572, 0, 572, 808, 0, 0, 572, 808]);
    expect(f.first).toHaveBeenCalledTimes(1);
    stop();
});

test("an unloaded boundary holds the last cel and resumes without clearing or skipping its first frame", () => {
    const f = fixture();
    f.load(0);
    const stop = f.start();
    f.timer();
    for (const time of [220, 320, 420, 520]) f.tick(time);
    expect(f.context.drawImage).toHaveBeenCalledTimes(5);
    f.tick(620);
    f.tick(720);
    expect(f.context.clearRect).toHaveBeenCalledTimes(5);
    f.load(1);
    f.tick(736);
    f.tick(820);
    expect(f.context.drawImage).toHaveBeenCalledTimes(6);
    expect(f.context.drawImage.mock.calls.at(-1)!.slice(1)).toEqual([0, 0, 572, 808, 0, 0, 572, 808]);
    stop();
});

test("hidden tabs release page work and resume the held phase rather than fast-forwarding", () => {
    const f = fixture();
    f.load(0);
    const stop = f.start();
    f.timer();
    f.tick(220);
    f.hide(true, 5000);
    expect(f.frames.size).toBe(0);
    expect(f.pool.release).toHaveBeenCalledTimes(1);
    f.hide(false, 10000);
    f.timer();
    f.tick(10016);
    expect(f.context.drawImage).toHaveBeenCalledTimes(2);
    f.tick(10100);
    expect(f.context.drawImage).toHaveBeenCalledTimes(3);
    stop();
    expect(f.disconnect).toHaveBeenCalledTimes(1);
    expect(f.visibility.size).toBe(0);
    expect(f.frames.size).toBe(0);
});

test("resizing retains source resolution, redraws the held cel once, and preserves its playback state", () => {
    const f = fixture();
    f.load(0);
    const stop = f.start();
    f.timer();
    expect([f.canvas.width, f.canvas.height]).toEqual([572, 808]);
    f.canvas.clientWidth = 143;
    f.canvas.clientHeight = 202;
    f.resize();
    expect([f.canvas.width, f.canvas.height]).toEqual([429, 606]);
    expect(f.context.drawImage).toHaveBeenCalledTimes(2);
    f.resize();
    expect(f.context.drawImage).toHaveBeenCalledTimes(2);
    expect(f.first).toHaveBeenCalledTimes(1);
    stop();
});

test.each([
    { width: 143, height: 808 },
    { width: 572, height: 202 },
])("a $width × $height paged portrait slot retains the authored proportions", ({ width, height }) => {
    const f = fixture(2);
    f.canvas.clientWidth = width;
    f.canvas.clientHeight = height;
    f.load(0);
    const stop = f.start();
    f.timer();
    expect([f.canvas.width, f.canvas.height]).toEqual([286, 404]);
    expect(f.context.drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 572, 808, 0, 0, 286, 404]);
    f.resize();
    expect(f.context.drawImage).toHaveBeenCalledTimes(1);
    expect(f.first).toHaveBeenCalledTimes(1);
    stop();
});

test("lookahead follows both loop seams and reversed ping-pong playback, with at most three pages", () => {
    expect(sidebarPageWindow(format, loop, 1900).map((page) => page.src)).toEqual(["page-3", "page-0", "page-1"]);
    const pingPong = {
        frameForElapsed: (elapsed: number) => {
            const frame = Math.floor(elapsed / 100) % 38;
            return frame < 20 ? frame : 38 - frame;
        },
    };
    expect(sidebarPageWindow(format, pingPong, 1800).map((page) => page.src)).toEqual(["page-3", "page-2", "page-1"]);
});
