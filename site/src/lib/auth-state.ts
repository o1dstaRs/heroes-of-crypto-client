// Client-side view of the auth session. The site is statically rendered, so "am I logged in?" can
// only be answered in the browser from what the auth flow persisted to localStorage:
//   accessToken  — the bearer token (auth-client.ts stores it on login/register/verify)
//   hocAuthUser  — JSON of the server's ResponseMe (username, email, wins, losses, games, …)
// Everything here degrades to "logged out" if storage is unavailable or the payload is malformed.

export interface AuthUser {
    email?: string;
    username?: string;
    is_active?: boolean;
    wins?: number;
    losses?: number;
    total_games_played?: number;
    in_game_id?: string;
}

const TOKEN_KEY = "accessToken";
const USER_KEY = "hocAuthUser";

export function normalizeAuthToken(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) return null;

    const jwt = trimmed.replace(/^Bearer\s+/i, "").trim();
    return jwt ? `Bearer ${jwt}` : null;
}

export function authTokenExpiration(value: string | null | undefined): number | null {
    const normalized = normalizeAuthToken(value);
    if (!normalized) return null;

    try {
        const jwt = normalized.slice("Bearer ".length);
        const payload = jwt.split(".")[1];
        if (!payload) return null;

        const base64 = payload
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(Math.ceil(payload.length / 4) * 4, "=");
        const parsed = JSON.parse(atob(base64)) as unknown;
        if (!parsed || typeof parsed !== "object") return null;

        const exp = (parsed as { exp?: unknown }).exp;
        return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
    } catch {
        return null;
    }
}

export function isLiveAuthToken(value: string | null | undefined, nowMs = Date.now()): boolean {
    const exp = authTokenExpiration(value);
    return exp !== null && exp > nowMs / 1000;
}

function clearStoredAuth(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

export function getAuthToken(nowMs = Date.now()): string | null {
    try {
        const stored = localStorage.getItem(TOKEN_KEY);
        const normalized = normalizeAuthToken(stored);
        if (!normalized || !isLiveAuthToken(normalized, nowMs)) {
            clearStoredAuth();
            return null;
        }

        // Keep one canonical representation everywhere. In particular, X-New-Token is a raw JWT,
        // while every authenticated API expects an Authorization value with the Bearer scheme.
        if (stored !== normalized) {
            localStorage.setItem(TOKEN_KEY, normalized);
        }
        return normalized;
    } catch {
        return null;
    }
}

export function getAuthUser(): AuthUser | null {
    try {
        const raw = localStorage.getItem(USER_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === "object" ? (parsed as AuthUser) : null;
    } catch {
        return null;
    }
}

export function isLoggedIn(): boolean {
    return Boolean(getAuthToken());
}

// The label to greet the user by: their username, else the local part of their email, else a
// neutral fallback so a chip never renders empty.
export function displayName(user: AuthUser | null): string {
    const name = (user?.username ?? "").trim();
    if (name) return name;
    const email = (user?.email ?? "").trim();
    return email ? email.split("@")[0] : "Account";
}

export function logout(redirectTo = "/"): void {
    try {
        clearStoredAuth();
    } catch {
        // Storage disabled — nothing to clear; still navigate away.
    }
    globalThis.location.assign(redirectTo);
}

// Run `handler` now and whenever the session could have changed: another tab logging in/out
// (storage event) or this tab's own auth-client dispatching hoc-auth-success. Returns nothing;
// callers wire their own DOM sync.
export function onAuthStateChange(handler: () => void): void {
    handler();
    globalThis.addEventListener("storage", (event) => {
        if (event.key === TOKEN_KEY || event.key === USER_KEY || event.key === null) handler();
    });
    document.addEventListener("hoc-auth-success", handler);
}
