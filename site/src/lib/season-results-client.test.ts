/**
 * Wire-contract guards for the public season results payloads (see ranked-match-contract.test.ts for why
 * the site keeps these: it has no typecheck, so a renamed key would blank the page silently).
 *
 * The fixtures mirror the server builders in heroes-of-crypto-server
 * src/api/mm/v1/routers/ranked_router.ts (buildSeasonResultsList / buildSeasonResultsDetail /
 * publicResultRow) key for key. PRODUCER: the parser must read those keys.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
    buildSeasonResultsDetailUrl,
    buildSeasonResultsListUrl,
    normalizeSeasonPrize,
    normalizeSeasonResultsDetail,
    normalizeSeasonResultsList,
    placeInView,
    playersInView,
    seasonFromSearch,
    seasonPrizeOf,
    SeasonResultsNotFoundError,
    viewFromSearch,
} from "./season-results-client";

// Four finishers whose tables disagree: Valeria ends with the most gold, Borin with the best MMR.
const WIRE_PLAYER = {
    goldPlace: 1,
    mmrPlace: 2,
    playerId: "a1b2c3d4-0000-4000-8000-000000000001",
    username: "Valeria",
    state: "placed",
    league: 3,
    leagueName: "Marshal",
    mmr: 1612,
    peakMmr: 1650,
    gold: 2480,
    wins: 31,
    losses: 12,
    draws: 1,
    totalGames: 44,
    winRatePct: 70.5,
};

const WIRE_MMR_LEADER = {
    ...WIRE_PLAYER,
    goldPlace: 2,
    mmrPlace: 1,
    playerId: "a1b2c3d4-0000-4000-8000-000000000003",
    username: "Borin",
    mmr: 1700,
    gold: 900,
};

const WIRE_CALIBRATING = {
    ...WIRE_PLAYER,
    goldPlace: 3,
    mmrPlace: 0,
    playerId: "a1b2c3d4-0000-4000-8000-000000000002",
    username: "Mira",
    state: "calibration",
    league: 0,
    leagueName: "Unranked",
    mmr: 0,
    gold: 40,
};

const WIRE_EMPTY_PURSE = {
    ...WIRE_PLAYER,
    goldPlace: 0,
    mmrPlace: 3,
    playerId: "a1b2c3d4-0000-4000-8000-000000000004",
    username: "Tam",
    mmr: 1400,
    gold: 0,
};

const WIRE_SEASON = {
    sequence: 1,
    name: "Season 1",
    startsAt: 1786666176793,
    endsAt: 1789258176793,
    status: "finished",
    currency: { name: "Gold", symbol: "G", iconSvg: "" },
    hasPrizePool: false,
};

/** A season that plays for a prize pool, whose list a person is still checking. */
const WIRE_PRIZE_SEASON = { ...WIRE_SEASON, sequence: 2, name: "Season 2", hasPrizePool: true };

const WIRE_PRIZE_REVIEW = { status: "review", reviewUntil: 1789517400000, places: [] };

const WIRE_PRIZE_APPROVED = {
    status: "approved",
    reviewUntil: 1789517400000,
    places: [
        { place: 1, playerId: WIRE_PLAYER.playerId, username: "Valeria" },
        { place: 2, playerId: WIRE_MMR_LEADER.playerId, username: "Borin" },
    ],
};

const WIRE_LIST = {
    computedAt: 1789300000000,
    seasons: [
        {
            season: WIRE_SEASON,
            closedAt: 1789258200000,
            playerCount: 12,
            rankedCount: 9,
            totalGold: 18234,
            podium: [WIRE_PLAYER],
            mmrPodium: [WIRE_MMR_LEADER],
        },
    ],
};

