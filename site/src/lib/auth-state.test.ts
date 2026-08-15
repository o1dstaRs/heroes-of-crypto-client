import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { authTokenExpiration, getAuthToken, isLiveAuthToken, normalizeAuthToken } from "./auth-state";

const b64url = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const token = (exp: number): string => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ exp })}.sig`;

const values = new Map<string, string>();
const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
} as Storage;

let previousStorage: Storage | undefined;

describe("site auth token state", () => {
    beforeEach(() => {
        previousStorage = globalThis.localStorage;
        values.clear();
        (globalThis as { localStorage?: Storage }).localStorage = storage;
    });

    afterEach(() => {
        if (previousStorage) {
            (globalThis as { localStorage?: Storage }).localStorage = previousStorage;
        } else {
            delete (globalThis as { localStorage?: Storage }).localStorage;
        }
    });

    test("normalizes raw and already-prefixed JWTs to one Authorization value", () => {
        const raw = token(1_900_000_000);
        expect(normalizeAuthToken(raw)).toBe(`Bearer ${raw}`);
        expect(normalizeAuthToken(`  bearer   ${raw}  `)).toBe(`Bearer ${raw}`);
        expect(authTokenExpiration(raw)).toBe(1_900_000_000);
    });

    test("returns and canonicalizes a live raw token", () => {
        const raw = token(1_900_000_000);
        values.set("accessToken", raw);

        expect(getAuthToken(1_800_000_000_000)).toBe(`Bearer ${raw}`);
        expect(values.get("accessToken")).toBe(`Bearer ${raw}`);
        expect(isLiveAuthToken(raw, 1_800_000_000_000)).toBe(true);
    });

    test("clears an expired or malformed token together with the cached user", () => {
        values.set("accessToken", token(1_700_000_000));
        values.set("hocAuthUser", '{"username":"stale"}');

        expect(getAuthToken(1_800_000_000_000)).toBeNull();
        expect(values.has("accessToken")).toBe(false);
        expect(values.has("hocAuthUser")).toBe(false);

        values.set("accessToken", "not-a-jwt");
        values.set("hocAuthUser", "{}");
        expect(getAuthToken(1_800_000_000_000)).toBeNull();
        expect(values.size).toBe(0);
    });
});
