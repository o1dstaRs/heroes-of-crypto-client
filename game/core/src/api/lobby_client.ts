import {
    CreateLobbyRequest,
    JoinLobbyRequest,
    Lobby,
    LobbyList,
    ReadyRequest,
    type LobbyObject,
} from "@heroesofcrypto/common";
import { v4 as uuidv4 } from "uuid";

import { axiosMMInstance, buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "./axios";
import { toBytes } from "./ranked_play_client";

const STORAGE_KEY = "accessToken";

const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem(STORAGE_KEY);
    return {
        "Content-Type": "application/octet-stream",
        "x-request-id": uuidv4(),
        ...(token ? { Authorization: token } : {}),
    };
};

const eventHeaders = (): Record<string, string> => {
    const token = localStorage.getItem(STORAGE_KEY);
    return {
        Accept: "text/event-stream",
        ...(token ? { Authorization: token } : {}),
    };
};

const appendEncodedPath = (baseUrl: string, value: string): string =>
    `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(value)}`;

const decodeLobby = (data: unknown): LobbyObject => Lobby.deserializeBinary(toBytes(data)).toObject();

export const fetchPublicLobbies = async (): Promise<LobbyObject[]> => {
    const response = await axiosMMInstance.get(endpoints.mm.lobbies, {
        responseType: "arraybuffer",
        headers: authHeaders(),
    });
    return LobbyList.deserializeBinary(toBytes(response.data)).toObject().lobbies ?? [];
};

export const fetchLobby = async (lobbyId: string): Promise<LobbyObject> => {
    const response = await axiosMMInstance.get(appendEncodedPath(endpoints.mm.lobby, lobbyId), {
        responseType: "arraybuffer",
        headers: authHeaders(),
    });
    return decodeLobby(response.data);
};

export const createLobby = async (params: {
    name: string;
    isPrivate: boolean;
    pin: string;
}): Promise<LobbyObject> => {
    const body = CreateLobbyRequest.fromObject({
        name: params.name,
        is_private: params.isPrivate,
        pin: params.pin,
    });
    const response = await axiosMMInstance.post(endpoints.mm.lobbyCreate, body.serializeBinary(), {
        responseType: "arraybuffer",
        headers: authHeaders(),
    });
    return decodeLobby(response.data);
};

export const joinLobby = async (lobbyId: string, pin: string): Promise<LobbyObject> => {
    const body = JoinLobbyRequest.fromObject({ pin });
    const response = await axiosMMInstance.post(
        appendEncodedPath(endpoints.mm.lobbyJoin, lobbyId),
        body.serializeBinary(),
        { responseType: "arraybuffer", headers: authHeaders() },
    );
    return decodeLobby(response.data);
};

export const setLobbyReady = async (lobbyId: string, ready: boolean): Promise<LobbyObject> => {
    const body = ReadyRequest.fromObject({ ready });
    const response = await axiosMMInstance.post(
        appendEncodedPath(endpoints.mm.lobbyReady, lobbyId),
        body.serializeBinary(),
        { responseType: "arraybuffer", headers: authHeaders() },
    );
    return decodeLobby(response.data);
};

export const startLobby = async (lobbyId: string): Promise<LobbyObject> => {
    const response = await axiosMMInstance.post(appendEncodedPath(endpoints.mm.lobbyStart, lobbyId), new Uint8Array(), {
        responseType: "arraybuffer",
        headers: authHeaders(),
    });
    return decodeLobby(response.data);
};

export const leaveLobby = async (lobbyId: string): Promise<void> => {
    await axiosMMInstance.post(appendEncodedPath(endpoints.mm.lobbyLeave, lobbyId), new Uint8Array(), {
        headers: authHeaders(),
    });
};

const base64ToBytes = (b64: string): Uint8Array => {
    const binary = atob(b64.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

/**
 * Open the per-lobby SSE stream. Each frame is base64(protobuf Lobby); `onLobby` is invoked with the
 * decoded lobby state on every change. Returns when the stream ends or `signal` aborts.
 */
export const openLobbyEventStream = async (
    lobbyId: string,
    onLobby: (lobby: LobbyObject) => void,
    signal: AbortSignal,
): Promise<void> => {
    const url = appendEncodedPath(buildApiUrl(HOST_MATCHMAKING_API, endpoints.mm.lobbyEvents), lobbyId);
    const response = await fetch(url, { headers: eventHeaders(), mode: "cors", cache: "no-cache", signal });
    if (!response.ok || !response.body) {
        throw new Error(`Lobby event stream failed: ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
            const trimmed = frame.trim();
            if (!trimmed) {
                continue;
            }
            try {
                onLobby(Lobby.deserializeBinary(base64ToBytes(trimmed)).toObject());
            } catch (err) {
                console.error("Failed to decode lobby SSE frame", err);
            }
        }
    }
};
