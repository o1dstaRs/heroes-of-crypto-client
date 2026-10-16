import { TIER1_ARTIFACT_LIST, TIER2_ARTIFACT_LIST } from "@heroesofcrypto/common/src/artifacts/artifact_properties";
import { buildMockPlayerMetrics } from "../../../game/core/src/ui/PlayerPlaystyle/mockPlayerMetrics";
import { normalizePublicRankedProfile, type PublicRankedProfile } from "./ranked-profile-client";

export function buildMockPlayerProfile(): PublicRankedProfile {
    const now = Date.now();
    const record = { games: 20, wins: 13, losses: 7, draws: 0, winRatePct: 65, pickRatePct: 100 };
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
        reputationBadge: "honorable",
        online: true,
        lastRankedGameAt: now - 45 * 60_000,
        peakMmr: 1960,
        secondsInGame: 204 * 25 * 60,
        rankedBan: { creatureId: 1, name: "Peasant" },
        recentGames: ["win", "win", "loss", "draw", "win", "loss", "win", "win"].map((result, index) => ({
            gameId: `preview-match-${index + 1}`,
            finishedTime: now - (index + 1) * 45 * 60_000,
            result,
            reason: "elimination",
            mmrDelta: result === "win" ? 24 : result === "loss" ? -21 : 0,
            goldEarned: result === "win" ? 35 : 10,
            opponent: {
                playerId: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
                username: ["IronWarden", "FrostQueen", "ShadowBlade", "EmberWolf"][index % 4],
            },
        })),
        playstyle: {
            ...record,
            topCreatures: ["Orc", "Scavenger", "Troglodyte"].map((name, index) => ({
                ...record,
                creatureId: index + 1,
                name,
                faction: "Life",
                pickRatePct: 85 - index * 15,
            })),
            topPairs: [{ ...record, creatureIds: [1, 2], names: ["Orc", "Scavenger"] }],
            topTriples: [{ ...record, creatureIds: [1, 2, 3], names: ["Orc", "Scavenger", "Troglodyte"] }],
            artifactsTier1: [
                { ...record, artifactId: TIER1_ARTIFACT_LIST[0].id, tier: 1, name: TIER1_ARTIFACT_LIST[0].name },
            ],
            artifactsTier2: [
                { ...record, artifactId: TIER2_ARTIFACT_LIST[0].id, tier: 2, name: TIER2_ARTIFACT_LIST[0].name },
            ],
            augments: [{ ...record, kind: 1, level: 2, name: "Placement" }],
            doctrines: [{ ...record, doctrineId: 1, name: "Battle Trance" }],
        },
        seasonHistory: [
            {
                seasonSequence: 1,
                seasonName: "Season 1",
                state: "placed",
                mmr: 1750,
                peakMmr: 1820,
                gold: 2400,
                league: 4,
                leagueName: "Marshal",
                leaderboardRank: 18,
                goldPlace: 12,
                wins: 61,
                losses: 35,
                draws: 4,
                totalGames: 100,
                winRatePct: 61,
                archivedAt: now - 30 * 86_400_000,
            },
        ],
    })!;
}
