import axios, { AxiosRequestConfig, AxiosInstance } from "axios";

/** Narrowed shape for Vite-like env bag */
interface ImportMetaEnvLike {
    [key: string]: string | boolean | undefined;
    PROD?: boolean;
    VITE_HOST_AUTH_API?: string;
    VITE_HOST_MATCHMAKING_API?: string;
    VITE_HOST_GAME_API?: string;
}

/** Access Vite env in browser (or undefined on server / non-Vite builds) */
function getViteEnv(): ImportMetaEnvLike | undefined {
    // Use unknown cast + structural narrowing (no `any`)
    const meta = (typeof import.meta !== "undefined" ? (import.meta as unknown) : undefined) as
        | { env?: ImportMetaEnvLike }
        | undefined;
    return meta?.env;
}

/** Safely read string env var from Vite first, then process.env */
function readEnvString(keyVite: keyof ImportMetaEnvLike, keyNode: string): string | undefined {
    const vite = getViteEnv();
    if (vite && typeof vite[keyVite] === "string") return vite[keyVite] as string;
    if (typeof process !== "undefined" && typeof process.env !== "undefined") {
        const v = process.env[keyNode];
        if (typeof v === "string" && v.length > 0) return v;
    }
    return undefined;
}

/** Safely read boolean env (Vite’s PROD or NODE_ENV) */
function readIsProd(): boolean {
    const vite = getViteEnv();
    if (typeof vite?.PROD === "boolean") return vite.PROD;
    if (typeof process !== "undefined" && typeof process.env !== "undefined") {
        return process.env.NODE_ENV === "production";
    }
    return false;
}

const IS_PROD = readIsProd();

export const HOST_AUTH_API = readEnvString("VITE_HOST_AUTH_API", "HOST_AUTH_API");
export const HOST_MATCHMAKING_API = readEnvString("VITE_HOST_MATCHMAKING_API", "HOST_MATCHMAKING_API");
export const HOST_GAME_API = readEnvString("VITE_HOST_GAME_API", "HOST_GAME_API");

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

/** Narrowed localStorage guard so server imports don’t explode */
function setAccessTokenSafely(token: string): void {
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.setItem("accessToken", token);
    }
}

/* ----------------------------- Interceptors ------------------------------ */

axiosAuthInstance.interceptors.response.use(
    (res) => {
        const hdrs = res.headers ?? {};
        const newToken = (hdrs as Record<string, unknown>)["x-new-token"];
        if (typeof newToken === "string" && newToken.length > 0) {
            setAccessTokenSafely(newToken);
        }
        // copy headers to keep shape stable
        res.headers = { ...res.headers };
        return res;
    },
    (error) => {
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
    },
);

axiosMMInstance.interceptors.response.use(
    (res) => {
        res.headers = { ...res.headers };
        return res;
    },
    (error) => {
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
    },
);

axiosGameInstance.interceptors.response.use(
    (res) => {
        res.headers = { ...res.headers };
        return res;
    },
    (error) => {
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
    },
);

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
    },
    mm: {
        queue: IS_PROD ? "/v1/queue" : "/v1/mm/queue",
        events: IS_PROD ? "/v1/events" : "/v1/mm/events",
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
        pick: IS_PROD ? "/v1/pick" : "/v1/game/pick",
        ban: IS_PROD ? "/v1/ban" : "/v1/game/ban",
        reveal: IS_PROD ? "/v1/reveal" : "/v1/game/reveal",
    },
};
