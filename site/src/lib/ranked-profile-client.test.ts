import { describe, expect, test } from "bun:test";

import {
    buildPublicRankedProfileUrl,
    isPublicRankedPlayerId,
    normalizePublicRankedProfile,
    publicRankedProfileFallbackFromSearchParams,
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
            leagueName: "League 4",
            mmr: 1630,
        });
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
        });

        const fallback = publicRankedProfileFallbackFromSearchParams(params);
        expect(fallback?.username).toBe("Artemis");
        expect(fallback?.mmr).toBe(1840);
        expect(fallback?.state).toBe("placed");
        expect(fallback?.recentGames).toEqual([]);
        expect(publicRankedProfileFallbackFromSearchParams(new URLSearchParams({ playerId: PLAYER_ID }))).toBeNull();
    });
});
