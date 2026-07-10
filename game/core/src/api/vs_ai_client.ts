import { GamePublic, type GamePublicObject } from "@heroesofcrypto/common";
import { v4 as uuidv4 } from "uuid";

import { axiosMMInstance, endpoints } from "./axios";

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

export const createVsAiGame = async (post: VsAiPost = postVsAi): Promise<GamePublicObject> => {
    const response = await post(endpoints.mm.vsAi, null, {
        responseType: "arraybuffer",
        headers: authHeaders(),
    });
    const game = GamePublic.deserializeBinary(toBytes(response.data)).toObject();
    if (!game.id || !game.confirmed) {
        throw new Error("AI match response was incomplete");
    }
    return game;
};
