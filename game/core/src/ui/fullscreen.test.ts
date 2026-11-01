import { expect, mock, test } from "bun:test";

import { FULLSCREEN_PRESENTATION_ATTRIBUTE, toggleFullscreen } from "./fullscreen";

const withBrowser = async (run: (env: ReturnType<typeof browser>) => Promise<void>) => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const env = browser();
    Object.defineProperty(globalThis, "window", { value: env.window, configurable: true });
    Object.defineProperty(globalThis, "document", { value: env.document, configurable: true });
    try {
        await run(env);
    } finally {
        if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
        else Reflect.deleteProperty(globalThis, "window");
        if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
        else Reflect.deleteProperty(globalThis, "document");
    }
};
const browser = () => {
    const attrs = new Map<string, string>();
    const root = {
        setAttribute: (key: string, value: string) => attrs.set(key, value),
        removeAttribute: (key: string) => attrs.delete(key),
        requestFullscreen: undefined as undefined | ((options?: FullscreenOptions) => Promise<void>),
        webkitRequestFullscreen: undefined as undefined | (() => void),
    };
    const document = {
        documentElement: root,
        fullscreenElement: null as object | null,
        webkitFullscreenElement: null as object | null,
        exitFullscreen: undefined as undefined | (() => Promise<void>),
        webkitExitFullscreen: undefined as undefined | (() => void),
    };
    const window = {
        innerHeight: 700,
        outerHeight: 800,
        screen: { orientation: { lock: mock(async (_mode: string) => {}), unlock: mock(() => {}) } },
    };
    return { document, window, root, attrs };
};

test("touch fullscreen starts from the original tap, enters and exits, and releases the landscape lock", () =>
    withBrowser(async (env) => {
        const enter = mock(async () => {
            env.document.fullscreenElement = env.root;
        });
        const exit = mock(async () => {
            env.document.fullscreenElement = null;
        });
        env.root.requestFullscreen = enter;
        env.document.exitFullscreen = exit;
        const pending = toggleFullscreen({ landscape: true });
        expect(enter).toHaveBeenCalledTimes(1);
        expect(await pending).toBe("entered");
        expect(enter).toHaveBeenCalledWith({ navigationUI: "hide" });
        expect(env.window.screen.orientation.lock).toHaveBeenCalledWith("landscape");
        expect(await toggleFullscreen({ landscape: true })).toBe("exited");
        expect(exit).toHaveBeenCalledTimes(1);
        expect(env.window.screen.orientation.unlock).toHaveBeenCalledTimes(1);
        expect(env.attrs.has(FULLSCREEN_PRESENTATION_ATTRIBUTE)).toBe(false);
    }));
test("uses the prefixed Safari fullscreen state and exit methods", () =>
    withBrowser(async (env) => {
        env.root.webkitRequestFullscreen = () => {
            env.document.webkitFullscreenElement = env.root;
        };
        env.document.webkitExitFullscreen = () => {
            env.document.webkitFullscreenElement = null;
        };
        expect(await toggleFullscreen({ landscape: true })).toBe("entered");
        expect(env.attrs.has(FULLSCREEN_PRESENTATION_ATTRIBUTE)).toBe(true);
        expect(await toggleFullscreen({ landscape: true })).toBe("exited");
        expect(env.document.webkitFullscreenElement).toBeNull();
    }));
test("a denied orientation lock does not undo successful fullscreen", () =>
    withBrowser(async (env) => {
        env.root.requestFullscreen = async () => {
            env.document.fullscreenElement = env.root;
        };
        env.window.screen.orientation.lock = mock(async () => {
            throw new Error("Orientation lock unsupported");
        });
        expect(await toggleFullscreen({ landscape: true })).toBe("entered");
        expect(env.document.fullscreenElement).toBe(env.root);
    }));
test("unsupported or denied fullscreen is reported without leaving a false fullscreen layout", () =>
    withBrowser(async (env) => {
        expect(await toggleFullscreen({ landscape: true })).toBe("unavailable");
        env.root.requestFullscreen = async () => {
            throw new Error("Not allowed");
        };
        expect(await toggleFullscreen({ landscape: true })).toBe("denied");
        expect(env.attrs.has(FULLSCREEN_PRESENTATION_ATTRIBUTE)).toBe(false);
    }));

test("a mobile viewport without browser chrome is not mistaken for native fullscreen", () =>
    withBrowser(async (env) => {
        env.window.innerHeight = env.window.outerHeight;
        expect(await toggleFullscreen({ landscape: true })).toBe("unavailable");
        expect(env.attrs.has(FULLSCREEN_PRESENTATION_ATTRIBUTE)).toBe(false);
    }));
