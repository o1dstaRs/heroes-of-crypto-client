/**
 * Wire-contract guards for the public ranked match payload.
 *
 * These exist because of a shipped production outage: the LEFT/RIGHT seat pass renamed
 * PublicRankedMatchStats' damage/performer/setup fields to left*&#47;right*, while the API kept sending
 * lower*&#47;upper* and both .astro consumers kept reading lower*&#47;upper*. The parser then read nothing off a
 * real response (every figure became 0/[]) and the profile's detail panel threw on the missing setup
 * object, surfacing to players as "Match details are unavailable right now."
 *
 * Nothing caught it. The site has no typecheck — `build` is `bun test src/lib && astro build`, and
 * astro/esbuild strips types from .astro script blocks without checking them — and the unit fixture was
 * renamed in lockstep with the code, so it fed left* in and asserted left* out without ever touching the
 * shape the server actually sends.
 *
 * The two tests below close both directions:
 *   PRODUCER — the parser must read the keys the API really sends (fixture mirrors a captured payload).
 *   CONSUMER — the keys the .astro components read must exist on what the parser really produces.
 * The consumer test works by scanning source text on purpose: it is the only way to hold an unchecked
 * .astro script block to a contract without adding a typechecker.
 */
import { describe, expect, test } from "bun:test";

import { normalizePublicRankedMatch, type RankedMatchSide } from "./ranked-match-client";

/**
 * Mirrors a real GET /v1/ranked-match/:id response key-for-key (captured from production 2026-08-29).
 * Identities are anonymised — the contract under test is the key names and nesting, not who played.
 */
const WIRE_PAYLOAD = {
    gameId: "22cfd8c1-b22b-4a9d-87c4-6dc3c8908cb2",
    finishedTime: 1787511664431,
    durationMs: 392301,
    lowerCreatureIds: [21, 2, 6, 53, 8, 9],
    upperCreatureIds: [33, 22, 24, 55, 30, 57],
    outcome: "win",
    reason: "concede",
    winnerPlayerId: "d1bb3dd1-037e-4b0c-91aa-dca47d4f30bb",
    seasonSequence: 1,
    players: [
        {
            playerId: "d1bb3dd1-037e-4b0c-91aa-dca47d4f30bb",
            result: "win",
            calibration: false,
            mmrBefore: 974,
            mmrAfter: 986,
            delta: 12,
            goldEarned: 12,
            username: "lower_player",
            side: "lower",
        },
        {
            playerId: "1a1669fb-1b15-4f94-b72d-cc9c983bb1fd",
            result: "loss",
            calibration: false,
            mmrBefore: 1152,
            mmrAfter: 1140,
            delta: -12,
            goldEarned: 0,
            username: "upper_player",
            side: "upper",
        },
    ],
    stats: {
        totalLaps: 1,
        gridType: 3,
        lowerDamage: 952,
        upperDamage: 1070,
        lowerCreatureIds: [21, 2, 6, 53, 8, 9],
        upperCreatureIds: [33, 22, 24, 55, 30, 57],
        lowerPerformers: [
            { creatureId: 21, damageDealt: 350 },
            { creatureId: 8, damageDealt: 348 },
        ],
        upperPerformers: [{ creatureId: 33, damageDealt: 500 }],
        lowerSetup: {
            artifactTier1: 5,
            artifactTier2: 13,
            doctrine: 3,
            augmentPlacement: 2,
            augmentArmor: 3,
            augmentMight: 0,
            augmentEmpower: 0,
            augmentSniper: 0,
            augmentMovement: 2,
            synergies: ["Chaos:1:2"],
        },
        upperSetup: {
            artifactTier1: 1,
            artifactTier2: 4,
            doctrine: 2,
            augmentPlacement: 1,
            augmentArmor: 0,
            augmentMight: 2,
            augmentEmpower: 0,
            augmentSniper: 1,
            augmentMovement: 0,
            synergies: ["Life:2:1"],
        },
        setupRecorded: true,
        replayAvailable: true,
    },
    season: {
        sequence: 1,
        name: "Season 1",
        startsAt: 1786666176793,
        endsAt: 1789258176793,
        status: "active",
        currency: { name: "Gold", symbol: "G", iconSvg: "" },
    },
};

const SIDES: RankedMatchSide[] = ["lower", "upper"];

/** Components whose script blocks read the parsed match. Unchecked by tsc — hence the scan. */
const CONSUMERS = ["ProfilePage.astro", "MatchPage.astro"] as const;

describe("ranked match producer contract", () => {
    test("the parser reads every field the API actually sends", () => {
        const stats = normalizePublicRankedMatch(WIRE_PAYLOAD)?.stats;
        expect(stats).not.toBeNull();

        // Values, not just shape: a key-name drift zeroes these while every structural assertion still passes.
        expect(stats?.lowerDamage).toBe(952);
        expect(stats?.upperDamage).toBe(1070);
        expect(stats?.lowerPerformers.length).toBe(2);
        expect(stats?.upperPerformers).toEqual([{ creatureId: 33, damageDealt: 500 }]);
        expect(stats?.lowerSetup.artifactTier1).toBe(5);
        expect(stats?.lowerSetup.synergies).toEqual(["Chaos:1:2"]);
        expect(stats?.upperSetup.augmentSniper).toBe(1);
        expect(stats?.totalLaps).toBe(1);
    });

    test("no per-seat stats field silently parses to nothing", () => {
        const stats = normalizePublicRankedMatch(WIRE_PAYLOAD)?.stats;
        // Every seat-prefixed field is populated on a payload where the server sent a value for each, so a
        // renamed or dropped key shows up here as a zero/empty instead of slipping through unnoticed.
        for (const side of SIDES) {
            expect(stats?.[`${side}Damage`]).toBeGreaterThan(0);
            expect(stats?.[`${side}Performers`].length).toBeGreaterThan(0);
            expect(stats?.[`${side}CreatureIds`].length).toBeGreaterThan(0);
            expect(stats?.[`${side}Setup`]).toBeDefined();
            expect(stats?.[`${side}Setup`].synergies.length).toBeGreaterThan(0);
        }
    });

    test("the seat names and the stats key prefixes stay in agreement", () => {
        const stats = normalizePublicRankedMatch(WIRE_PAYLOAD)?.stats;
        expect(stats).toBeTruthy();
        // The outage was exactly this invariant breaking: RankedMatchSide stayed "lower"/"upper" while the
        // stats keys became left*/right*, so `${side}Setup` resolved to undefined at every call site.
        for (const side of SIDES) {
            expect(Object.keys(stats!)).toContain(`${side}Damage`);
            expect(Object.keys(stats!)).toContain(`${side}Setup`);
            expect(Object.keys(stats!)).toContain(`${side}Performers`);
        }
    });
});

describe("ranked match consumer contract", () => {
    const producedKeys = new Set(Object.keys(normalizePublicRankedMatch(WIRE_PAYLOAD)!.stats!));

    for (const component of CONSUMERS) {
        test(`${component} only reads stats fields the parser produces`, async () => {
            const source = await Bun.file(`${import.meta.dir}/../components/${component}`).text();
            // Both components bind `const stats = match.stats`, so every `stats.X` / `stats?.X` in the file
            // is a read of this payload. Matching on that binding keeps the scan free of false positives.
            const read = [...source.matchAll(/\bstats\??\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]);
            expect(read.length).toBeGreaterThan(0);

            const unknown = [...new Set(read)].filter((key) => !producedKeys.has(key)).sort();
            expect(unknown).toEqual([]);
        });
    }
});
