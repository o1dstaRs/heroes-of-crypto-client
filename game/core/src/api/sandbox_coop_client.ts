import { v4 as uuidv4 } from "uuid";

import { axiosGameInstance, endpoints } from "./axios";

/**
 * Client for the friend co-op sandbox (server: game role, `sandbox-create` / `sandbox-join`). Plain JSON
 * over the game host. Creating opens a sandbox session with you in the green seat and drops a direct-link
 * invite into ONE friend's notification tray; joining resolves your seat from that link (or on a reload).
 */

const STORAGE_KEY = "accessToken";

const authHeaders = (): Record<string, string> => {
    const token = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
    return {
        "Content-Type": "application/json",
        "x-request-id": uuidv4(),
        ...(token ? { Authorization: token } : {}),
    };
};

export interface SandboxCoopSeat {
    playerId: string;
    username: string;
    team: number;
    connected: boolean;
    ready: boolean;
}

export interface SandboxCoopSession {
    gameId: string;
    /** The caller's own seat: LEFT (green) for the host, RIGHT (red) for the invited friend. */
    team: number;
    host: SandboxCoopSeat;
    guest: SandboxCoopSeat;
    phase: number;
    fightStarted: boolean;
    fightFinished: boolean;
}

export type SandboxCoopPost = (
    url: string,
    body: unknown,
    config: { headers: Record<string, string> },
) => Promise<{ data: unknown }>;

const postJson: SandboxCoopPost = (url, body, config) => axiosGameInstance.post(url, body, config);

const appendEncodedPath = (baseUrl: string, value: string): string =>
    `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(value)}`;

const asSession = (data: unknown): SandboxCoopSession => {
    const session = data as SandboxCoopSession | null;
    if (!session || typeof session.gameId !== "string" || !session.gameId) {
        throw new Error("Sandbox response was incomplete");
    }
    return session;
};

export const createSandboxCoop = async (
    toPlayerId: string,
    post: SandboxCoopPost = postJson,
): Promise<SandboxCoopSession> =>
    asSession((await post(endpoints.game.sandboxCreate, { toPlayerId }, { headers: authHeaders() })).data);

export const joinSandboxCoop = async (gameId: string, post: SandboxCoopPost = postJson): Promise<SandboxCoopSession> =>
    asSession((await post(appendEncodedPath(endpoints.game.sandboxJoin, gameId), {}, { headers: authHeaders() })).data);

/** The sandbox route for a session id — what the invite notification links to. */
export const sandboxCoopPath = (gameId: string): string => `/sandbox/${encodeURIComponent(gameId)}`;

/**
 * Human wording for a failed create/join. The server answers with a plain-text reason for the cases a
 * player can act on (already in a game, not friends, sandbox closed); anything else gets the fallback.
 */
export const sandboxCoopErrorMessage = (err: unknown, fallback: string): string => {
    const response = (err as { response?: { status?: number; data?: unknown } })?.response;
    const data = response?.data;
    if (typeof data === "string" && data.length > 0 && data.length < 200) {
        return data;
    }
    if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string") {
        return (data as { message: string }).message;
    }
    if (response?.status === 409) {
        return "One of you is already in a game — finish it first";
    }
    if (response?.status === 403) {
        return "You can only invite friends into your sandbox";
    }
    if (response?.status === 404) {
        return "This sandbox is no longer open";
    }
    return fallback;
};
