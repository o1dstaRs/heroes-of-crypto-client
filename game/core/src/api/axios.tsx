import axios, { AxiosRequestConfig, AxiosInstance } from "axios";

import { adoptRotatedStoredAccessToken, registerAccessTokenListener } from "./access_token";

const DEFAULT_DEV_API = "http://127.0.0.1:3001";
const PROD_AUTH_API = "https://auth.heroesofcrypto.io";
const PROD_MATCHMAKING_API = "https://mm.heroesofcrypto.io";
const PROD_GAME_API = "https://game.heroesofcrypto.io";

// Prod detection MUST be robust. The old code read env via a dynamic `env[key]` lookup, which Vite
// cannot statically inline — so in the production bundle IS_PROD came out false and every host fell
// back to the dev default (127.0.0.1:3001), while endpoint paths used the dev "/v1/auth/*" form. The
// game could then never reach the real auth API: /me hit a dead localhost URL, auth failed, and the
// client dropped straight to its own login. The authoritative signal is the runtime host — any
// *.heroesofcrypto.io (or the apex) is production. We still honour Vite's literal build flags as a
// secondary signal (these ARE inlined because they're read directly, not through a variable key).
const runtimeHost = typeof window !== "undefined" ? window.location.hostname : "";
// `import.meta.env.PROD` is a real boolean at runtime (Vite inlines it), but the ambient type here is
// string|undefined — cast through unknown so the literal read still inlines while TS stays happy.
const viteProd = import.meta.env.PROD as unknown;
const IS_PROD =
    runtimeHost === "heroesofcrypto.io" ||
    runtimeHost.endsWith(".heroesofcrypto.io") ||
    viteProd === true ||
    viteProd === "true" ||
    import.meta.env.VITE_IS_PROD === "true";

// Read each var with a LITERAL `import.meta.env.X` so Vite inlines it at build. Fall back to the
// hard-coded prod origin (never localhost) whenever we're in production, so a missing env var can't
// silently point the game at a dev API again.
//
// The literal value "same-origin" resolves to an EMPTY host: every API call then goes to whatever
// origin served the client (buildApiUrl falls back to window.location.origin; the axios instances
// get no baseURL, i.e. relative requests). Single-box rigs — UI and APIs on one port — build with
// this so the SAME bundle works from a LAN IP, a public hostname, or a tunnel, no rebake needed.
const isLoopbackOrigin = (value: string): boolean => {
    try {
        const hostname = new URL(value).hostname.toLowerCase();
        return (
            hostname === "localhost" ||
            hostname.endsWith(".localhost") ||
            hostname === "0.0.0.0" ||
            hostname === "::1" ||
            hostname === "[::1]" ||
            hostname.startsWith("127.")
        );
    } catch {
        return false;
    }
};

export const resolveHost = (configured: string | undefined, fallback: string, production = IS_PROD): string => {
    if (configured === "same-origin") {
        return "";
    }
    if (production && configured && isLoopbackOrigin(configured)) {
        return fallback;
    }
    return configured || fallback;
};
export const HOST_AUTH_API = resolveHost(import.meta.env.VITE_HOST_AUTH_API, IS_PROD ? PROD_AUTH_API : DEFAULT_DEV_API);
export const HOST_MATCHMAKING_API = resolveHost(
    import.meta.env.VITE_HOST_MATCHMAKING_API,
    IS_PROD ? PROD_MATCHMAKING_API : DEFAULT_DEV_API,
);
export const HOST_GAME_API = resolveHost(import.meta.env.VITE_HOST_GAME_API, IS_PROD ? PROD_GAME_API : DEFAULT_DEV_API);

const isAbsoluteUrl = (url: string): boolean => /^[a-z][a-z\d+\-.]*:\/\//i.test(url) || url.startsWith("//");

export const buildApiUrl = (baseUrl: string | undefined, path: string): string => {
    if (isAbsoluteUrl(path)) {
        return path;
    }

    const base = baseUrl && baseUrl.length > 0 ? baseUrl : typeof window !== "undefined" ? window.location.origin : "";
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    if (!base) {
        return normalizedPath;
    }

    return `${base.replace(/\/+$/, "")}${normalizedPath}`;
};

