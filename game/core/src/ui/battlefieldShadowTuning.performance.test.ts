import { afterEach, beforeEach, expect, test } from "bun:test";

import {
    BATTLEFIELD_SHADOW_TUNING_BY_CREATURE,
    DEFAULT_BATTLEFIELD_SHADOW_TUNING,
    normalizeBattlefieldShadowTuning,
    readStoredBattlefieldShadowTuning,
    resetStoredBattlefieldShadowTuning,
    resolveBattlefieldShadowTuning,
    resolveBattlefieldShadowTuningForBuild,
    writeStoredBattlefieldShadowTuning,
} from "./battlefieldShadowTuning";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalProd = process.env.PROD;
const originalViteProd = process.env.VITE_IS_PROD;

beforeEach(() => {
    process.env.PROD = "false";
    process.env.VITE_IS_PROD = "false";
});

afterEach(async () => {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (originalProd === undefined) delete process.env.PROD;
    else process.env.PROD = originalProd;
    if (originalViteProd === undefined) delete process.env.VITE_IS_PROD;
    else process.env.VITE_IS_PROD = originalViteProd;
    await Promise.resolve();
});

function cookieJar(value = "") {
    const state = { value, reads: 0 };
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {
            get cookie() {
                state.reads++;
                return state.value;
            },
            set cookie(value: string) {
                state.value = value;
            },
        },
    });
    return state;
}

const cookie = (name: string, value: unknown): string =>
    `hoc-dev-shadow-v8-${encodeURIComponent(name)}=${encodeURIComponent(JSON.stringify(value))}`;

test("production reuses immutable snapshots with exactly the approved normalized values", () => {
    process.env.VITE_IS_PROD = "true";
    const jar = cookieJar();
    for (const name of [...Object.keys(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE), "Unknown Shadow", undefined]) {
        const snapshot = resolveBattlefieldShadowTuning(name);
        expect(snapshot).toEqual(resolveBattlefieldShadowTuningForBuild(name, true));
        expect(resolveBattlefieldShadowTuning(name)).toBe(snapshot);
        expect(Object.isFrozen(snapshot)).toBe(true);
        for (const row of [snapshot.top, snapshot.bottom]) {
            expect(Object.isFrozen(row)).toBe(true);
            expect(Object.isFrozen(row.segmentLengthMultipliers)).toBe(true);
        }
    }
    expect(jar.reads).toBe(0);
});

test("all units in a synchronous update share one cookie read and refresh at the next microtask", async () => {
    const jar = cookieJar();
    for (let frame = 0; frame < 3; frame++) {
        for (let index = 0; index < 24; index++) {
            expect(resolveBattlefieldShadowTuning(`Frame Shadow ${index}`)).toEqual(DEFAULT_BATTLEFIELD_SHADOW_TUNING);
        }
        expect(jar.reads).toBe(frame + 1);
        await Promise.resolve();
    }
});

test("cookie edits from another port and cookie removal take effect on the next visual update", async () => {
    const name = "Cross-port Shadow";
    const first = normalizeBattlefieldShadowTuning({ top: { widthScale: 0.75 } });
    const second = normalizeBattlefieldShadowTuning({ top: { widthScale: 1.12 }, bottomAlphaOverride: 0.31 });
    const jar = cookieJar(cookie(name, first));
    const initial = resolveBattlefieldShadowTuning(name);
    expect(initial).toEqual(first);
    expect(resolveBattlefieldShadowTuning(name)).toBe(initial);
    await Promise.resolve();
    expect(resolveBattlefieldShadowTuning(name)).toBe(initial);

    jar.value = cookie(name, second);
    await Promise.resolve();
    const updated = resolveBattlefieldShadowTuning(name);
    expect(updated).toEqual(second);
    expect(updated).not.toBe(initial);
    expect(initial).toEqual(first);

    jar.value = "";
    await Promise.resolve();
    expect(resolveBattlefieldShadowTuning(name)).toEqual(DEFAULT_BATTLEFIELD_SHADOW_TUNING);
});

