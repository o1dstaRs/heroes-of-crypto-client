import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { installStaleChunkRecovery } from "./staleChunkRecovery";

describe("client files replaced by a deployment", () => {
    let originalWindow: PropertyDescriptor | undefined;
    let originalStorage: PropertyDescriptor | undefined;
    let listeners: Map<string, (event: Event) => void>;
    let storage: Map<string, string>;
    let timers: { callback: () => void; delay: number }[];
    let reloads: number;

    beforeEach(() => {
        originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
        originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
        listeners = new Map();
        storage = new Map();
        timers = [];
        reloads = 0;
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: {
                addEventListener: (name: string, handler: (event: Event) => void) => listeners.set(name, handler),
                location: { reload: () => reloads++ },
                setTimeout: (callback: () => void, delay: number) => timers.push({ callback, delay }),
            },
        });
        Object.defineProperty(globalThis, "sessionStorage", {
            configurable: true,
            value: {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => storage.set(key, value),
                removeItem: (key: string) => storage.delete(key),
            },
        });
    });

    afterEach(() => {
        if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
        else Reflect.deleteProperty(globalThis, "window");
        if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
        else Reflect.deleteProperty(globalThis, "sessionStorage");
    });

    const missingChunk = () => {
        const event = new Event("vite:preloadError", { cancelable: true });
        listeners.get("vite:preloadError")!(event);
        return event;
    };

    test("reloads a stale page once and suppresses the transient loader failure", () => {
        installStaleChunkRecovery();
        expect(missingChunk().defaultPrevented).toBe(true);
        expect(reloads).toBe(1);
        expect(storage.get("hoc-stale-chunk-reloaded")).toBe("1");
    });

    test("shows a persistent loading failure instead of entering a reload loop", () => {
        storage.set("hoc-stale-chunk-reloaded", "1");
        installStaleChunkRecovery();
        expect(missingChunk().defaultPrevented).toBe(false);
        expect(reloads).toBe(0);
    });

    test("recovers again after a later deployment once the new page has booted", () => {
        storage.set("hoc-stale-chunk-reloaded", "1");
        installStaleChunkRecovery();
        expect(timers).toHaveLength(1);
        expect(timers[0].delay).toBe(10_000);
        timers[0].callback();
        expect(missingChunk().defaultPrevented).toBe(true);
        expect(reloads).toBe(1);
    });
});