const WIRE_DETAIL = {
    computedAt: 1789300000000,
    season: WIRE_SEASON,
    closedAt: 1789258200000,
    playerCount: 12,
    rankedCount: 9,
    totalGold: 18234,
    refundedGold: 640,
    collapsed: false,
    prize: null,
    leagues: [{ league: 3, playerCount: 4, minMmr: 1500, maxMmr: 1700, leagueName: "Marshal" }],
    // The server sends the gold table's order.
    players: [WIRE_PLAYER, WIRE_MMR_LEADER, WIRE_CALIBRATING, WIRE_EMPTY_PURSE],
};

describe("season results wire contract (producer)", () => {
    test("the list parser reads every key the server sends", () => {
        const list = normalizeSeasonResultsList(WIRE_LIST);
        expect(list.computedAt).toBe(1789300000000);
        expect(list.seasons).toHaveLength(1);
        const [entry] = list.seasons;
        expect(entry.season).toEqual({ ...WIRE_SEASON, status: "finished" });
        expect(entry).toMatchObject({ closedAt: 1789258200000, playerCount: 12, rankedCount: 9, totalGold: 18234 });
        expect(entry.podium).toEqual([WIRE_PLAYER]);
        expect(entry.mmrPodium).toEqual([WIRE_MMR_LEADER]);
    });

    test("the detail parser reads every key the server sends", () => {
        const detail = normalizeSeasonResultsDetail(WIRE_DETAIL);
        expect(detail).not.toBeNull();
        expect(detail).toMatchObject({
            closedAt: 1789258200000,
            playerCount: 12,
            rankedCount: 9,
            totalGold: 18234,
            refundedGold: 640,
            collapsed: false,
        });
        // A season without a prize pool says so, and carries no prize list.
        expect(detail?.season.hasPrizePool).toBe(false);
        expect(detail?.prize).toBeNull();
        expect(detail?.leagues).toEqual([
            { league: 3, leagueName: "Marshal", playerCount: 4, minMmr: 1500, maxMmr: 1700 },
        ]);
        expect(detail?.players.map((player) => [player.username, player.goldPlace, player.mmrPlace, player.state, player.gold])).toEqual([
            ["Valeria", 1, 2, "placed", 2480],
            ["Borin", 2, 1, "placed", 900],
            ["Mira", 3, 0, "calibration", 40],
            ["Tam", 0, 3, "placed", 0],
        ]);
    });

    test("a season currency travels with the season", () => {
        const detail = normalizeSeasonResultsDetail({
            ...WIRE_DETAIL,
            season: { ...WIRE_SEASON, sequence: 2, currency: { name: "Embers", symbol: "EM", iconSvg: "<svg></svg>" } },
        });
        expect(detail?.season.currency).toEqual({ name: "Embers", symbol: "EM", iconSvg: "<svg></svg>" });
    });

    test("garbage degrades to empty, never throws", () => {
        expect(normalizeSeasonResultsList(null)).toEqual({ computedAt: 0, seasons: [] });
        expect(normalizeSeasonResultsList({ seasons: [{ season: { sequence: 0 } }, "x"] }).seasons).toEqual([]);
        expect(normalizeSeasonResultsDetail({ season: null })).toBeNull();
        expect(
            normalizeSeasonResultsDetail({ season: WIRE_SEASON, players: [{ username: "no id" }] })?.players,
        ).toEqual([]);
    });
});

