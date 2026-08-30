import { LobbyStatus, type LobbyObject } from "@heroesofcrypto/common";

import type { PublicPlayerStats } from "../api/social_client";

export const MOCK_FRIEND_PLAYER_IDS = new Set(["10000000-0000-4000-8000-000000000001"]);

export const buildMockLobbies = (now: number = Date.now()): LobbyObject[] => [
    {
        id: "20000000-0000-4000-8000-000000000001",
        name: "First Flame Duel",
        is_private: false,
        status: LobbyStatus.LOBBY_OPEN,
        host: {
            player_id: "10000000-0000-4000-8000-000000000001",
            username: "EmberWarden",
            avatar: "",
            rating: 1842,
            league: "Overlord",
            ready: false,
        },
        guest: undefined,
        created_time: now - 4 * 60_000,
        start_at_ms: 0,
        game_id: "",
    },
    {
        id: "20000000-0000-4000-8000-000000000002",
        name: "No Dragons, Good Vibes",
        is_private: false,
        status: LobbyStatus.LOBBY_OPEN,
        host: {
            player_id: "10000000-0000-4000-8000-000000000002",
            username: "MoonPriest",
            avatar: "",
            rating: 1616,
            league: "Harbinger",
            ready: false,
        },
        guest: undefined,
        created_time: now - 11 * 60_000,
        start_at_ms: 0,
        game_id: "",
    },
    {
        id: "20000000-0000-4000-8000-000000000003",
        name: "Quick Match Before Dinner",
        is_private: false,
        status: LobbyStatus.LOBBY_OPEN,
        host: {
            player_id: "10000000-0000-4000-8000-000000000003",
            username: "IronNomad",
            avatar: "",
            rating: 1498,
            league: "Vanguard",
            ready: false,
        },
        guest: undefined,
        created_time: now - 27 * 60_000,
        start_at_ms: 0,
        game_id: "",
    },
];

export const MOCK_LOBBY_HOST_STATS: Readonly<Record<string, PublicPlayerStats>> = Object.freeze({
    "10000000-0000-4000-8000-000000000001": {
        playerId: "10000000-0000-4000-8000-000000000001",
        username: "EmberWarden",
        state: "placed",
        mmr: 1842,
        league: 4,
        leagueName: "Overlord",
        wealth: 3,
        wealthName: "Whale",
        leaderboardRank: 17,
        gold: 1330,
    },
    "10000000-0000-4000-8000-000000000002": {
        playerId: "10000000-0000-4000-8000-000000000002",
        username: "MoonPriest",
        state: "placed",
        mmr: 1616,
        league: 3,
        leagueName: "Harbinger",
        wealth: 2,
        wealthName: "Stacked",
        leaderboardRank: 64,
        gold: 860,
    },
    "10000000-0000-4000-8000-000000000003": {
        playerId: "10000000-0000-4000-8000-000000000003",
        username: "IronNomad",
        state: "placed",
        mmr: 1498,
        league: 2,
        leagueName: "Vanguard",
        wealth: 1,
        wealthName: "Ragged",
        leaderboardRank: 118,
        gold: 410,
    },
});
