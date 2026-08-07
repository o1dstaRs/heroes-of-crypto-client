import { describe, expect, test } from "bun:test";

import { ResponseMe } from "@heroesofcrypto/common/src/generated/protobuf/v1/messages_reexports";

import { exchangeGoogleCredential, googleLoginPath } from "./google-auth";

describe("marketing-site Google sign-in exchange", () => {
    test("uses the production route, sends only the ID credential, and decodes the authenticated session", async () => {
        const responseUser = new ResponseMe({
            username: "google-player",
            email: "player@gmail.com",
            is_active: true,
        });
        let requestedUrl = "";
        let requestedInit: RequestInit | undefined;

        const session = await exchangeGoogleCredential({
            authBaseUrl: "https://auth.heroesofcrypto.io/",
            credential: "  signed-google-id-token  ",
            isProd: true,
            requestId: "request-1",
            fetchImpl: async (url, init) => {
                requestedUrl = String(url);
                requestedInit = init;
                return new Response(responseUser.serializeBinary().buffer as ArrayBuffer, {
                    status: 200,
                    headers: { authorization: "Bearer hoc-session" },
                });
            },
        });

        expect(requestedUrl).toBe("https://auth.heroesofcrypto.io/v1/google-login");
        expect(requestedInit?.method).toBe("POST");
        expect(requestedInit?.headers).toEqual({
            "Content-Type": "application/json",
            "x-request-id": "request-1",
        });
        expect(requestedInit?.body).toBe('{"credential":"signed-google-id-token"}');
        expect(session.token).toBe("Bearer hoc-session");
        expect(session.user).toMatchObject({
            username: "google-player",
            email: "player@gmail.com",
            is_active: true,
        });
    });

    test("keeps local development on the namespaced auth route", () => {
        expect(googleLoginPath(false)).toBe("/v1/auth/google-login");
        expect(googleLoginPath(true)).toBe("/v1/google-login");
    });

    test("fails closed on missing credentials, rejected tokens, and tokenless success responses", async () => {
        let fetchCalls = 0;
        const countingFetch = async () => {
            fetchCalls += 1;
            return new Response();
        };

        await expect(
            exchangeGoogleCredential({
                authBaseUrl: "http://localhost:3001",
                credential: "   ",
                isProd: false,
                requestId: "empty",
                fetchImpl: countingFetch,
            }),
        ).rejects.toThrow("did not return a credential");
        expect(fetchCalls).toBe(0);

        await expect(
            exchangeGoogleCredential({
                authBaseUrl: "http://localhost:3001",
                credential: "bad-token",
                isProd: false,
                requestId: "rejected",
                fetchImpl: async () => new Response("Invalid Google credential", { status: 401 }),
            }),
        ).rejects.toThrow("Invalid Google credential");

        await expect(
            exchangeGoogleCredential({
                authBaseUrl: "http://localhost:3001",
                credential: "valid-token",
                isProd: false,
                requestId: "missing-session",
                fetchImpl: async () =>
                    new Response(new ResponseMe().serializeBinary().buffer as ArrayBuffer, { status: 200 }),
            }),
        ).rejects.toThrow("did not include a session token");
    });
});