describe("season prizes", () => {
    const prizeDetail = (prize: unknown, season: unknown = WIRE_PRIZE_SEASON) =>
        normalizeSeasonResultsDetail({ ...WIRE_DETAIL, season, prize });

    test("a prize season under review publishes only that, and until when", () => {
        const detail = prizeDetail(WIRE_PRIZE_REVIEW);
        expect(detail?.season.hasPrizePool).toBe(true);
        expect(detail?.prize).toEqual({ status: "review", reviewUntil: 1789517400000, places: [] });
        expect(seasonPrizeOf(detail!)?.status).toBe("review");
    });

    test("an approved list publishes the places, in place order", () => {
        const detail = prizeDetail(WIRE_PRIZE_APPROVED);
        expect(detail?.prize).toEqual({
            status: "approved",
            reviewUntil: 1789517400000,
            places: [
                { place: 1, playerId: WIRE_PLAYER.playerId, username: "Valeria" },
                { place: 2, playerId: WIRE_MMR_LEADER.playerId, username: "Borin" },
            ],
        });
        // The order is the list's, never the order the rows arrive in.
        expect(
            normalizeSeasonPrize({
                ...WIRE_PRIZE_APPROVED,
                places: [...WIRE_PRIZE_APPROVED.places].reverse(),
            })?.places.map((place) => place.place),
        ).toEqual([1, 2]);
    });

    test("places never leak while the list is under review, whatever the response carries", () => {
        expect(normalizeSeasonPrize({ ...WIRE_PRIZE_REVIEW, places: WIRE_PRIZE_APPROVED.places })?.places).toEqual([]);
    });

    test("an unknown or missing status reads as no prize information at all", () => {
        for (const value of [undefined, null, "review", 7, [], {}, { status: "provisional" }, { status: "" }]) {
            expect(normalizeSeasonPrize(value)).toBeNull();
        }
        expect(prizeDetail(undefined)?.prize).toBeNull();
        expect(prizeDetail({ status: "paid", places: WIRE_PRIZE_APPROVED.places })?.prize).toBeNull();
    });

    test("a missing or negative review date reads as 0, and malformed places are dropped", () => {
        expect(normalizeSeasonPrize({ status: "review" })?.reviewUntil).toBe(0);
        expect(normalizeSeasonPrize({ status: "review", reviewUntil: -5 })?.reviewUntil).toBe(0);
        expect(normalizeSeasonPrize({ status: "review", reviewUntil: "soon" })?.reviewUntil).toBe(0);
        const prize = normalizeSeasonPrize({
            status: "approved",
            reviewUntil: 1789517400000.7,
            places: [
                { place: 2, playerId: "p2", username: "  Kept  " },
                { place: 0, playerId: "p3", username: "no place" },
                { place: -1, playerId: "p4", username: "negative place" },
                { place: 1, playerId: "   ", username: "no player" },
                { place: 3, username: "no player id" },
                { place: 4, playerId: "p5" },
                "not a row",
                null,
            ],
        });
        expect(prize?.reviewUntil).toBe(1789517400000);
        expect(prize?.places).toEqual([
            { place: 2, playerId: "p2", username: "Kept" },
            { place: 4, playerId: "p5", username: "Unknown" },
        ]);
        expect(normalizeSeasonPrize({ status: "approved", places: "none" })?.places).toEqual([]);
    });

    test("a season without a prize pool shows nothing about prizes", () => {
        const detail = prizeDetail(WIRE_PRIZE_APPROVED, WIRE_SEASON);
        expect(detail?.prize).not.toBeNull();
        expect(seasonPrizeOf(detail!)).toBeNull();
        // A season the results outlived (no season row on the server) reads as no prize pool.
        expect(normalizeSeasonResultsDetail({ ...WIRE_DETAIL, season: { sequence: 9 } })?.season.hasPrizePool).toBe(
            false,
        );
    });

    test("the list marks which seasons play for a prize pool", () => {
        const list = normalizeSeasonResultsList({
            ...WIRE_LIST,
            seasons: [...WIRE_LIST.seasons, { ...WIRE_LIST.seasons[0], season: WIRE_PRIZE_SEASON }],
        });
        expect(list.seasons.map((entry) => [entry.season.sequence, entry.season.hasPrizePool])).toEqual([
            [2, true],
            [1, false],
        ]);
    });
});

