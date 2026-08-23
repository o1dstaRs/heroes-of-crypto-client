import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { withGameAuthToken } from "./auth-handoff";

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

describe("site to game auth handoff", () => {
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

    test("adds the selected live bearer while preserving query and unrelated fragment values", () => {
        const raw = token(Math.floor(Date.now() / 1000) + 3600);
        values.set("accessToken", raw);
        const target = new URL("https://app.heroesofcrypto.io/play?mode=ranked#view=compact");
        const result = withGameAuthToken(target);

        expect(result.search).toBe("?mode=ranked");
        expect(new URLSearchParams(result.hash.slice(1)).get("view")).toBe("compact");
        expect(new URLSearchParams(result.hash.slice(1)).get("access_token")).toBe(`Bearer ${raw}`);
        expect(values.get("accessToken")).toBe(`Bearer ${raw}`);
        expect(target.hash).toBe("#view=compact");
    });

    test("does not forward an expired site token and clears its cached account", () => {
        values.set("accessToken", token(Math.floor(Date.now() / 1000) - 3600));
        values.set("hocAuthUser", '{"username":"stale"}');
        const target = new URL(
            "https://app.heroesofcrypto.io/play?vol=0.4&muted=0#access_token=Bearer+stale.jwt.token&view=compact",
        );
        const result = withGameAuthToken(target);
        const hash = new URLSearchParams(result.hash.slice(1));

        expect(result.search).toBe("?vol=0.4&muted=0");
        expect(hash.has("access_token")).toBe(false);
        expect(hash.get("view")).toBe("compact");
        expect(values.size).toBe(0);
    });

    test("replaces either legacy handoff key with the selected token", () => {
        const raw = token(Math.floor(Date.now() / 1000) + 3600);
        values.set("accessToken", `Bearer ${raw}`);
        const target = new URL("https://app.heroesofcrypto.io/#accessToken=old.jwt.token");
        const result = withGameAuthToken(target);
        const hash = new URLSearchParams(result.hash.slice(1));

        expect(hash.has("accessToken")).toBe(false);
        expect(hash.get("access_token")).toBe(`Bearer ${raw}`);
    });

    test("sends production lobbies to the game client rather than the authenticated game API", async () => {
        const source = await Bun.file(new URL("../pages/play/lobbies.astro", import.meta.url)).text();

        // The client lives at app.; game. is the authenticated game API. Sending players to the API
        // hostname would hand them a 401 instead of a lobby, which is the mistake this guards.
        expect(source).toContain('? ["https://app.heroesofcrypto.io"]');
        expect(source).not.toContain('? ["https://game.heroesofcrypto.io"]');
    });
});
