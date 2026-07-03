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

export function getAuthToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY);
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
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
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
