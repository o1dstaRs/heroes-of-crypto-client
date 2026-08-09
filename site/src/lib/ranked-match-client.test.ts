import { describe, expect, test } from "bun:test";

import { buildPublicRankedMatchUrl, buildRankedMatchPagePath, normalizePublicRankedMatch } from "./ranked-match-client";

const gameId = "33333333-3333-4333-8333-333333333333";
const lowerId = "11111111-1111-4111-8111-111111111111";
const upperId = "22222222-2222-4222-8222-222222222222";

const response = {
    gameId,
    finishedTime: 123456,
    durationMs: 60_456,
    lowerCreatureIds: [1, 2, -1],
    upperCreatureIds: [3, 4],
    outcome: "win",
    reason: "normal",
    winnerPlayerId: lowerId,
    seasonSequence: 3,
    players: [
        {
            playerId: lowerId,
            username: "Lower",
            side: "lower",
            result: "win",
            mmrBefore: 800,
            mmrAfter: 818,
            delta: 18,
            goldEarned: 18,
            calibration: false,
        },
        {
            playerId: upperId,
            username: "Upper",
            side: "upper",
            result: "loss",
            mmrBefore: 820,
            mmrAfter: 802,
            delta: -18,
            goldEarned: 0,
            calibration: false,
        },
    ],
    stats: {
        totalLaps: 7,
        gridType: 4,
        lowerDamage: 940,
        upperDamage: 710,
        lowerCreatureIds: [4, 5, 0, -1],
        upperCreatureIds: [8, 9],
        lowerPerformers: [
            { creatureId: 5, damageDealt: 100 },
            { creatureId: 4, damageDealt: 500 },
        ],
        upperPerformers: [{ creatureId: 8, damageDealt: 320 }],
        lowerSetup: { artifactTier1: 1, artifactTier2: 2, perk: 3, synergies: ["Life:1:2"] },
        upperSetup: { artifactTier1: 3, artifactTier2: 4, perk: 1, synergies: ["Chaos:2:1"] },
        setupRecorded: true,
        replayAvailable: true,
    },
};

describe("public ranked match normalization", () => {
    test("keeps both seats and sorts unit damage descending", () => {
        const match = normalizePublicRankedMatch(response);
        expect(match).not.toBeNull();
        expect(match?.players.map((player) => player.side)).toEqual(["lower", "upper"]);
        expect(match?.durationMs).toBe(60_456);
        expect(match?.lowerCreatureIds).toEqual([1, 2]);
        expect(match?.upperCreatureIds).toEqual([3, 4]);
        expect(match?.stats?.lowerCreatureIds).toEqual([4, 5]);
        expect(match?.stats?.upperCreatureIds).toEqual([8, 9]);
        expect(match?.stats?.lowerPerformers).toEqual([
            { creatureId: 4, damageDealt: 500 },
            { creatureId: 5, damageDealt: 100 },
        ]);
        expect(match?.stats?.lowerSetup.augmentArmor).toBe(0);
    });

    test("keeps a ranked result usable when an older match has no report", () => {
        const legacy = normalizePublicRankedMatch({ ...response, durationMs: undefined, stats: null });
        expect(legacy?.durationMs).toBe(0);
        expect(legacy?.lowerCreatureIds).toEqual([1, 2]);
        expect(legacy?.stats).toBeNull();
    });

    test("rejects malformed game identities and incomplete seat pairs", () => {
        expect(normalizePublicRankedMatch({ ...response, gameId: "bad" })).toBeNull();
        expect(normalizePublicRankedMatch({ ...response, players: [response.players[0]] })).toBeNull();
    });
});

describe("public ranked match URLs", () => {
    test("builds production, development, and localized page routes", () => {
        expect(buildPublicRankedMatchUrl(gameId, { baseUrl: "https://mm.test", production: true })).toBe(
            `https://mm.test/v1/ranked-match/${gameId}`,
        );
        expect(buildPublicRankedMatchUrl(gameId, { baseUrl: "http://localhost:3001", production: false })).toBe(
            `http://localhost:3001/v1/mm/ranked-match/${gameId}`,
        );
        expect(buildRankedMatchPagePath(gameId, lowerId, "en")).toBe(`/match/?gameId=${gameId}&playerId=${lowerId}`);
        expect(buildRankedMatchPagePath(gameId, lowerId, "ru")).toBe(`/ru/match/?gameId=${gameId}&playerId=${lowerId}`);
    });
});
