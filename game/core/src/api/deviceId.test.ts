import { afterEach, describe, expect, test } from "bun:test";

import { DEVICE_ID_HEADER, deviceIdHeaders, getDeviceId } from "./deviceId";

const globals = globalThis as { localStorage?: Storage };

const memoryStorage = (): Storage => {
    const values = new Map<string, string>();
    return {
        get length() {
            return values.size;
        },
        clear: () => values.clear(),
        getItem: (key) => values.get(key) ?? null,
        key: (index) => [...values.keys()][index] ?? null,
        removeItem: (key) => void values.delete(key),
        setItem: (key, value) => void values.set(key, value),
    };
};

describe("device id", () => {
    const original = globals.localStorage;
    afterEach(() => {
        globals.localStorage = original;
    });

    test("is created once and then read back from storage", () => {
        globals.localStorage = memoryStorage();
        const first = getDeviceId();
        expect(first).toMatch(/^[A-Za-z0-9-]{16,64}$/);
        expect(getDeviceId()).toBe(first);
        expect(globals.localStorage.getItem("hoc:deviceId")).toBe(first);
        expect(deviceIdHeaders()).toEqual({ [DEVICE_ID_HEADER]: first });
    });

    test("a tampered stored value is replaced instead of being sent", () => {
        globals.localStorage = memoryStorage();
        globals.localStorage.setItem("hoc:deviceId", "<not an id>");
        expect(getDeviceId()).not.toBe("<not an id>");
    });

    test("without usable storage it stays stable for the page load", () => {
        globals.localStorage = {
            ...memoryStorage(),
            getItem: () => {
                throw new Error("blocked");
            },
        };
        expect(getDeviceId()).toBe(getDeviceId());
    });
});
