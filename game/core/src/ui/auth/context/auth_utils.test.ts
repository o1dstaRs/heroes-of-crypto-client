import { describe, expect, it } from "bun:test";

import { tokenExpSafe, isValidToken } from "./auth_utils";

const b64url = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const makeToken = (exp: number): string => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ exp })}.sig`;

// tokenExpSafe guards the auth bootstrap: a stale SSO cookie or corrupted localStorage entry must
// read as "no token" (null), never throw — an exception here left the app permanently on the login
// prompt (the beta "always prompts login again" bug).
describe("tokenExpSafe", () => {
    it("returns the exp of a well-formed token", () => {
        expect(tokenExpSafe(makeToken(1_800_000_000))).toBe(1_800_000_000);
    });

    it("returns null for garbage, empty, and structurally broken values instead of throwing", () => {
        expect(tokenExpSafe(null)).toBeNull();
        expect(tokenExpSafe(undefined)).toBeNull();
        expect(tokenExpSafe("")).toBeNull();
        expect(tokenExpSafe("not-a-jwt")).toBeNull();
        expect(tokenExpSafe("a.b.c")).toBeNull();
        expect(tokenExpSafe(`${b64url({ alg: "HS256" })}.${b64url({ noExp: true })}.sig`)).toBeNull();
    });
});

describe("isValidToken", () => {
    it("accepts an unexpired token and rejects an expired or malformed one without throwing", () => {
        const now = Date.now() / 1000;
        expect(isValidToken(makeToken(now + 3600))).toBe(true);
        expect(isValidToken(makeToken(now - 3600))).toBe(false);
        expect(isValidToken("corrupted")).toBe(false);
    });
});
