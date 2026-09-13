import { describe, expect, test } from "bun:test";

import {
    createSandboxCoop,
    joinSandboxCoop,
    sandboxCoopErrorMessage,
    sandboxCoopPath,
    type SandboxCoopPost,
} from "./sandbox_coop_client";

const SESSION = {
    gameId: "11111111-0000-4000-8000-000000000001",
    team: 2,
    host: { playerId: "h", username: "host", team: 2, connected: true, ready: false },
    guest: { playerId: "g", username: "guest", team: 1, connected: false, ready: false },
    phase: 1,
    fightStarted: false,
    fightFinished: false,
};

describe("sandbox_coop_client", () => {
    test("create posts the friend id as JSON and returns the session", async () => {
        const calls: { url: string; body: unknown; contentType?: string }[] = [];
        const post: SandboxCoopPost = (url, body, config) => {
            calls.push({ url, body, contentType: config.headers["Content-Type"] });
            return Promise.resolve({ data: SESSION });
        };
        const session = await createSandboxCoop("g", post);
        expect(session.gameId).toBe(SESSION.gameId);
        expect(calls[0]?.url.endsWith("sandbox-create")).toBe(true);
        expect(calls[0]?.body).toEqual({ toPlayerId: "g" });
        expect(calls[0]?.contentType).toBe("application/json");
    });

    test("join addresses the session id on the path and rejects an empty answer", async () => {
        const urls: string[] = [];
        const post: SandboxCoopPost = (url) => {
            urls.push(url);
            return Promise.resolve({ data: SESSION });
        };
        await joinSandboxCoop(SESSION.gameId, post);
        expect(urls[0]?.endsWith(`sandbox-join/${SESSION.gameId}`)).toBe(true);
        await expect(joinSandboxCoop(SESSION.gameId, () => Promise.resolve({ data: {} }))).rejects.toThrow(
            "Sandbox response was incomplete",
        );
    });

    test("links and error wording", () => {
        expect(sandboxCoopPath("abc")).toBe("/sandbox/abc");
        expect(sandboxCoopErrorMessage({ response: { status: 409, data: "" } }, "x")).toContain("already in a game");
        expect(sandboxCoopErrorMessage({ response: { status: 403, data: "Only friends" } }, "x")).toBe("Only friends");
        expect(sandboxCoopErrorMessage({ response: { status: 404, data: "" } }, "x")).toContain("no longer open");
        expect(sandboxCoopErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
    });
});
