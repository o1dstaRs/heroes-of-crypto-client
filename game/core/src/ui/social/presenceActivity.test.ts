import { describe, expect, test } from "bun:test";

import { activityForPath } from "./presenceActivity";

describe("activityForPath", () => {
    test("maps every screen to an activity, keeping the lobby id", () => {
        expect(activityForPath("/")).toEqual({ kind: "sandbox" });
        expect(activityForPath("/sandbox/abc")).toEqual({ kind: "coop" });
        expect(activityForPath("/play")).toEqual({ kind: "arena" });
        expect(activityForPath("/lobbies")).toEqual({ kind: "lobbies" });
        expect(activityForPath("/lobby/11111111-0000-4000-8000-000000000001")).toEqual({
            kind: "lobby",
            lobbyId: "11111111-0000-4000-8000-000000000001",
        });
        expect(activityForPath("/game/xyz")).toEqual({ kind: "game" });
        expect(activityForPath("/game/xyz/replay")).toEqual({ kind: "game" });
        expect(activityForPath("/portal")).toEqual({ kind: "portal" });
        expect(activityForPath("/something-else")).toEqual({ kind: "idle" });
    });
});
