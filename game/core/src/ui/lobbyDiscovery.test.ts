import { LobbyStatus, type LobbyObject } from "@heroesofcrypto/common";
import { describe, expect, it } from "bun:test";

import { lobbyAgeLabel, prioritizeLobbies } from "./lobbyDiscovery";

const lobby = (id: string, hostId: string, createdTime: number): LobbyObject => ({
    id,
    name: id,
    is_private: false,
    status: LobbyStatus.LOBBY_OPEN,
    host: { player_id: hostId, username: hostId, avatar: "", rating: 0, league: "Unranked", ready: false },
    guest: undefined,
    created_time: createdTime,
    start_at_ms: 0,
    game_id: "",
});

describe("lobby discovery priority", () => {
    it("puts every friend-hosted room before newer public rooms", () => {
        const ordered = prioritizeLobbies(
            [
                lobby("new-public", "stranger", 300),
                lobby("friend", "friend-id", 100),
                lobby("old-public", "other", 200),
            ],
            new Set(["friend-id"]),
        );
        expect(ordered.map(({ lobby: room }) => room.id)).toEqual(["friend", "new-public", "old-public"]);
        expect(ordered[0]?.isFriendLobby).toBe(true);
    });

    it("keeps newest-first order inside the friend group", () => {
        const ordered = prioritizeLobbies(
            [lobby("older", "friend-a", 100), lobby("newer", "friend-b", 200)],
            new Set(["friend-a", "friend-b"]),
        );
        expect(ordered.map(({ lobby: room }) => room.id)).toEqual(["newer", "older"]);
    });
});

describe("lobby age label", () => {
    it("shows compact minutes and hours", () => {
        const now = 10_000_000;
        expect(lobbyAgeLabel(now - 8 * 60_000, now)).toBe("8m");
        expect(lobbyAgeLabel(now - 2 * 60 * 60_000, now)).toBe("2h");
    });
});
