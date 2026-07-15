import { GamePublic, type GamePublicObject } from "@heroesofcrypto/common";
import { v4 as uuidv4 } from "uuid";

import { axiosMMInstance, endpoints } from "./axios";
import { type VsAiDifficulty } from "../utils/aiOpponent";

const STORAGE_KEY = "accessToken";

interface VsAiResponse {
    data: unknown;
}

export type VsAiPost = (
    url: string,
    body: null,
    config: { responseType: "arraybuffer"; headers: Record<string, string> },
) => Promise<VsAiResponse>;

const authHeaders = (): Record<string, string> => {
    const token = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
    return {
        "Content-Type": "application/octet-stream",
        "x-request-id": uuidv4(),
        ...(token ? { Authorization: token } : {}),
    };
};

const toBytes = (data: unknown): Uint8Array => {
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return new Uint8Array();
};

const postVsAi: VsAiPost = (url, body, config) => axiosMMInstance.post(url, body, config);

export const createVsAiGame = async (
    difficulty?: VsAiDifficulty,
    post: VsAiPost = postVsAi,
): Promise<GamePublicObject> => {
    // The difficulty tier rides as a query param (easy=v0.4, normal=v0.6, hard=v0.7, brutal=v0.7 +
    // per-match rollout search — server api/game/v1/ai_seat.ts). Absent keeps the server's default seat.
    const url = difficulty ? `${endpoints.mm.vsAi}?difficulty=${difficulty}` : endpoints.mm.vsAi;
    const response = await post(url, null, {
        responseType: "arraybuffer",
        headers: authHeaders(),
    });
    const game = GamePublic.deserializeBinary(toBytes(response.data)).toObject();
    if (!game.id || !game.confirmed) {
        throw new Error("AI match response was incomplete");
    }
    return game;
};
