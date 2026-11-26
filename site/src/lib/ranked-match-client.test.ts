import { describe, expect, test } from "bun:test";

import { buildPublicRankedMatchUrl, buildRankedMatchPagePath, normalizePublicRankedMatch } from "./ranked-match-client";

const gameId = "33333333-3333-4333-8333-333333333333";
const leftId = "11111111-1111-4111-8111-111111111111";
const rightId = "22222222-2222-4222-8222-222222222222";

const response = {
    gameId,
    finishedTime: 123456,
    durationMs: 60_456,
    leftCreatureIds: [1, 2, -1],
    rightCreatureIds: [3, 4],
    outcome: "win",
    reason: "normal",
    winnerPlayerId: leftId,
    seasonSequence: 3,
    season: {
        sequence: 3,
        name: "Ashfall",
        startsAt: 100,
        endsAt: 200,
        currency: {
            name: "Ember Shards",
            symbol: "ES",
            iconSvg: '<svg viewBox="0 0 8 8"><circle r="4"/></svg>',
        },
    },
    players: [
        {
            playerId: leftId,
            username: "Lower",
            side: "left",
            result: "win",
            mmrBefore: 800,
            mmrAfter: 818,
            delta: 18,
            goldEarned: 18,
            calibration: false,
        },
        {
            playerId: rightId,
            username: "Upper",
            side: "right",
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
        leftDamage: 940,
        rightDamage: 710,
        leftCreatureIds: [4, 5, 0, -1],
        rightCreatureIds: [8, 9],
        leftPerformers: [
            { creatureId: 5, damageDealt: 100 },
            { creatureId: 4, damageDealt: 500 },
            { creatureId: 6, damageDealt: 450 },
            { creatureId: 7, damageDealt: 300 },
            { creatureId: 8, damageDealt: 200 },
            { creatureId: 9, damageDealt: 50 },
        ],
        rightPerformers: [{ creatureId: 8, damageDealt: 320 }],
        leftSetup: { artifactTier1: 1, artifactTier2: 2, doctrine: 3, synergies: ["Life:1:2"] },
        rightSetup: { artifactTier1: 3, artifactTier2: 4, doctrine: 1, synergies: ["Chaos:2:1"] },
        setupRecorded: true,
        replayAvailable: true,
    },
};

describe("public ranked match normalization", () => {
    test("keeps both seats and sorts unit damage descending", () => {
        const match = normalizePublicRankedMatch(response);
        expect(match).not.toBeNull();
        expect(match?.players.map((player) => player.side)).toEqual(["left", "right"]);
        expect(match?.durationMs).toBe(60_456);
        expect(match?.leftCreatureIds).toEqual([1, 2]);
        expect(match?.rightCreatureIds).toEqual([3, 4]);
        expect(match?.stats?.leftCreatureIds).toEqual([4, 5]);
        expect(match?.stats?.rightCreatureIds).toEqual([8, 9]);
        expect(match?.stats?.leftPerformers).toEqual([
            { creatureId: 4, damageDealt: 500 },
            { creatureId: 6, damageDealt: 450 },
            { creatureId: 7, damageDealt: 300 },
            { creatureId: 8, damageDealt: 200 },
            { creatureId: 5, damageDealt: 100 },
            { creatureId: 9, damageDealt: 50 },
        ]);
        expect(match?.stats?.leftSetup.augmentArmor).toBe(0);
        expect(match?.season).toEqual({
            sequence: 3,
            name: "Ashfall",
            startsAt: 100,
            endsAt: 200,
            currency: {
                name: "Ember Shards",
                symbol: "ES",
                iconSvg: '<svg viewBox="0 0 8 8"><circle r="4"/></svg>',
            },
        });
    });

    test("keeps a ranked result usable when an older match has no report", () => {
        const legacy = normalizePublicRankedMatch({
            ...response,
            durationMs: undefined,
            season: undefined,
            stats: null,
        });
        expect(legacy?.durationMs).toBe(0);
        expect(legacy?.leftCreatureIds).toEqual([1, 2]);
        expect(legacy?.stats).toBeNull();
        expect(legacy?.season).toBeNull();
    });

    test("uses a nested public season sequence when the legacy flat field is absent", () => {
        const match = normalizePublicRankedMatch({ ...response, seasonSequence: undefined });
        expect(match?.seasonSequence).toBe(3);
    });

    test("rejects malformed game identities and incomplete seat pairs", () => {
        expect(normalizePublicRankedMatch({ ...response, gameId: "bad" })).toBeNull();
        expect(normalizePublicRankedMatch({ ...response, players: [response.players[0]] })).toBeNull();
    });

    /**
     * The stats keys are a WIRE contract, not prose. Renaming them to left/right (as the LEFT/RIGHT seat pass
     * briefly did) reads nothing off a real response, so every figure silently became 0/[] and the profile's
     * detail panel threw on the missing setup object — surfacing as "Match details are unavailable right now".
     * These assertions read the values, not just the shape, so a zeroed parse cannot pass again.
     */
    test("reads the damage, performers and setup the API actually sends", () => {
        const match = normalizePublicRankedMatch(response);
        expect(match?.stats?.leftDamage).toBe(940);
        expect(match?.stats?.rightDamage).toBe(710);
        expect(match?.stats?.leftPerformers.length).toBeGreaterThan(0);
        expect(match?.stats?.rightPerformers).toEqual([{ creatureId: 8, damageDealt: 320 }]);
        expect(match?.stats?.leftSetup.artifactTier1).toBe(1);
        expect(match?.stats?.rightSetup.artifactTier2).toBe(4);
        expect(match?.stats?.leftSetup.synergies).toEqual(["Life:1:2"]);
    });
});

describe("exit rules on the public match", () => {
    test("keeps the exit-rule reasons, the resolved exit and an unscored outcome", () => {
        const match = normalizePublicRankedMatch({
            ...response,
            outcome: "none",
            reason: "unscored",
            winnerPlayerId: "",
            exit: {
                kind: "abandon",
                cause: "button",
                leaverPlayerId: rightId,
                scored: false,
                unscoredReason: "leaver_calibrating",
                boardBp: 2100,
                phase: "fight",
                lap: 2,
                enforced: true,
            },
            players: response.players.map((player) => ({ ...player, result: "none", delta: 0 })),
        });
        expect(match?.outcome).toBe("none");
        expect(match?.reason).toBe("unscored");
        expect(match?.players.map((player) => player.result)).toEqual(["none", "none"]);
        expect(match?.exit).toMatchObject({
            kind: "abandon",
            scored: false,
            unscoredReason: "leaver_calibrating",
            boardBp: 2100,
        });
    });

    test("an older match without an exit, or with a malformed one, parses with exit null", () => {
        expect(normalizePublicRankedMatch(response)?.exit).toBeNull();
        expect(normalizePublicRankedMatch({ ...response, exit: { kind: "rage_quit" } })?.exit).toBeNull();
        expect(normalizePublicRankedMatch({ ...response, reason: "abandon" })?.reason).toBe("abandon");
        expect(normalizePublicRankedMatch({ ...response, reason: "void" })?.reason).toBe("void");
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
        expect(buildRankedMatchPagePath(gameId, leftId, "en")).toBe(`/match/?gameId=${gameId}&playerId=${leftId}`);
        expect(buildRankedMatchPagePath(gameId, leftId, "ru")).toBe(`/ru/match/?gameId=${gameId}&playerId=${leftId}`);
    });
});
