import { describe, expect, test } from "bun:test";

import {
    filterLeagues,
    filterLiveGames,
    filterRankedPlayers,
    livePlayerRankedState,
    normalizeLiveGamesResponse,
    normalizeStandingsResponse,
    normalizeTopResponse,
    playerInitials,
    playersInLeague,
    relativeArenaTime,
    type RankedPlayer,
} from "./ranked-arena-data";
import { rankedArenaCopy } from "./ranked-arena-copy";

const player = (overrides: Partial<RankedPlayer> = {}): RankedPlayer => ({
    position: 1,
    playerId: "11111111-1111-4111-8111-111111111111",
    username: "Artemis",
    mmr: 1800,
    gold: 420,
    league: 5,
    leagueName: "5th League",
    leaderboardRank: 1,
    wins: 12,
    losses: 4,
    draws: 1,
    totalGames: 17,
    dcWins: 0,
    dcLosses: 0,
    winRatePct: 70.6,
    winStreak: 3,
    lossStreak: 0,
    peakMmr: 1842,
    lastRankedGameAt: 1_750_000_000_000,
    ...overrides,
});

describe("ranked arena response normalization", () => {
    test("keeps valid ladder data and rejects malformed players", () => {
        const response = normalizeTopResponse({
            computedAt: 123,
            players: [
                { ...player(), position: 2 },
                { username: "Missing id" },
                null,
                { ...player({ playerId: "22222222-2222-4222-8222-222222222222", username: "Nyx" }), mmr: NaN },
            ],
        });

        expect(response.computedAt).toBe(123);
        expect(response.players).toHaveLength(2);
        expect(response.players[0].position).toBe(2);
        expect(response.players[1].mmr).toBe(0);
    });

    test("normalizes league rosters and sorts the strongest league first", () => {
        const response = normalizeStandingsResponse({
            activeCount: 24,
            calibratingCount: 3,
            collapsed: false,
            leagues: [
                { league: 1, players: [] },
                {
                    league: 5,
                    name: "5th League",
                    playerCount: 1,
                    minMmr: 1800,
                    maxMmr: 1800,
                    players: [player()],
                },
                { league: 0, players: [] },
            ],
        });

        expect(response.activeCount).toBe(24);
        expect(response.leagues.map((league) => league.league)).toEqual([5, 1]);
        expect(response.leagues[0].players[0].username).toBe("Artemis");
    });

    test("accepts only known live stages and caps every game at two seats", () => {
        const response = normalizeLiveGamesResponse({
            count: 99,
            games: [
                {
                    gameId: "game-new",
                    stage: "fight",
                    observable: true,
                    initTime: 200,
                    players: [
                        { playerId: "p1", username: "One", ranked: { mmr: 1400, league: 3 } },
                        { playerId: "p2", username: "Two", isBot: true, aiVersion: "v0.8" },
                        { playerId: "p3", username: "Ignored" },
                    ],
                },
                { gameId: "game-old", stage: "pick", initTime: 100, players: [] },
                { gameId: "bad-stage", stage: "settled" },
                { stage: "fight" },
            ],
        });

        expect(response.count).toBe(2);
        expect(response.games.map((game) => game.gameId)).toEqual(["game-new", "game-old"]);
        expect(response.games[0].players).toHaveLength(2);
        expect(response.games[0].players[0].ranked?.state).toBe("placed");
        expect(response.games[0].players[1].aiVersion).toBe("v0.8");
    });

    test("keeps a calibrated ranked bot placed in active games", () => {
        const response = normalizeLiveGamesResponse({
            games: [
                {
                    gameId: "ranked-bot-game",
                    stage: "fight",
                    players: [
                        {
                            playerId: "ai:v0.2:rb03:00000000000000000000000",
                            username: "AI v0.2 #03",
                            isBot: true,
                            rankedBot: true,
                            ranked: { state: "placed", mmr: 803, league: 1, leaderboardRank: 17 },
                        },
                    ],
                },
            ],
        });

        expect(response.games[0].players[0].ranked).toEqual({
            state: "placed",
            mmr: 803,
            league: 1,
            leaderboardRank: 17,
        });
        expect(livePlayerRankedState(response.games[0].players[0])).toBe("placed");
    });
});

