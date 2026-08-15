import { getAuthToken } from "./auth-state";

/**
 * Add the site's live session to a cross-origin game URL without ever forwarding an expired token.
 * The fragment keeps the bearer out of HTTP requests and is consumed by the game client on boot.
 */
export function withGameAuthToken(target: URL): URL {
    const next = new URL(target.toString());
    const hashParams = new URLSearchParams(next.hash.startsWith("#") ? next.hash.slice(1) : next.hash);
    const token = getAuthToken();

    // A configured target may already carry an old handoff. Never preserve it when this origin no
    // longer owns a live session, and use one canonical key when it does.
    hashParams.delete("access_token");
    hashParams.delete("accessToken");
    if (token) {
        hashParams.set("access_token", token);
    }

    next.hash = hashParams.toString();
    return next;
}
