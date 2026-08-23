export const ACCESS_TOKEN_STORAGE_KEY = "accessToken";

type AccessTokenListener = (accessToken: string | null) => void;

const listeners = new Set<AccessTokenListener>();
let expirationTimer: ReturnType<typeof setTimeout> | undefined;

const storage = (): Storage | undefined => {
    return typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage;
};

const bareToken = (accessToken: string): string => accessToken.replace(/^Bearer\s+/i, "").trim();

/** Keep every token crossing an origin/response boundary in the one form the API accepts. */
export const normalizeAccessToken = (accessToken: string | null | undefined): string | null => {
    const trimmed = accessToken?.trim();
    if (!trimmed) {
        return null;
    }

    const token = bareToken(trimmed);
    return token ? `Bearer ${token}` : null;
};

const jwtPayload = (accessToken: string): Record<string, unknown> => {
    const token = bareToken(accessToken);
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) {
        throw new Error("Malformed JWT");
    }

    const base64 = parts[1]
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const jsonPayload = decodeURIComponent(
        atob(base64)
            .split("")
            .map((character) => `%${`00${character.charCodeAt(0).toString(16)}`.slice(-2)}`)
            .join(""),
    );
    const decoded = JSON.parse(jsonPayload) as unknown;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
        throw new Error("Malformed JWT payload");
    }
    return decoded as Record<string, unknown>;
};

/** A malformed, stale, or missing token is ordinary unauthenticated state, never a bootstrap exception. */
export const tokenExpSafe = (accessToken: string | null | undefined): number | null => {
    const normalized = normalizeAccessToken(accessToken);
    if (!normalized) {
        return null;
    }
    try {
        const exp = jwtPayload(normalized).exp;
        return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
    } catch {
        return null;
    }
};

/** The server-side session identity carried by a JWT, or null for any untrusted shape. */
export const tokenSessionIdSafe = (accessToken: string | null | undefined): string | null => {
    const normalized = normalizeAccessToken(accessToken);
    if (!normalized) {
        return null;
    }
    try {
        const sessionId = jwtPayload(normalized).sessionId;
        return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null;
    } catch {
        return null;
    }
};

export const isValidAccessToken = (accessToken: string | null | undefined, nowSeconds = Date.now() / 1000): boolean => {
    const exp = tokenExpSafe(accessToken);
    return exp !== null && exp > nowSeconds;
};

/**
 * Cross-origin cookies and URL fragments are one-shot handoffs, not the store of record. Only a
 * live token newer than the browser's current session may replace it.
 */
export const shouldAdoptAccessToken = (
    candidate: string | null | undefined,
    current: string | null | undefined,
    nowSeconds = Date.now() / 1000,
): boolean => {
    const candidateExp = tokenExpSafe(candidate);
    if (candidateExp === null || candidateExp <= nowSeconds) {
        return false;
    }

    const currentExp = tokenExpSafe(current);
    return currentExp === null || currentExp <= nowSeconds || candidateExp > currentExp;
};

/**
 * A response refresh is not an SSO handoff: it may only extend the live session which sent the
 * request. Requiring the same session id prevents a late response from reviving a logout or
 * replacing a newer login from another tab.
 */
export const shouldAdoptAccessTokenRotation = (
    candidate: string | null | undefined,
    current: string | null | undefined,
    nowSeconds = Date.now() / 1000,
): boolean => {
    const candidateExp = tokenExpSafe(candidate);
    const currentExp = tokenExpSafe(current);
    if (candidateExp === null || currentExp === null || candidateExp <= nowSeconds || currentExp <= nowSeconds) {
        return false;
    }

    const candidateSessionId = tokenSessionIdSafe(candidate);
    const currentSessionId = tokenSessionIdSafe(current);
    return candidateSessionId !== null && candidateSessionId === currentSessionId && candidateExp > currentExp;
};

export type AccessTokenHashHandoff = {
    found: boolean;
    tokenToAdopt: string | null;
};

/** Parse the site-to-game hash without allowing an old site session to clobber a live game session. */
export const resolveAccessTokenHashHandoff = (
    hash: string,
    current: string | null | undefined,
    nowSeconds = Date.now() / 1000,
): AccessTokenHashHandoff => {
    const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;
    const params = new URLSearchParams(rawHash);
    const candidate = params.get("access_token") ?? params.get(ACCESS_TOKEN_STORAGE_KEY);
    if (candidate === null) {
        return { found: false, tokenToAdopt: null };
    }
    return {
        found: true,
        tokenToAdopt: shouldAdoptAccessToken(candidate, current, nowSeconds) ? normalizeAccessToken(candidate) : null,
    };
};

const notifyListeners = (accessToken: string | null): void => {
    for (const listener of listeners) {
        listener(accessToken);
    }
};

const clearExpirationTimer = (): void => {
    if (expirationTimer !== undefined) {
        clearTimeout(expirationTimer);
        expirationTimer = undefined;
    }
};

const scheduleExpiration = (accessToken: string): void => {
    clearExpirationTimer();
    const exp = tokenExpSafe(accessToken);
    if (exp === null) {
        return;
    }

    const delayMs = Math.max(0, exp * 1000 - Date.now());
    expirationTimer = setTimeout(() => {
        expirationTimer = undefined;

        // A callback from an older rotation must never erase the newer session that replaced it.
        if (normalizeAccessToken(storage()?.getItem(ACCESS_TOKEN_STORAGE_KEY)) !== accessToken) {
            return;
        }

        storage()?.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        notifyListeners(null);
        if (typeof window !== "undefined") {
            window.location.href = "/";
        }
    }, delayMs);
    if (typeof expirationTimer === "object" && "unref" in expirationTimer) {
        expirationTimer.unref();
    }
};

/** Persist, normalize, schedule, and publish one access-token update atomically. */
export const setStoredAccessToken = (accessToken: string | null | undefined): string | null => {
    const normalized = normalizeAccessToken(accessToken);
    if (!normalized) {
        clearExpirationTimer();
        storage()?.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        notifyListeners(null);
        return null;
    }

    storage()?.setItem(ACCESS_TOKEN_STORAGE_KEY, normalized);
    scheduleExpiration(normalized);
    notifyListeners(normalized);
    return normalized;
};

/** Adopt a rotation only when it advances the current live session; late responses may arrive out of order. */
export const adoptRotatedStoredAccessToken = (accessToken: string | null | undefined): string | null => {
    const current = storage()?.getItem(ACCESS_TOKEN_STORAGE_KEY);
    return shouldAdoptAccessTokenRotation(accessToken, current)
        ? setStoredAccessToken(accessToken)
        : normalizeAccessToken(current);
};

export const registerAccessTokenListener = (listener: AccessTokenListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/** Keep tests isolated without unregistering the long-lived axios listener. */
export const resetAccessTokenTimerForTests = (): void => {
    clearExpirationTimer();
};
