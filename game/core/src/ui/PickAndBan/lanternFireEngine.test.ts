import { afterEach, describe, expect, test } from "bun:test";
import { lanternFireBufferSize, startLanternFireEngine } from "./lanternFireEngine";

const original = new Map<string, PropertyDescriptor | undefined>();
function install(name: string, value: unknown) {
    original.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
afterEach(() => {
    for (const [name, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
    }
    original.clear();
});
function fixture(failed = false) {
    const document = Object.assign(new EventTarget(), { hidden: false });
    const media = Object.assign(new EventTarget(), { matches: false });
    let id = 0;
    const queue = new Map<number, FrameRequestCallback>();
    const calls = { draws: 0, buffers: 0, deletedBuffers: 0, deletedPrograms: 0, deletedShaders: 0, disconnected: 0 };
    const gl = {
        createShader: () => ({}),
        shaderSource() {},
        compileShader() {},
        getShaderParameter: () => !failed,
        getShaderInfoLog: () => "test failure",
        deleteShader: () => calls.deletedShaders++,
        createProgram: () => ({}),
        attachShader() {},
        linkProgram() {},
        bindAttribLocation() {},
        getProgramParameter: () => true,
        useProgram() {},
        createBuffer: () => ({}),
        bindBuffer() {},
        bufferData: () => calls.buffers++,
        getAttribLocation: () => 0,
        enableVertexAttribArray() {},
        vertexAttribPointer() {},
        getUniformLocation: () => ({}),
        uniform1f() {},
        uniform2f() {},
        disable() {},
        viewport() {},
        drawArrays: () => calls.draws++,
        deleteBuffer: () => calls.deletedBuffers++,
        deleteProgram: () => calls.deletedPrograms++,
    };
    const canvas = Object.assign(new EventTarget(), {
        getContext: () => gl,
        dataset: {} as Record<string, string>,
        clientWidth: 32,
        clientHeight: 60,
        width: 0,
        height: 0,
    });
    install("document", document);
    install("window", { matchMedia: () => media, devicePixelRatio: 2 });
    install("requestAnimationFrame", (callback: FrameRequestCallback) => {
        queue.set(++id, callback);
        return id;
    });
    install("cancelAnimationFrame", (key: number) => queue.delete(key));
    let visibility: (entries: { isIntersecting: boolean }[]) => void = () => {};
    install(
        "ResizeObserver",
        class {
            public observe() {}
            public disconnect() {
                calls.disconnected++;
            }
        },
    );
    install(
        "IntersectionObserver",
        class {
            public constructor(callback: typeof visibility) {
                visibility = callback;
            }
            public observe() {}
            public disconnect() {
                calls.disconnected++;
            }
        },
    );
    const light = { style: { opacity: "" } };
    const controller = startLanternFireEngine(canvas as unknown as HTMLCanvasElement, light as HTMLElement, {
        speed: 0.78,
        brightness: 1.1,
        opacity: 1,
    });
    return {
        canvas,
        document,
        media,
        queue,
        calls,
        dispose: controller.dispose,
        update: controller.update,
        visibility,
        step(now: number) {
            const callbacks = [...queue.values()];
            queue.clear();
            callbacks.forEach((callback) => callback(now));
        },
    };
}
describe("lantern fire engine lifecycle", () => {
    test("bounds the drawing surface even on a large HiDPI viewport", () => {
        expect(lanternFireBufferSize(32, 60, 2)).toEqual({ width: 64, height: 120 });
        // Atmospheric padding must not lower the original flame detail on a large display.
        expect(lanternFireBufferSize(128, 176, 2)).toEqual({ width: 256, height: 352 });
        for (const [w, h] of [
            [600, 1800],
            [10000, 10],
            [1, 1],
            [0, 0],
        ]) {
            const size = lanternFireBufferSize(w, h, 4);
            expect(size.width).toBeLessThanOrEqual(320);
            expect(size.height).toBeLessThanOrEqual(512);
            expect(size.width).toBeGreaterThanOrEqual(1);
            expect(size.height).toBeGreaterThanOrEqual(1);
        }
    });
    test("stops offscreen/hidden/reduced motion and resumes without reallocating GPU buffers", () => {
        const f = fixture();
        expect(f.canvas.dataset.renderer).toBe("webgl");
        f.update({ speed: 1.5, brightness: 1.4, opacity: 0.9 });
        expect(f.calls.buffers).toBe(1);
        expect(f.calls.deletedPrograms).toBe(0);
        f.step(10);
        f.step(26);
        expect(f.calls.buffers).toBe(1);
        f.document.hidden = true;
        f.document.dispatchEvent(new Event("visibilitychange"));
        expect(f.queue.size).toBe(0);
        const paused = f.calls.draws;
        f.step(100);
        expect(f.calls.draws).toBe(paused);
        f.document.hidden = false;
        f.document.dispatchEvent(new Event("visibilitychange"));
        expect(f.queue.size).toBe(1);
        f.visibility([{ isIntersecting: false }]);
        expect(f.queue.size).toBe(0);
        f.visibility([{ isIntersecting: true }]);
        expect(f.queue.size).toBe(1);
        f.media.matches = true;
        f.media.dispatchEvent(new Event("change"));
        expect(f.queue.size).toBe(0);
        f.media.matches = false;
        f.media.dispatchEvent(new Event("change"));
        expect(f.queue.size).toBe(1);
        f.dispose();
        expect(f.queue.size).toBe(0);
        expect(f.calls.deletedBuffers).toBe(1);
        expect(f.calls.deletedPrograms).toBe(1);
        expect(f.calls.deletedShaders).toBe(2);
        expect(f.calls.disconnected).toBe(2);
        f.document.dispatchEvent(new Event("visibilitychange"));
        expect(f.queue.size).toBe(0);
    });
    test("rebuilds after context restoration without duplicate animation loops", () => {
        const f = fixture();
        const lost = new Event("webglcontextlost", { cancelable: true });
        f.canvas.dispatchEvent(lost);
        expect(lost.defaultPrevented).toBe(true);
        expect(f.queue.size).toBe(0);
        expect(f.canvas.dataset.renderer).toBe("fallback");
        f.canvas.dispatchEvent(new Event("webglcontextrestored"));
        expect(f.canvas.dataset.renderer).toBe("webgl");
        expect(f.queue.size).toBe(1);
        expect(f.calls.buffers).toBe(2);
        f.dispose();
    });
});
