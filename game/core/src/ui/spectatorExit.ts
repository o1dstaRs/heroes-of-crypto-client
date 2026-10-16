/**
 * Where a spectator lands when they stop watching (owner 2026-08-06): a watcher who came through a lobby room
 * goes back to that lobby, one who followed a friend's Spectate goes to the arena with the friends panel open,
 * and anyone else goes to the website's main page. Website Watch links do a full page load, so they arrive with
 * no router state and fall into that last case.
 */
export interface SpectatorOrigin {
    from?: string;
    lobbyId?: string;
}

export type SpectatorExit =
    | { kind: "route"; path: string; openFriends: boolean }
    /** A site path, resolved against this deployment's site origin by the caller. */
    | { kind: "site"; path: string };

export const spectatorExitFor = (origin: SpectatorOrigin | null | undefined): SpectatorExit => {
    if (origin?.from === "lobby") {
        return { kind: "route", path: origin.lobbyId ? `/lobby/${origin.lobbyId}` : "/lobbies", openFriends: false };
    }
    if (origin?.from === "friends") {
        return { kind: "route", path: "/play", openFriends: true };
    }
    return { kind: "site", path: "/" };
};
