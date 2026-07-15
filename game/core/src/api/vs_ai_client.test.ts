import { GamePublic, TeamVals } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import { endpoints } from "./axios";
import { createVsAiGame, type VsAiPost } from "./vs_ai_client";

describe("vs AI client", () => {
    test("posts the bodyless command and decodes the existing GamePublic response", async () => {
        const encoded = new GamePublic({
            id: "00000000-0000-4000-8000-000000000001",
            confirmed: true,
            init_time: 1234,
            abandoned: false,
            team: TeamVals.LOWER,
        }).serializeBinary();
        let requestedUrl = "";
        let requestedBody: null | undefined;
        let requestedConfig: Parameters<VsAiPost>[2] | undefined;
        const post: VsAiPost = async (url, body, config) => {
            requestedUrl = url;
            requestedBody = body;
            requestedConfig = config;
            return { data: encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) };
        };

        const game = await createVsAiGame(undefined, post);

        expect(requestedUrl).toBe(endpoints.mm.vsAi);
        expect(requestedBody).toBeNull();
        expect(requestedConfig?.responseType).toBe("arraybuffer");
        expect(requestedConfig?.headers["Content-Type"]).toBe("application/octet-stream");
        expect(requestedConfig?.headers["x-request-id"]).toHaveLength(36);
        expect(game).toMatchObject({
            id: "00000000-0000-4000-8000-000000000001",
            confirmed: true,
            team: TeamVals.LOWER,
        });
    });

    test("carries the selected difficulty tier as a query param", async () => {
        const encoded = new GamePublic({
            id: "00000000-0000-4000-8000-000000000002",
            confirmed: true,
            init_time: 1234,
            abandoned: false,
            team: TeamVals.UPPER,
        }).serializeBinary();
        let requestedUrl = "";
        const post: VsAiPost = async (url) => {
            requestedUrl = url;
            return { data: encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) };
        };

        await createVsAiGame("brutal", post);

        expect(requestedUrl).toBe(`${endpoints.mm.vsAi}?difficulty=brutal`);
    });

    test("rejects a response that cannot enter the confirmed pick flow", async () => {
        const post: VsAiPost = async () => ({ data: new Uint8Array() });
        const error = await createVsAiGame(undefined, post).catch((reason: unknown) => reason);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("AI match response was incomplete");
    });
});
