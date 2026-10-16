import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { AxiosInstance } from "axios";

import { resetAccessTokenTimerForTests, setStoredAccessToken } from "./access_token";
import { axiosAuthInstance, axiosGameInstance, axiosMMInstance, resolveHost } from "./axios";

const b64url = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const makeToken = (marker: string, lifetimeSeconds = 3_600, sessionId = "session-a"): string => {
    const exp = Math.floor(Date.now() / 1000) + lifetimeSeconds;
    return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ exp, marker, sessionId })}.signature-${marker}`;
};

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
    setStoredAccessToken(null);
});

afterEach(() => {
    setStoredAccessToken(null);
    resetAccessTokenTimerForTests();
    (globalThis as { localStorage?: Storage }).localStorage = previousStorage;
});

const respondWithRotation = async (instance: AxiosInstance, rawToken: string): Promise<void> => {
    await instance.get("/token-rotation-test", {
        adapter: async (config) => ({
            config,
            data: null,
            headers: { "x-new-token": rawToken },
            status: 200,
            statusText: "OK",
        }),
    });
};

describe("API host resolution", () => {
    test("production ignores a localhost value leaked in from the development environment", () => {
        expect(resolveHost("http://localhost:3001", "https://auth.heroesofcrypto.io", true)).toBe(
            "https://auth.heroesofcrypto.io",
        );
        expect(resolveHost("http://127.0.0.1:3001", "https://game.heroesofcrypto.io", true)).toBe(
            "https://game.heroesofcrypto.io",
        );
    });

    test("development and explicit same-origin builds keep their intended routing", () => {
        expect(resolveHost("http://localhost:3001", "https://auth.heroesofcrypto.io", false)).toBe(
            "http://localhost:3001",
        );
        expect(resolveHost("same-origin", "https://auth.heroesofcrypto.io", true)).toBe("");
    });
});

describe("axios token rotation", () => {
    test("auth, matchmaking, and game responses all normalize and install refreshed tokens", async () => {
        setStoredAccessToken(makeToken("initial", 3_600));

        for (const [marker, instance, lifetimeSeconds] of [
            ["auth", axiosAuthInstance, 3_601],
            ["matchmaking", axiosMMInstance, 3_602],
            ["game", axiosGameInstance, 3_603],
        ] as const) {
            const rawToken = makeToken(marker, lifetimeSeconds);
            await respondWithRotation(instance, rawToken);
            const normalized = `Bearer ${rawToken}`;

            expect(localStorage.getItem("accessToken")).toBe(normalized);
            expect(axiosAuthInstance.defaults.headers.common.Authorization).toBe(normalized);
            expect(axiosMMInstance.defaults.headers.common.Authorization).toBe(normalized);
            expect(axiosGameInstance.defaults.headers.common.Authorization).toBe(normalized);
        }
    });

    test("a malformed refresh header cannot replace the current session", async () => {
        const current = `Bearer ${makeToken("current")}`;
        setStoredAccessToken(current);

        await respondWithRotation(axiosAuthInstance, "not-a-jwt");

        expect(localStorage.getItem("accessToken")).toBe(current);
        expect(axiosAuthInstance.defaults.headers.common.Authorization).toBe(current);
    });

    test("a late older rotation cannot roll the session backward", async () => {
        setStoredAccessToken(makeToken("current", 3_600));
        const newer = makeToken("newer", 7_200);
        const older = makeToken("older", 4_000);

        await respondWithRotation(axiosMMInstance, newer);
        await respondWithRotation(axiosGameInstance, older);

        expect(localStorage.getItem("accessToken")).toBe(`Bearer ${newer}`);
        expect(axiosGameInstance.defaults.headers.common.Authorization).toBe(`Bearer ${newer}`);
    });

    test("a late response cannot resurrect a session after logout", async () => {
        const rotated = makeToken("late-after-logout", 7_200);
        setStoredAccessToken(makeToken("request-session", 3_600));
        setStoredAccessToken(null);

        await respondWithRotation(axiosAuthInstance, rotated);

        expect(localStorage.getItem("accessToken")).toBeNull();
        expect(axiosAuthInstance.defaults.headers.common.Authorization).toBeUndefined();
        expect(axiosMMInstance.defaults.headers.common.Authorization).toBeUndefined();
        expect(axiosGameInstance.defaults.headers.common.Authorization).toBeUndefined();
    });

    test("a late response from an old session cannot replace a newer login", async () => {
        const oldSessionRotation = makeToken("old-session-response", 10_800, "session-a");
        const newLogin = `Bearer ${makeToken("new-login", 3_600, "session-b")}`;
        setStoredAccessToken(makeToken("old-request", 3_600, "session-a"));
        setStoredAccessToken(newLogin);

        await respondWithRotation(axiosGameInstance, oldSessionRotation);

        expect(localStorage.getItem("accessToken")).toBe(newLogin);
        expect(axiosGameInstance.defaults.headers.common.Authorization).toBe(newLogin);
    });

    test("an equal-expiry token does not churn the same session", async () => {
        const exp = Math.floor(Date.now() / 1000) + 3_600;
        const current = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
            exp,
            marker: "current",
            sessionId: "session-a",
        })}.current-signature`;
        const equalExpiry = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
            exp,
            marker: "equal",
            sessionId: "session-a",
        })}.equal-signature`;
        setStoredAccessToken(current);

        await respondWithRotation(axiosMMInstance, equalExpiry);

        expect(localStorage.getItem("accessToken")).toBe(`Bearer ${current}`);
    });
});
