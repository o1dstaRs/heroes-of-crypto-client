import { describe, expect, it } from "bun:test";

import type { RankedStanding } from "../api/social_client";
import { leagueTransitionBetween } from "./LeagueTransitionReveal";

const standing = (state: RankedStanding["state"], league: number): RankedStanding => ({
    calibration: { draws: 0, gamesPlayed: 4, losses: 1, remaining: 1, required: 5, wins: 3 },
    draws: 0,
    gold: 100,
    leaderboardRank: league ? 9 : 0,
    league,
    leagueName: ["", "Aspirant", "Vanguard", "Marshal", "Overlord", "Demigod"][league] ?? "",
    lossStreak: 0,
    losses: 1,
    mmr: league * 1_000,
    peakMmr: league * 1_000,
    previous: null,
    standingTitle: "",
    state,
    totalGames: 4,
    wealth: league ? 1 : 0,
    wealthName: league ? "Ragged" : "",
    wins: 3,
    winStreak: 1,
});

describe("leagueTransitionBetween", () => {
    it("reveals the first league after calibration", () => {
        expect(leagueTransitionBetween(standing("calibration", 0), standing("placed", 2))?.kind).toBe("calibration");
    });

    it("distinguishes promotions and demotions", () => {
        expect(leagueTransitionBetween(standing("placed", 2), standing("placed", 3))?.kind).toBe("promotion");
        expect(leagueTransitionBetween(standing("placed", 4), standing("placed", 3))?.kind).toBe("demotion");
    });

    it("does not reveal when the league is unchanged", () => {
        expect(leagueTransitionBetween(standing("placed", 3), standing("placed", 3))).toBeNull();
    });
});
