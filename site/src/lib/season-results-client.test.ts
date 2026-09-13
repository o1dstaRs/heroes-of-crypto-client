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
    normalizeSeasonResultsDetail,
    normalizeSeasonResultsList,
    seasonFromSearch,
    SeasonResultsNotFoundError,
} from "./season-results-client";

const WIRE_PLAYER = {
    place: 1,
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

const WIRE_SEASON = {
    sequence: 1,
    name: "Season 1",
    startsAt: 1786666176793,
    endsAt: 1789258176793,
    status: "finished",
    currency: { name: "Gold", symbol: "G", iconSvg: "" },
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
    leagues: [{ league: 3, playerCount: 4, minMmr: 1500, maxMmr: 1700, leagueName: "Marshal" }],
    players: [
        WIRE_PLAYER,
        {
            ...WIRE_PLAYER,
            place: 0,
            playerId: "a1b2c3d4-0000-4000-8000-000000000002",
            state: "calibration",
            league: 0,
            leagueName: "Unranked",
            mmr: 0,
            gold: 40,
        },
    ],
};

describe("season results wire contract (producer)", () => {
    test("the list parser reads every key the server sends", () => {
        const list = normalizeSeasonResultsList(WIRE_LIST);
        expect(list.computedAt).toBe(1789300000000);
        expect(list.seasons).toHaveLength(1);
        const [entry] = list.seasons;
        expect(entry.season).toEqual({ ...WIRE_SEASON, status: "finished" });
        expect(entry).toMatchObject({ closedAt: 1789258200000, playerCount: 12, rankedCount: 9, totalGold: 18234 });
        expect(entry.podium[0]).toEqual(WIRE_PLAYER);
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
        expect(detail?.leagues).toEqual([
            { league: 3, leagueName: "Marshal", playerCount: 4, minMmr: 1500, maxMmr: 1700 },
        ]);
        expect(detail?.players.map((player) => [player.place, player.state, player.gold])).toEqual([
            [1, "placed", 2480],
            [0, "calibration", 40],
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
});