test("editor saves and resets replace runtime snapshots immediately without sharing mutable editor data", () => {
    const name = "Saved Shadow";
    cookieJar();
    const initial = resolveBattlefieldShadowTuning(name);
    const draft = normalizeBattlefieldShadowTuning({
        top: { widthScale: 1.15, segmentLengthMultipliers: [1, 2, 1, 1] },
    });
    writeStoredBattlefieldShadowTuning(name, draft);
    const saved = resolveBattlefieldShadowTuning(name);
    expect(saved).not.toBe(initial);
    expect(saved).toEqual(draft);
    expect(resolveBattlefieldShadowTuning(name)).toBe(saved);

    const editorCopy = readStoredBattlefieldShadowTuning(name);
    editorCopy.top.widthScale = 1.9;
    draft.top.widthScale = 0.2;
    expect(resolveBattlefieldShadowTuning(name).top.widthScale).toBe(1.15);
    expect(Object.isFrozen(editorCopy)).toBe(false);
    expect(Object.isFrozen(draft)).toBe(false);

    writeStoredBattlefieldShadowTuning(name, editorCopy);
    expect(resolveBattlefieldShadowTuning(name).top.widthScale).toBe(1.9);
    resetStoredBattlefieldShadowTuning(name);
    expect(resolveBattlefieldShadowTuning(name)).toEqual(DEFAULT_BATTLEFIELD_SHADOW_TUNING);
});

test("cookie parsing keeps the original normalization, first-match precedence and fallback behavior", () => {
    const draft = { top: { widthScale: 9, alpha: -2, segmentLengthMultipliers: [0, 99] }, contactAlpha: 9 };
    cookieJar(
        [
            "unrelated_cookie=ignored",
            cookie("Encoded Shadow / +", draft),
            "hoc-dev-shadow-v8-Invalid%20Shadow=%not-json",
            cookie("Invalid Shadow", draft),
            cookie("Duplicate Shadow", { top: { widthScale: 0.64 } }),
            cookie("Duplicate Shadow", draft),
        ].join("; "),
    );
    for (const name of ["Encoded Shadow / +", "Invalid Shadow", "Duplicate Shadow", "Absent Shadow", undefined]) {
        expect(resolveBattlefieldShadowTuning(name)).toEqual(resolveBattlefieldShadowTuningForBuild(name, false));
    }
});

test("changing documents and blocked cookie access cannot leave another document's profile active", () => {
    const name = "Document Shadow";
    cookieJar(cookie(name, { top: { widthScale: 1.4 } }));
    expect(resolveBattlefieldShadowTuning(name).top.widthScale).toBe(1.4);
    cookieJar(cookie(name, { top: { widthScale: 0.6 } }));
    expect(resolveBattlefieldShadowTuning(name).top.widthScale).toBe(0.6);

    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {
            get cookie(): string {
                throw new Error("SecurityError");
            },
        },
    });
    expect(resolveBattlefieldShadowTuning(name)).toEqual(DEFAULT_BATTLEFIELD_SHADOW_TUNING);
});

test("polled editor profiles replace snapshots, retain precedence over cookies and can be removed", async () => {
    const name = "Polled Shadow";
    cookieJar(cookie(name, { top: { widthScale: 0.7 } }));
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalFetch = globalThis.fetch;
    let poll: (() => void) | undefined;
    let profiles: Record<string, unknown> = { [name]: { top: { widthScale: 1.2 } } };
    const flush = async () => {
        await Promise.resolve();
        await Promise.resolve();
    };
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            setInterval: (callback: () => void) => {
                poll = callback;
            },
            dispatchEvent: () => true,
        },
    });
    globalThis.fetch = (async () => ({ ok: true, json: async () => profiles })) as unknown as typeof fetch;
    try {
        expect(resolveBattlefieldShadowTuning(name).top.widthScale).toBe(0.7);
        await flush();
        const initial = resolveBattlefieldShadowTuning(name);
        expect(initial.top.widthScale).toBe(1.2);
        expect(poll).toBeDefined();

        poll!();
        await flush();
        expect(resolveBattlefieldShadowTuning(name)).toBe(initial);

        profiles = { [name]: { top: { widthScale: 1.4 } } };
        poll!();
        await flush();
        const updated = resolveBattlefieldShadowTuning(name);
        expect(updated.top.widthScale).toBe(1.4);
        expect(updated).not.toBe(initial);
        expect(initial.top.widthScale).toBe(1.2);

        profiles = {};
        poll!();
        await flush();
        expect(resolveBattlefieldShadowTuning(name).top.widthScale).toBe(0.7);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
        else Reflect.deleteProperty(globalThis, "window");
    }
});