describe("ranked arena discovery", () => {
    const players = [
        player(),
        player({
            position: 2,
            playerId: "22222222-2222-4222-8222-222222222222",
            username: "Green Knight",
            mmr: 1710,
            league: 4,
            leagueName: "4th League",
            wins: 22,
            totalGames: 40,
            gold: 700,
            winRatePct: 55,
            winStreak: 0,
            lossStreak: 2,
        }),
        player({
            position: 3,
            playerId: "33333333-3333-4333-8333-333333333333",
            username: "Árcher Queen",
            mmr: 1660,
            league: 4,
            leagueName: "4th League",
            wins: 18,
            totalGames: 20,
            gold: 50,
            winRatePct: 90,
            winStreak: 7,
        }),
    ];

    test("searches without accents, filters leagues, and supports useful sorts", () => {
        expect(filterRankedPlayers(players, { query: "archer" }).map((entry) => entry.username)).toEqual([
            "Árcher Queen",
        ]);
        expect(filterRankedPlayers(players, { league: 5 })).toHaveLength(1);
        expect(filterRankedPlayers(players, { sort: "wins" })[0].username).toBe("Green Knight");
        expect(filterRankedPlayers(players, { sort: "winRate" })[0].username).toBe("Árcher Queen");
        expect(filterRankedPlayers(players, { sort: "streak" })[0].username).toBe("Árcher Queen");
        expect(filterRankedPlayers(players, { sort: "gold" })[0].username).toBe("Green Knight");
        expect(filterRankedPlayers(players, { sort: "player" })[0].username).toBe("Árcher Queen");
        expect(filterRankedPlayers(players, { sort: "rank", direction: "desc" })[0].username).toBe("Árcher Queen");
    });

    test("searches active games across both seats and filters their stage", () => {
        const games = normalizeLiveGamesResponse({
            games: [
                {
                    gameId: "one",
                    stage: "fight",
                    initTime: 20,
                    players: [
                        { playerId: "p1", username: "Artemis" },
                        { playerId: "bot", username: "Oracle", isBot: true, aiVersion: "v0.8" },
                    ],
                },
                {
                    gameId: "two",
                    stage: "placement",
                    initTime: 10,
                    players: [{ playerId: "p2", username: "Knight" }],
                },
            ],
        }).games;

        expect(filterLiveGames(games, { query: "v0.8" }).map((game) => game.gameId)).toEqual(["one"]);
        expect(filterLiveGames(games, { stage: "placement" }).map((game) => game.gameId)).toEqual(["two"]);
    });

    test("flattens league rosters once and lets league search find a member", () => {
        const league = {
            league: 5,
            name: "5th League",
            isTopLeague: true,
            playerCount: 2,
            minMmr: 1700,
            maxMmr: 1800,
            players: [players[0], players[1]],
        };

        expect(playersInLeague(league)).toHaveLength(2);
        expect(filterLeagues([league], "Green Knight")).toHaveLength(1);
        expect(filterLeagues([league], "nobody")).toHaveLength(0);
    });
});

describe("ranked arena display helpers", () => {
    test("builds compact initials and relative timestamps", () => {
        expect(playerInitials("Green Knight")).toBe("GK");
        expect(playerInitials(" artemis ")).toBe("A");
        expect(playerInitials(" ")).toBe("?");

        const now = 2_000_000;
        expect(relativeArenaTime(0, now)).toBe("");
        expect(relativeArenaTime(now - 20_000, now)).toBe("now");
        expect(relativeArenaTime(now - 2 * 60_000, now)).toBe("2m");
        expect(relativeArenaTime(now - 3 * 60 * 60_000, now)).toBe("3h");
        expect(relativeArenaTime(now - 2 * 24 * 60 * 60_000, now)).toBe("2d");
    });

    test("keeps English and Russian UI copy complete with matching templates", () => {
        expect(Object.keys(rankedArenaCopy.en).sort()).toEqual(Object.keys(rankedArenaCopy.ru).sort());

        for (const key of Object.keys(rankedArenaCopy.en) as Array<keyof typeof rankedArenaCopy.en>) {
            const english = rankedArenaCopy.en[key];
            const russian = rankedArenaCopy.ru[key];
            const placeholders = (value: string): string[] =>
                [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);

            expect(english.trim()).not.toBe("");
            expect(russian.trim()).not.toBe("");
            expect(placeholders(english).sort()).toEqual(placeholders(russian).sort());
        }
    });
});
