import { afterEach, beforeEach, expect, mock, test } from "bun:test";

import {
    getPremiumSuggestedMoves,
    readPremiumSuggestedMoves,
    setPremiumSuggestedMoves,
    subscribePremiumSuggestedMoves,
} from "./premiumSuggestedMoves";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let saved: string | null;
const write = mock((_key: string, value: string) => {
    saved = value;
});
beforeEach(() => {
    saved = null;
    write.mockClear();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: { getItem: () => saved, setItem: write },
    });
});
afterEach(() => {
    setPremiumSuggestedMoves(true);
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

test("suggested moves default to on without saving an implicit choice", () => {
    expect(readPremiumSuggestedMoves()).toBe(true);
    expect(write).not.toHaveBeenCalled();
    saved = "invalid";
    expect(readPremiumSuggestedMoves()).toBe(true);
});

test("a manual choice is saved and restored by a fresh storage read", () => {
    for (const enabled of [false, true, false]) {
        setPremiumSuggestedMoves(enabled);
        expect(getPremiumSuggestedMoves()).toBe(enabled);
        expect(readPremiumSuggestedMoves()).toBe(enabled);
    }
    expect(write).toHaveBeenLastCalledWith("hoc.premium.suggestedMoves", "false");
});

test("both fight consumers receive changes and unmounting does not reset the preference", () => {
    const ranked: boolean[] = [];
    const sandbox: boolean[] = [];
    const stopRanked = subscribePremiumSuggestedMoves(() => ranked.push(getPremiumSuggestedMoves()));
    const stopSandbox = subscribePremiumSuggestedMoves(() => sandbox.push(getPremiumSuggestedMoves()));
    try {
        setPremiumSuggestedMoves(false);
        expect(ranked).toEqual([false]);
        expect(sandbox).toEqual([false]);
        stopRanked();
        expect(getPremiumSuggestedMoves()).toBe(false);
        setPremiumSuggestedMoves(true);
        expect(ranked).toEqual([false]);
        expect(sandbox).toEqual([false, true]);
    } finally {
        stopRanked();
        stopSandbox();
    }
});

test("blocked browser storage still respects manual changes for the session", () => {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        get: () => {
            throw new Error("Storage unavailable");
        },
    });
    expect(readPremiumSuggestedMoves()).toBe(true);
    setPremiumSuggestedMoves(false);
    expect(getPremiumSuggestedMoves()).toBe(false);
    setPremiumSuggestedMoves(true);
    expect(getPremiumSuggestedMoves()).toBe(true);
});
