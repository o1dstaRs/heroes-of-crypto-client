import { afterEach, expect, mock, spyOn, test } from "bun:test";

import { playSidebarAtlas } from "./sidebarAtlasCanvas";

const globals = new Map(
    ["window", "document", "ResizeObserver"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);
afterEach(() => {
    mock.restore();
    for (const [name, descriptor] of globals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
    }
});

const fixture = (density = 2) => {
    let time = 0;
    spyOn(performance, "now").mockImplementation(() => time);
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    const visibilityListeners = new Set<() => void>();
    const page = {
        hidden: false,
        addEventListener: (_name: string, listener: () => void) => visibilityListeners.add(listener),
        removeEventListener: (_name: string, listener: () => void) => visibilityListeners.delete(listener),
    };
    let resize: (() => void) | undefined;
    const disconnect = mock(() => undefined);
    Object.defineProperties(globalThis, {
        window: {
            configurable: true,
            value: {
                devicePixelRatio: density,
                requestAnimationFrame: (callback: FrameRequestCallback) => {
                    const id = ++frameId;
                    frames.set(id, callback);
                    return id;
                },
                cancelAnimationFrame: (id: number) => frames.delete(id),
            },
        },
        document: { configurable: true, value: page },
        ResizeObserver: {
            configurable: true,
            value: class {
                public constructor(callback: () => void) {
                    resize = callback;
                }
                public observe() {}
                public disconnect = disconnect;
            },
        },
    });
    const context = {
        clearRect: mock(() => undefined),
        drawImage: mock((..._args: unknown[]) => undefined),
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
    };
    const canvas = {
        width: 300,
        height: 150,
        clientWidth: 286,
        clientHeight: 404,
        getContext: () => context,
    };
    const image = { naturalWidth: 5720, naturalHeight: 8080 } as HTMLImageElement;
    const timing = { cols: 10, rows: 10, frameForElapsed: (elapsed: number) => Math.floor(elapsed / 100) % 100 };
    const start = () => playSidebarAtlas(canvas as unknown as HTMLCanvasElement, image, timing)!;
    return {
        canvas,
        context,
        image,
        frames,
        disconnect,
        visibilityListeners,
        start,
        tick(next: number) {
            time = next;
            const callbacks = [...frames.values()];
            frames.clear();
            for (const callback of callbacks) callback(time);
        },
        resize: () => resize?.(),
        visibility(hidden: boolean, next = time) {
            page.hidden = hidden;
            time = next;
            for (const listener of visibilityListeners) listener();
        },
    };
};

test("crops one original cel, crosses atlas rows, and keeps the authored loop phase", () => {
    const f = fixture();
    const stop = f.start();
    expect(f.context.drawImage).toHaveBeenLastCalledWith(f.image, 0, 0, 572, 808, 0, 0, 572, 808);
    f.tick(100);
    expect(f.context.drawImage).toHaveBeenLastCalledWith(f.image, 572, 0, 572, 808, 0, 0, 572, 808);
    f.tick(1000);
    expect(f.context.drawImage).toHaveBeenLastCalledWith(f.image, 0, 808, 572, 808, 0, 0, 572, 808);
    f.tick(10000);
    expect(f.context.drawImage).toHaveBeenLastCalledWith(f.image, 0, 0, 572, 808, 0, 0, 572, 808);
    expect(f.context.clearRect).toHaveBeenCalledTimes(4);
    stop();
});

test("a 60 Hz display redraws only the authored 10 frames per second", () => {
    const f = fixture();
    const stop = f.start();
    for (let time = 0; time < 1000; time += 1000 / 60) f.tick(time);
    expect(f.context.drawImage).toHaveBeenCalledTimes(10);
    expect(f.context.clearRect).toHaveBeenCalledTimes(10);
    stop();
});

test("Retina backing stores stop at the source cel resolution", () => {
    const f = fixture(3);
    const stop = f.start();
    expect([f.canvas.width, f.canvas.height]).toEqual([572, 808]);
    expect(f.canvas.width * f.canvas.height * 4).toBe(1848704);
    expect(f.context.imageSmoothingQuality).toBe("high");
    stop();
});

test("resizing redraws the same cel once and unchanged resize notifications do no work", () => {
    const f = fixture();
    const stop = f.start();
    f.canvas.clientWidth = 143;
    f.canvas.clientHeight = 202;
    f.resize();
    expect([f.canvas.width, f.canvas.height]).toEqual([286, 404]);
    expect(f.context.drawImage).toHaveBeenCalledTimes(2);
    f.resize();
    f.tick(16);
    expect(f.context.drawImage).toHaveBeenCalledTimes(2);
    stop();
});

test("hidden tabs stop scheduling and resume at the current clock phase", () => {
    const f = fixture();
    const stop = f.start();
    expect(f.frames.size).toBe(1);
    f.visibility(true);
    expect(f.frames.size).toBe(0);
    f.tick(3600);
    expect(f.context.drawImage).toHaveBeenCalledTimes(1);
    f.visibility(false);
    expect(f.context.drawImage).toHaveBeenLastCalledWith(f.image, 3432, 2424, 572, 808, 0, 0, 572, 808);
    expect(f.frames.size).toBe(1);
    stop();
});

test("unmount stops playback, observers, and visibility listeners", () => {
    const f = fixture();
    const stop = f.start();
    stop();
    expect(f.frames.size).toBe(0);
    expect(f.visibilityListeners.size).toBe(0);
    expect(f.disconnect).toHaveBeenCalledTimes(1);
    f.visibility(true);
    f.visibility(false, 500);
    expect(f.frames.size).toBe(0);
    expect(f.context.drawImage).toHaveBeenCalledTimes(1);
});
