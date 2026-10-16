import { describe, expect, test } from "bun:test";

import { spectatorExitFor } from "./spectatorExit";

describe("spectatorExitFor", () => {
    test("returns a lobby watcher to that lobby, or the lobby list when the room is unknown", () => {
        expect(spectatorExitFor({ from: "lobby", lobbyId: "abc" })).toEqual({
            kind: "route",
            path: "/lobby/abc",
            openFriends: false,
        });
        expect(spectatorExitFor({ from: "lobby" })).toEqual({ kind: "route", path: "/lobbies", openFriends: false });
    });

    test("sends a friend's spectator back to the arena with the friends panel open", () => {
        expect(spectatorExitFor({ from: "friends" })).toEqual({ kind: "route", path: "/play", openFriends: true });
    });

    test("sends everyone else to the website's main page on this deployment", () => {
        expect(spectatorExitFor(null)).toEqual({ kind: "site", path: "/" });
        expect(spectatorExitFor(undefined)).toEqual({ kind: "site", path: "/" });
        expect(spectatorExitFor({ from: "somewhere-else" })).toEqual({ kind: "site", path: "/" });
    });
});