describe("season results tables", () => {
    const detail = normalizeSeasonResultsDetail(WIRE_DETAIL)!;
    const names = (view: "gold" | "mmr", list = detail.players) => playersInView(list, view).map((player) => player.username);

    test("the gold table: by gold place, then the MMR table; empty purses last", () => {
        expect(names("gold")).toEqual(["Valeria", "Borin", "Mira", "Tam"]);
        expect(playersInView(detail.players, "gold").map((player) => placeInView(player, "gold"))).toEqual([1, 2, 3, 0]);
    });

    test("the MMR table: by MMR place, then balance; the unranked last", () => {
        expect(names("mmr")).toEqual(["Borin", "Valeria", "Tam", "Mira"]);
        expect(playersInView(detail.players, "mmr").map((player) => placeInView(player, "mmr"))).toEqual([1, 2, 3, 0]);
    });

    test("the order never depends on the order players arrive in", () => {
        const reversed = [...detail.players].reverse();
        expect(names("gold", reversed)).toEqual(names("gold"));
        expect(names("mmr", reversed)).toEqual(names("mmr"));
    });

    test("the table from the query string: gold unless ?view=mmr", () => {
        expect(viewFromSearch("?view=mmr")).toBe("mmr");
        expect(viewFromSearch("?season=2&view=mmr")).toBe("mmr");
        expect(viewFromSearch("?view=gold")).toBe("gold");
        expect(viewFromSearch("?view=elo")).toBe("gold");
        expect(viewFromSearch("")).toBe("gold");
    });
});

describe("season results urls", () => {
    test("production and development paths", () => {
        expect(buildSeasonResultsListUrl({ production: true, baseUrl: "https://mm.heroesofcrypto.io/" })).toBe(
            "https://mm.heroesofcrypto.io/v1/season-results",
        );
        expect(buildSeasonResultsDetailUrl(3, { production: false, baseUrl: "http://localhost:3001" })).toBe(
            "http://localhost:3001/v1/mm/season-results/3",
        );
        expect(() => buildSeasonResultsDetailUrl(0, { production: true, baseUrl: "https://x" })).toThrow(
            SeasonResultsNotFoundError,
        );
    });

    test("season deep link from the query string", () => {
        expect(seasonFromSearch("?season=2")).toBe(2);
        expect(seasonFromSearch("?season=0")).toBe(0);
        expect(seasonFromSearch("?season=abc")).toBe(0);
        expect(seasonFromSearch("")).toBe(0);
    });
});

describe("season results wire contract (consumer)", () => {
    test("every field the results page reads exists on what the parser produces", () => {
        const source = readFileSync(new URL("../components/SeasonResultsPage.astro", import.meta.url), "utf8");
        const script = source.slice(source.indexOf("<script>"), source.indexOf("</script>"));
        const detail = normalizeSeasonResultsDetail(WIRE_DETAIL);
        const list = normalizeSeasonResultsList(WIRE_LIST);
        expect(detail).not.toBeNull();
        const shapes: Record<string, object> = {
            detail: detail!,
            entry: list.seasons[0],
            player: detail!.players[0],
            season: detail!.season,
        };
        const reads = [...script.matchAll(/\b(detail|entry|player|season)\.([A-Za-z]+)\b/g)];
        expect(reads.length).toBeGreaterThan(20);
        for (const [, variable, key] of reads) {
            expect(key in shapes[variable], `${variable}.${key}`).toBe(true);
        }
    });

    // The page throws on a missing hook, so a renamed or forgotten data attribute must fail here instead.
    test("every element the page looks up exists in its markup", () => {
        const source = readFileSync(new URL("../components/SeasonResultsPage.astro", import.meta.url), "utf8");
        const markup = source.slice(0, source.indexOf("<script>"));
        const hooks = [...source.matchAll(/\bel(?:<[^>]+>)?\("([a-z-]+)"\)/g)].map(([, name]) => name);
        expect(hooks.length).toBeGreaterThan(10);
        for (const name of new Set(hooks)) {
            expect(markup.includes(`data-${name}`), `data-${name}`).toBe(true);
        }
    });
});
