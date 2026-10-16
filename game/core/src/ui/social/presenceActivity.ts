/**
 * What this client reports it is doing with each presence ping, derived from the route. Coarser truths
 * (a live game, the matchmaking queue) come from the server's own records and win over this in the
 * friends list; this covers the rest — the sandbox, a lobby room, browsing, the arena.
 */
export type PresenceActivityKind = "arena" | "lobbies" | "lobby" | "sandbox" | "coop" | "game" | "portal" | "idle";

export interface PresenceActivity {
    kind: PresenceActivityKind;
    lobbyId?: string;
}

export const activityForPath = (pathname: string): PresenceActivity => {
    const lobby = /^\/lobby\/([^/?#]+)/.exec(pathname);
    if (lobby) {
        return { kind: "lobby", lobbyId: decodeURIComponent(lobby[1]) };
    }
    if (pathname === "/lobbies") {
        return { kind: "lobbies" };
    }
    if (pathname.startsWith("/sandbox/")) {
        return { kind: "coop" };
    }
    if (pathname === "/" || pathname === "") {
        return { kind: "sandbox" };
    }
    if (pathname === "/play") {
        return { kind: "arena" };
    }
    if (pathname.startsWith("/game/")) {
        return { kind: "game" };
    }
    if (pathname.startsWith("/portal")) {
        return { kind: "portal" };
    }
    return { kind: "idle" };
};
