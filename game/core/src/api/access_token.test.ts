import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";

import {
    normalizeAccessToken,
    resetAccessTokenTimerForTests,
    resolveAccessTokenHashHandoff,
    setStoredAccessToken,
    shouldAdoptAccessTokenRotation,
} from "./access_token";

const b64url = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const makeToken = (exp: number, marker: string, sessionId = "session-a"): string =>
    `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ exp, marker, sessionId })}.signature-${marker}`;

const values = new Map<string, string>();
const localStorageStub = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
        return values.size;
    },
} as Storage;

let previousStorage: Storage | undefined;

beforeEach(() => {
    previousStorage = globalThis.localStorage;
    values.clear();
    (globalThis as { localStorage?: Storage }).localStorage = localStorageStub;
});

afterEach(() => {
    resetAccessTokenTimerForTests();
    jest.useRealTimers();
    (globalThis as { localStorage?: Storage }).localStorage = previousStorage;
});

describe("access-token handoff", () => {
    test("does not let an expired or older site hash clobber a fresh game session", () => {
        const now = 1_800_000_000;
        const current = `Bearer ${makeToken(now + 7_200, "current")}`;
        const expired = makeToken(now - 60, "expired");
        const older = makeToken(now + 3_600, "older");

        expect(resolveAccessTokenHashHandoff(`#access_token=${encodeURIComponent(expired)}`, current, now)).toEqual({
            found: true,
            tokenToAdopt: null,
        });
        expect(resolveAccessTokenHashHandoff(`#access_token=${encodeURIComponent(older)}`, current, now)).toEqual({
            found: true,
            tokenToAdopt: null,
        });
    });

    test("adopts a newer live raw handoff in normalized Authorization form", () => {
        const now = 1_800_000_000;
        const current = makeToken(now + 3_600, "current", "old-session");
        const newerRaw = makeToken(now + 7_200, "newer", "site-session");

        expect(resolveAccessTokenHashHandoff(`#accessToken=${encodeURIComponent(newerRaw)}`, current, now)).toEqual({
            found: true,
            tokenToAdopt: `Bearer ${newerRaw}`,
        });
        expect(normalizeAccessToken(`  bearer   ${newerRaw}  `)).toBe(`Bearer ${newerRaw}`);
    });
});

describe("access-token response rotation", () => {
    test("only a newer token for the current live session is adoptable", () => {
        const now = 1_800_000_000;
        const current = makeToken(now + 3_600, "current", "session-a");

        expect(shouldAdoptAccessTokenRotation(makeToken(now + 7_200, "newer", "session-a"), current, now)).toBe(true);
        expect(shouldAdoptAccessTokenRotation(makeToken(now + 7_200, "other", "session-b"), current, now)).toBe(false);
        expect(shouldAdoptAccessTokenRotation(makeToken(now + 7_200, "logged-out", "session-a"), null, now)).toBe(
            false,
        );
        expect(shouldAdoptAccessTokenRotation(makeToken(now + 3_600, "equal", "session-a"), current, now)).toBe(false);
    });
});

describe("access-token expiration", () => {
    test("an old expiration timer cannot clear the newer rotated token", () => {
        const nowMs = 1_800_000_000_000;
        jest.useFakeTimers({ now: nowMs });
        const first = makeToken(nowMs / 1000 + 1, "first");
        const rotated = makeToken(nowMs / 1000 + 60, "rotated");

        setStoredAccessToken(first);
        setStoredAccessToken(rotated);
        jest.advanceTimersByTime(1_500);

        expect(localStorage.getItem("accessToken")).toBe(`Bearer ${rotated}`);
    });
});
