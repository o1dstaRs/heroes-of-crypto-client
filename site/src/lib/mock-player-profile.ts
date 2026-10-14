import { buildMockPlayerMetrics } from "../../../game/core/src/ui/PlayerPlaystyle/mockPlayerMetrics";
import { normalizePublicRankedProfile, type PublicRankedProfile } from "./ranked-profile-client";

export function buildMockPlayerProfile(): PublicRankedProfile {
    return normalizePublicRankedProfile({
        playerId: "11111111-1111-4111-8111-111111111111",
        username: "Artemis",
        state: "placed",
        mmr: 1840,
        league: 4,
        leagueName: "Marshal",
        wealth: 2,
        standingTitle: "Stacked Marshal",
        leaderboardRank: 12,
        wins: 128,
        losses: 72,
        draws: 4,
        totalGames: 204,
        winRatePct: 64,
        winStreak: 3,
        gold: 3840,
        playerMetrics: buildMockPlayerMetrics(),
        recentGames: [],
    })!;
}