/** Create axios instance with optional baseURL */
function createAxios(baseURL?: string): AxiosInstance {
    return axios.create({ baseURL: baseURL && baseURL.length > 0 ? baseURL : undefined });
}

export const axiosAuthInstance = createAxios(HOST_AUTH_API);
export const axiosMMInstance = createAxios(HOST_MATCHMAKING_API);
export const axiosGameInstance = createAxios(HOST_GAME_API);

const syncAuthorizationDefaults = (accessToken: string | null): void => {
    for (const instance of [axiosAuthInstance, axiosMMInstance, axiosGameInstance]) {
        if (accessToken) {
            instance.defaults.headers.common.Authorization = accessToken;
        } else {
            delete instance.defaults.headers.common.Authorization;
        }
    }
};

registerAccessTokenListener(syncAuthorizationDefaults);

const adoptRotatedAccessToken = (headers: unknown): void => {
    if (!headers || typeof headers !== "object") {
        return;
    }
    const headerRecord = headers as Record<string, unknown> & { get?: (name: string) => unknown };
    const newToken =
        (typeof headerRecord.get === "function" ? headerRecord.get("x-new-token") : undefined) ??
        headerRecord["x-new-token"] ??
        headerRecord["X-New-Token"];
    if (typeof newToken === "string") {
        adoptRotatedStoredAccessToken(newToken);
    }
};

const handleSuccessfulResponse = <T extends { headers?: unknown }>(response: T): T => {
    adoptRotatedAccessToken(response.headers);
    response.headers = { ...(response.headers as Record<string, unknown> | undefined) };
    return response;
};

/* ----------------------------- Interceptors ------------------------------ */

axiosAuthInstance.interceptors.response.use(handleSuccessfulResponse, (error) => {
    // 400 with non-string body, or string not starting with "Password matches" -> generic input error
    if (
        error?.response?.status === 400 &&
        (!error.response.data ||
            typeof error.response.data !== "string" ||
            !error.response.data.startsWith("Password matches"))
    ) {
        error.message = "Request failed: Invalid inputs";
    }

    const d = error?.response?.data;
    if (typeof d === "string" && d !== "Bad Request") {
        return Promise.reject(`Request failed: ${d}`);
    }
    return Promise.reject(error);
});

axiosMMInstance.interceptors.response.use(handleSuccessfulResponse, (error) => {
    const status = error?.response?.status as number | undefined;
    if (status === 409) return Promise.reject(new Error("Already in game"));
    if (status === 401) return Promise.reject(new Error("Unauthorized"));

    const data = error?.response?.data;
    if (data instanceof ArrayBuffer) {
        const buf = new Uint8Array(data);
        let s = "";
        for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
        return Promise.reject(new Error(s));
    }

    if (typeof data === "string" && data !== "Bad Request") {
        return Promise.reject(new Error(`Request failed: ${data}`));
    }
    return Promise.reject(error);
});

axiosGameInstance.interceptors.response.use(handleSuccessfulResponse, (error) => {
    const status = error?.response?.status as number | undefined;
    if (status === 401) return Promise.reject(new Error("Unauthorized"));

    const data = error?.response?.data;
    if (data instanceof ArrayBuffer) {
        const buf = new Uint8Array(data);
        let s = "";
        for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
        return Promise.reject(new Error(s));
    }

    if (typeof data === "string" && data !== "Bad Request") {
        return Promise.reject(new Error(`Request failed: ${data}`));
    }
    return Promise.reject(error);
});

/* -------------------------------- Fetcher -------------------------------- */

export const authFetcher = async (args: string | [string, AxiosRequestConfig]) => {
    const [url, config] = Array.isArray(args) ? args : [args];
    const res = await axiosAuthInstance.get(url, { ...config });
    return res.data as unknown;
};

/* -------------------------------- Endpoints ------------------------------ */

