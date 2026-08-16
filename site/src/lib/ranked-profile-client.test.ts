import { describe, expect, test } from "bun:test";

import {
    buildPublicRankedProfileUrl,
    isPublicRankedPlayerId,
    normalizePublicRankedProfile,
    publicRankedProfileFallbackFromSearchParams,
    rankedExitRatePct,
} from "./ranked-profile-client";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const OPPONENT_ID = "22222222-2222-4222-8222-222222222222";

describe("public ranked profile normalization", () => {
    test("normalizes a placed profile and sorts valid recent matches newest first", () => {
        const profile = normalizePublicRankedProfile({
            playerId: PLAYER_ID,
            username: "Artemis",
            state: "placed",
            mmr: 1840,
            peakMmr: 1902,
            league: 5,
            division: 3,
            leaderboardRank: 2,
            wins: 20,
            losses: 7,
            draws: 1,
            totalGames: 28,
            winRatePct: 71.4,
            winStreak: 4,
            calibration: { required: 5, gamesPlayed: 5, wins: 4, draws: 0, losses: 1 },
            recentGames: [
                { gameId: "older", finishedTime: 100, result: "loss", reason: "concede", mmrDelta: -13 },
                {
                    gameId: "newer",
                    finishedTime: 200,
                    result: "win",
                    reason: "normal",
                    mmrDelta: 14,
                    season: {
                        sequence: 4,
                        name: "Ashfall",
                        currency: { name: "Embers", symbol: "EM", iconSvg: "<svg></svg>" },
                    },
                    opponent: { playerId: OPPONENT_ID, username: "Nyx" },
                },
                { result: "win" },
            ],
        });

        expect(profile?.username).toBe("Artemis");
        expect(profile?.state).toBe("placed");
        expect(profile?.winRatePct).toBe(71.4);
        expect(profile?.recentGames.map((match) => match.gameId)).toEqual(["newer", "older"]);
        expect(profile?.recentGames[0].opponent).toEqual({ playerId: OPPONENT_ID, username: "Nyx" });
        expect(profile?.recentGames[0].season?.currency).toEqual({
            name: "Embers",
            symbol: "EM",
            iconSvg: "<svg></svg>",
        });
        expect(profile?.recentGames[1].season).toBeNull();
    });

    test("keeps recalibration progress and the previous visible standing", () => {
        const profile = normalizePublicRankedProfile({
            playerId: PLAYER_ID,
            state: "recalibration",
            calibration: { required: 5, gamesPlayed: 2, wins: 1, draws: 1, losses: 0 },
            previous: { league: 4, mmr: 1630 },
        });

        expect(profile?.mmr).toBe(0);
        expect(profile?.calibration).toEqual({ required: 5, gamesPlayed: 2, wins: 1, draws: 1, losses: 0 });
        expect(profile?.previous).toEqual({
            league: 4,
            leagueName: "Overlord",
            mmr: 1630,
        });
    });

    test("keeps current and historical season currency metadata with legacy fallbacks", () => {
        const profile = normalizePublicRankedProfile({
            playerId: PLAYER_ID,
            season: {
                sequence: 4,
                name: "Ashfall",
                currency: {
                    name: "Ember Shards",
                    symbol: "ES",
                    iconSvg: '<svg viewBox="0 0 8 8"><circle r="4"/></svg>',
                },
            },
            seasonHistory: [
                {
                    seasonSequence: 3,
                    seasonName: "First Flame",
                    currency: { name: "Crowns", symbol: "CR", iconSvg: "<svg></svg>" },
                },
                { seasonSequence: 2, seasonName: "Legacy" },
            ],
        });

        expect(profile?.season?.currency).toEqual({
            name: "Ember Shards",
            symbol: "ES",
            iconSvg: '<svg viewBox="0 0 8 8"><circle r="4"/></svg>',
        });
        expect(profile?.seasonHistory[0].currency).toEqual({
            name: "Crowns",
            symbol: "CR",
            iconSvg: "<svg></svg>",
        });
        expect(profile?.seasonHistory[1].currency).toEqual({ name: "Gold", symbol: "G", iconSvg: "" });
    });

    test("normalizes and orders public prediction history by placement date", () => {
        const profile = normalizePublicRankedProfile({
            playerId: PLAYER_ID,
            predictions: {
                bets: 3,
                staked: 120,
                returned: 180,
                settled: 2,
                won: 1,
                net: 60,
                winRatePct: 50,
                recent: [
                    {
                        gameId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                        predictedPlayerId: OPPONENT_ID,
                        backedUsername: "Nyx",
                        amount: 40,
                        placedAt: 100,
                        status: "won",
                        payout: 80,
                        settledAt: 200,
                    },
                    {
                        gameId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                        predictedPlayerId: OPPONENT_ID,
                        backedUsername: "Nyx",
                        amount: 80,
                        placedAt: 300,
                        status: "not-a-status",
                        payout: 0,
                        settledAt: 0,
                    },
                    { gameId: "" },
                ],
            },
        });

        expect(profile?.predictions).toMatchObject({
            bets: 3,
            staked: 120,
            returned: 180,
            settled: 2,
            won: 1,
            net: 60,
            winRatePct: 50,
        });
        expect(profile?.predictions.recent.map((bet) => bet.gameId)).toEqual([
            "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        ]);
        expect(profile?.predictions.recent[0]).toMatchObject({ status: "open", backedUsername: "Nyx" });
    });

    test("rejects malformed identities and clamps unsafe public values", () => {
        expect(normalizePublicRankedProfile(null)).toBeNull();
        expect(normalizePublicRankedProfile({ playerId: "short" })).toBeNull();

        const profile = normalizePublicRankedProfile({
            playerId: PLAYER_ID,
            wins: -5,
            winRatePct: 120,
            calibration: { required: 0 },
        });
        expect(profile?.wins).toBe(0);
        expect(profile?.winRatePct).toBe(100);
        expect(profile?.calibration.required).toBe(5);
    });

    test("reports the player's own harmful exits as a bounded rate", () => {
        expect(rankedExitRatePct(2, 20)).toBe(10);
        expect(rankedExitRatePct(0, 0)).toBe(0);
        expect(rankedExitRatePct(-1, 10)).toBe(0);
        expect(rankedExitRatePct(12, 10)).toBe(100);
    });
});

describe("gold history normalization", () => {
    const withHistory = (goldHistory: unknown) =>
        normalizePublicRankedProfile({ playerId: PLAYER_ID, username: "Artemis", goldHistory }).goldHistory;

    test("keeps debits NEGATIVE — a stake leaving the purse must not be clamped to zero", () => {
        const [entry] = withHistory([
            { at: 1000, dayKey: "2026-08-15", kind: "bet_placed", delta: -40, seasonSequence: 1 },
        ]);
        expect(entry.delta).toBe(-40);
        expect(entry.kind).toBe("bet_placed");
    });

    test("orders newest first regardless of the order the server sent", () => {
        const entries = withHistory([
            { at: 1000, dayKey: "2026-08-15", kind: "match", delta: 10, seasonSequence: 1 },
            { at: 3000, dayKey: "2026-08-17", kind: "daily_league", delta: 50, seasonSequence: 1 },
            { at: 2000, dayKey: "2026-08-16", kind: "match", delta: 20, seasonSequence: 1 },
        ]);
        expect(entries.map((entry) => entry.at)).toEqual([3000, 2000, 1000]);
    });

    test("drops zero-delta rows, which say nothing about a purse", () => {
        expect(withHistory([{ at: 1000, dayKey: "2026-08-15", kind: "match", delta: 0, seasonSequence: 1 }])).toEqual(
            [],
        );
    });

    test("falls back to a known kind rather than rendering an unknown string", () => {
        const [entry] = withHistory([
            { at: 1000, dayKey: "2026-08-15", kind: "not_a_real_kind", delta: 5, seasonSequence: 1 },
        ]);
        expect(entry.kind).toBe("match");
    });

    test("carries the daily grant's league through so the row can name it", () => {
        const [entry] = withHistory([
            {
                at: 1000,
                dayKey: "2026-08-15",
                kind: "daily_league",
                delta: 50,
                seasonSequence: 1,
                balanceAfter: 1250,
                detail: { league: 5, leagueName: "Demigod", dayKey: "2026-08-15" },
            },
        ]);
        expect(entry.delta).toBe(50);
        expect(entry.balanceAfter).toBe(1250);
        expect(entry.detail.leagueName).toBe("Demigod");
    });

    test("a missing or malformed history is an empty list, never a crash", () => {
        expect(withHistory(undefined)).toEqual([]);
        expect(withHistory("nonsense")).toEqual([]);
    });
});

describe("public ranked profile URLs", () => {
    test("supports both human UUIDs and persistent ranked AI seat ids", () => {
        expect(isPublicRankedPlayerId(PLAYER_ID)).toBe(true);
        expect(isPublicRankedPlayerId("ai:v0.8:brutal:000000000000000000000")).toBe(true);
        expect(isPublicRankedPlayerId("../../not-a-player")).toBe(false);
    });

    test("builds the production and local route contracts", () => {
        expect(buildPublicRankedProfileUrl(PLAYER_ID, { baseUrl: "https://mm.example/", production: true })).toBe(
            `https://mm.example/v1/ranked-profile/${PLAYER_ID}`,
        );
        expect(buildPublicRankedProfileUrl(PLAYER_ID, { baseUrl: "http://localhost:3001", production: false })).toBe(
            `http://localhost:3001/v1/mm/ranked-profile/${PLAYER_ID}`,
        );
        expect(() => buildPublicRankedProfileUrl("bad", { baseUrl: "https://mm.example" })).toThrow(
            "invalid_player_id",
        );
    });

    test("sanitizes a leaderboard summary for graceful unavailable-profile fallback", () => {
        const params = new URLSearchParams({
            playerId: PLAYER_ID,
            username: " Artemis ",
            state: "placed",
            mmr: "1840",
            league: "5",
            division: "3",
            rank: "2",
            wins: "20",
            losses: "7",
            draws: "1",
            games: "28",
            winRate: "71.4",
            peakMmr: "1902",
            winStreak: "4",
            lastBattle: "1750000000000",
            bannedCreatureId: "42",
            bannedCreatureName: "Dark Witch",
        });

        const fallback = publicRankedProfileFallbackFromSearchParams(params);
        expect(fallback?.username).toBe("Artemis");
        expect(fallback?.mmr).toBe(1840);
        expect(fallback?.state).toBe("placed");
        expect(fallback?.rankedBan).toEqual({ creatureId: 42, name: "Dark Witch" });
        expect(fallback?.recentGames).toEqual([]);
        expect(publicRankedProfileFallbackFromSearchParams(new URLSearchParams({ playerId: PLAYER_ID }))).toBeNull();
    });
});
