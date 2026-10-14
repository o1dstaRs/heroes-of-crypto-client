import { afterEach, beforeEach, expect, test } from "bun:test";

import {
    getPremiumCapability,
    getPremiumPreference,
    readPremiumPreference,
    setPremiumPreference,
    subscribePremiumPreferences,
    type PremiumPreference,
} from "./premiumPreferences";
import { getPremiumSuggestedMoves, setPremiumSuggestedMoves } from "./premiumSuggestedMoves";

const preferences: PremiumPreference[] = ["enabled", "chat", "draft", "setup", "suggestedMoves"];
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const saved = new Map<string, string>();

beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => saved.get(key) ?? null,
            setItem: (key: string, value: string) => saved.set(key, value),
        },
    });
    for (const preference of preferences) setPremiumPreference(preference, true);
    saved.clear();
});

afterEach(() => {
    for (const preference of preferences) setPremiumPreference(preference, true);
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

test("all capabilities start enabled and the existing suggested-moves choice is still readable", () => {
    for (const preference of preferences) expect(readPremiumPreference(preference)).toBe(true);
    expect(saved.size).toBe(0);
    saved.set("hoc.premium.suggestedMoves", "false");
    expect(readPremiumPreference("suggestedMoves")).toBe(false);
});

test("the overall switch suspends every capability without replacing individual choices", () => {
    setPremiumPreference("chat", false);
    setPremiumSuggestedMoves(false);
    setPremiumPreference("enabled", false);
    for (const capability of ["chat", "draft", "setup", "suggestedMoves"] as const)
        expect(getPremiumCapability(capability)).toBe(false);
    expect(getPremiumPreference("draft")).toBe(true);
    setPremiumPreference("enabled", true);
    expect(getPremiumCapability("draft")).toBe(true);
    expect(getPremiumCapability("setup")).toBe(true);
    expect(getPremiumCapability("chat")).toBe(false);
    expect(getPremiumCapability("suggestedMoves")).toBe(false);
    expect(readPremiumPreference("chat")).toBe(false);
    expect(readPremiumPreference("suggestedMoves")).toBe(false);
});

test("settings and the existing fight switch publish the same move preference", () => {
    const seen: boolean[] = [];
    const stop = subscribePremiumPreferences(() => seen.push(getPremiumSuggestedMoves()));
    try {
        setPremiumPreference("suggestedMoves", false);
        setPremiumSuggestedMoves(true);
        expect(seen).toEqual([false, true]);
        expect(readPremiumPreference("suggestedMoves")).toBe(true);
    } finally {
        stop();
    }
});

test("blocked storage preserves separate capability choices for the session", () => {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        get: () => {
            throw new Error("Storage blocked");
        },
    });
    setPremiumPreference("setup", false);
    setPremiumPreference("enabled", false);
    setPremiumPreference("enabled", true);
    expect(getPremiumCapability("setup")).toBe(false);
    expect(getPremiumCapability("chat")).toBe(true);
});