export const endpoints = {
    auth: {
        me: IS_PROD ? "/v1/me" : "/v1/auth/me",
        portal: IS_PROD ? "/v1/portal" : "/v1/auth/portal",
        login: IS_PROD ? "/v1/login" : "/v1/auth/login",
        logout: IS_PROD ? "/v1/logout" : "/v1/auth/logout",
        register: IS_PROD ? "/v1/register" : "/v1/auth/register",
        confirmCode: IS_PROD ? "/v1/confirm-verification-code" : "/v1/auth/confirm-verification-code",
        requestCode: IS_PROD ? "/v1/request-verification-code" : "/v1/auth/request-verification-code",
        requestPasswordReset: IS_PROD ? "/v1/request-password-reset" : "/v1/auth/request-password-reset",
        resetPassword: IS_PROD ? "/v1/reset-password" : "/v1/auth/reset-password",
        requestEmailLink: IS_PROD ? "/v1/request-email-link" : "/v1/auth/request-email-link",
        confirmEmailLink: IS_PROD ? "/v1/confirm-email-link" : "/v1/auth/confirm-email-link",
        walletNonce: IS_PROD ? "/v1/wallet-nonce" : "/v1/auth/wallet-nonce",
        walletLogin: IS_PROD ? "/v1/wallet-login" : "/v1/auth/wallet-login",
        walletLink: IS_PROD ? "/v1/wallet-link" : "/v1/auth/wallet-link",
        walletUnlink: IS_PROD ? "/v1/wallet-unlink" : "/v1/auth/wallet-unlink",
        walletList: IS_PROD ? "/v1/wallet-list" : "/v1/auth/wallet-list",
        googleLogin: IS_PROD ? "/v1/google-login" : "/v1/auth/google-login",
        googleLink: IS_PROD ? "/v1/google-link" : "/v1/auth/google-link",
        googleUnlink: IS_PROD ? "/v1/google-unlink" : "/v1/auth/google-unlink",
        googleStatus: IS_PROD ? "/v1/google-status" : "/v1/auth/google-status",
    },
    mm: {
        queue: IS_PROD ? "/v1/queue" : "/v1/mm/queue",
        online: IS_PROD ? "/v1/online" : "/v1/mm/online",
        events: IS_PROD ? "/v1/events" : "/v1/mm/events",
        vsAi: IS_PROD ? "/v1/vs-ai" : "/v1/mm/vs-ai",
        lobbies: IS_PROD ? "/v1/lobbies" : "/v1/mm/lobbies",
        lobby: IS_PROD ? "/v1/lobby" : "/v1/mm/lobby",
        lobbyEvents: IS_PROD ? "/v1/lobby-events" : "/v1/mm/lobby-events",
        lobbyCreate: IS_PROD ? "/v1/lobby-create" : "/v1/mm/lobby-create",
        lobbyPrice: IS_PROD ? "/v1/lobby-price" : "/v1/mm/lobby-price",
        lobbyJoin: IS_PROD ? "/v1/lobby-join" : "/v1/mm/lobby-join",
        lobbyReady: IS_PROD ? "/v1/lobby-ready" : "/v1/mm/lobby-ready",
        lobbyStart: IS_PROD ? "/v1/lobby-start" : "/v1/mm/lobby-start",
        lobbyLeave: IS_PROD ? "/v1/lobby-leave" : "/v1/mm/lobby-leave",
        lobbyShout: IS_PROD ? "/v1/lobby-shout" : "/v1/mm/lobby-shout",
        seasons: IS_PROD ? "/v1/seasons" : "/v1/mm/seasons",
        seasonCurrent: IS_PROD ? "/v1/season-current" : "/v1/mm/season-current",
        // Public ranked profile (username, placed MMR, league) — the observer HUD names each side.
        rankedProfile: IS_PROD ? "/v1/ranked-profile" : "/v1/mm/ranked-profile",
        // Public settled result: both seats' names, visible MMR movement and gold earned.
        rankedMatch: IS_PROD ? "/v1/ranked-match" : "/v1/mm/ranked-match",
    },
    // Authenticated social layer: notifications tray, friends/blocks, presence heartbeat.
    social: {
        presencePing: IS_PROD ? "/v1/presence-ping" : "/v1/mm/presence-ping",
        notifications: IS_PROD ? "/v1/notifications" : "/v1/mm/notifications",
        notificationsSeen: IS_PROD ? "/v1/notifications-seen" : "/v1/mm/notifications-seen",
        friendRequest: IS_PROD ? "/v1/friend-request" : "/v1/mm/friend-request",
        friendRespond: IS_PROD ? "/v1/friend-respond" : "/v1/mm/friend-respond",
        friendRemove: IS_PROD ? "/v1/friend-remove" : "/v1/mm/friend-remove",
        friendInvite: IS_PROD ? "/v1/friend-invite" : "/v1/mm/friend-invite",
        friendBlock: IS_PROD ? "/v1/friend-block" : "/v1/mm/friend-block",
        friendUnblock: IS_PROD ? "/v1/friend-unblock" : "/v1/mm/friend-unblock",
        friendMessages: IS_PROD ? "/v1/friend-messages" : "/v1/mm/friend-messages",
        friendMessage: IS_PROD ? "/v1/friend-message" : "/v1/mm/friend-message",
        friendMessagesRead: IS_PROD ? "/v1/friend-messages-read" : "/v1/mm/friend-messages-read",
        friendMute: IS_PROD ? "/v1/friend-mute" : "/v1/mm/friend-mute",
        friends: IS_PROD ? "/v1/friends" : "/v1/mm/friends",
        playerSearch: IS_PROD ? "/v1/player-search" : "/v1/mm/player-search",
        rankedBan: IS_PROD ? "/v1/ranked-ban" : "/v1/mm/ranked-ban",
        arenaChat: IS_PROD ? "/v1/arena-chat" : "/v1/mm/arena-chat",
        arenaChatPost: IS_PROD ? "/v1/arena-chat-post" : "/v1/mm/arena-chat-post",
        arenaChatUpvote: IS_PROD ? "/v1/arena-chat-upvote" : "/v1/mm/arena-chat-upvote",
        arenaChatReport: IS_PROD ? "/v1/arena-chat-report" : "/v1/mm/arena-chat-report",
        rankedStanding: IS_PROD ? "/v1/ranked-standing" : "/v1/mm/ranked-standing",
        predictionMarkets: IS_PROD ? "/v1/prediction-markets" : "/v1/mm/prediction-markets",
        predictionBet: IS_PROD ? "/v1/prediction-bet" : "/v1/mm/prediction-bet",
        predictionBets: IS_PROD ? "/v1/prediction-bets" : "/v1/mm/prediction-bets",
        wagerIntent: IS_PROD ? "/v1/ranked-wager-intent" : "/v1/mm/ranked-wager-intent",
        wager: IS_PROD ? "/v1/ranked-wager" : "/v1/mm/ranked-wager",
        wagerCall: IS_PROD ? "/v1/ranked-wager-call" : "/v1/mm/ranked-wager-call",
        wagerRaise: IS_PROD ? "/v1/ranked-wager-raise" : "/v1/mm/ranked-wager-raise",
    },
    game: {
        confirm: IS_PROD ? "/v1/confirm" : "/v1/game/confirm",
        abandon: IS_PROD ? "/v1/abandon" : "/v1/game/abandon",
        current: IS_PROD ? "/v1/current" : "/v1/game/current",
        pickEvents: IS_PROD ? "/v1/pick-events" : "/v1/game/pick-events",
        playEvents: IS_PROD ? "/v1/play-events" : "/v1/game/play-events",
        playReplay: IS_PROD ? "/v1/play-replay" : "/v1/game/play-replay",
        playSnapshot: IS_PROD ? "/v1/play-snapshot" : "/v1/game/play-snapshot",
        playAction: IS_PROD ? "/v1/play-action" : "/v1/game/play-action",
        pickPair: IS_PROD ? "/v1/pick-pair" : "/v1/game/pick-pair",
        // Public, spoiler-safe draft spectator snapshot (no auth): what each team's OPPONENT already
        // sees (slot reveals), plus bans and the current phase/deadline.
        pickObserve: IS_PROD ? "/v1/pick-observe" : "/v1/game/pick-observe",
        doctrine: IS_PROD ? "/v1/doctrine" : "/v1/game/doctrine",
        pick: IS_PROD ? "/v1/pick" : "/v1/game/pick",
        artifact: IS_PROD ? "/v1/artifact" : "/v1/game/artifact",
        ban: IS_PROD ? "/v1/ban" : "/v1/game/ban",
        reveal: IS_PROD ? "/v1/reveal" : "/v1/game/reveal",
    },
};
