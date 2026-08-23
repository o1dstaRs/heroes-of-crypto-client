import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { axiosMMInstance, buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "./axios";
import {
    CANONICAL_GOLD_CURRENCY,
    currencyIconSvgDataUrl,
    fetchRankedSeasonCatalog,
    fetchRankedSeasonSnapshot,
    isInsufficientSeasonCurrencyError,
    normalizeRankedSeasonCatalog,
    normalizeRankedSeasonCurrency,
    normalizeRankedSeasonSnapshot,
    rankedSeasonCurrencyAt,
} from "./ranked_season_client";

afterEach(() => mock.restore());

describe("ranked season client", () => {
    test("loads the active season from the public matchmaking route", async () => {
        const data = {
            current: {
                sequence: 3,
                name: "Season of Embers",
                startsAt: 1_799_000_000_000,
                endsAt: 1_800_000_000_000,
                status: "active",
                currency: {
                    name: "Embers",
                    symbol: "EMB",
                    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>',
                },
            },
            next: {
                sequence: 4,
                name: "Iron Tide",
                startsAt: 1_800_000_000_000,
                endsAt: 1_801_000_000_000,
                status: "upcoming",
            },
        };
        const get = spyOn(axiosMMInstance, "get").mockResolvedValue({
            data,
        } as never);

        await expect(fetchRankedSeasonSnapshot()).resolves.toEqual({
            current: {
                sequence: 3,
                name: "Season of Embers",
                startsAt: 1_799_000_000_000,
                endsAt: 1_800_000_000_000,
                currency: {
                    name: "Embers",
                    symbol: "EMB",
                    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>',
                },
            },
            next: {
                sequence: 4,
                name: "Iron Tide",
                startsAt: 1_800_000_000_000,
                endsAt: 1_801_000_000_000,
                currency: CANONICAL_GOLD_CURRENCY,
            },
        });
        expect(get).toHaveBeenCalledWith(buildApiUrl(HOST_MATCHMAKING_API, endpoints.mm.seasonCurrent));
    });

    test("keeps a valid upcoming season when the current season is missing or malformed", () => {
        const next = {
            sequence: 2,
            name: "Iron Tide",
            startsAt: 1_800_000_000_000,
            endsAt: 1_801_000_000_000,
            status: "upcoming",
        };
        expect(normalizeRankedSeasonSnapshot({ current: null, next })).toEqual({
            current: null,
            next: {
                sequence: 2,
                name: "Iron Tide",
                startsAt: 1_800_000_000_000,
                endsAt: 1_801_000_000_000,
                currency: CANONICAL_GOLD_CURRENCY,
            },
        });
        expect(
            normalizeRankedSeasonSnapshot({
                current: {
                    sequence: 0,
                    name: "",
                    startsAt: 10,
                    endsAt: 9,
                    status: "active",
                },
                next,
            }),
        ).toEqual({
            current: null,
            next: {
                sequence: 2,
                name: "Iron Tide",
                startsAt: 1_800_000_000_000,
                endsAt: 1_801_000_000_000,
                currency: CANONICAL_GOLD_CURRENCY,
            },
        });
    });

    test("loads and normalizes the public season catalog", async () => {
        const data = {
            seasons: [
                {
                    sequence: 2,
                    name: "Iron Tide",
                    startsAt: 200,
                    endsAt: 300,
                    status: "active",
                    currency: { name: "Iron Marks", symbol: "IRM", iconSvg: "" },
                },
                {
                    sequence: 1,
                    name: "Season of Embers",
                    startsAt: 100,
                    endsAt: 200,
                    status: "finished",
                    currency: { name: "Embers", symbol: "EMB", iconSvg: "" },
                },
            ],
        };
        const get = spyOn(axiosMMInstance, "get").mockResolvedValue({ data } as never);

        await expect(fetchRankedSeasonCatalog()).resolves.toEqual([
            {
                sequence: 1,
                name: "Season of Embers",
                startsAt: 100,
                endsAt: 200,
                currency: { name: "Embers", symbol: "EMB", iconSvg: null },
            },
            {
                sequence: 2,
                name: "Iron Tide",
                startsAt: 200,
                endsAt: 300,
                currency: { name: "Iron Marks", symbol: "IRM", iconSvg: null },
            },
        ]);
        expect(get).toHaveBeenCalledWith(buildApiUrl(HOST_MATCHMAKING_API, endpoints.mm.seasons));
    });

    test("resolves historical currency from half-open season windows with a Gold fallback", () => {
        const seasons = normalizeRankedSeasonCatalog({
            seasons: [
                {
                    sequence: 2,
                    name: "Iron Tide",
                    startsAt: 200,
                    endsAt: 300,
                    status: "active",
                    currency: { name: "Iron Marks", symbol: "IRM" },
                },
                {
                    sequence: 1,
                    name: "Season of Embers",
                    startsAt: 100,
                    endsAt: 200,
                    status: "finished",
                    currency: { name: "Embers", symbol: "EMB" },
                },
                {
                    sequence: 2,
                    name: "Duplicate",
                    startsAt: 50,
                    endsAt: 500,
                    status: "finished",
                    currency: { name: "Wrong", symbol: "BAD" },
                },
                { sequence: 3, name: "Malformed", startsAt: 300, endsAt: 250, status: "upcoming" },
            ],
        });

        expect(seasons).toHaveLength(2);
        expect(rankedSeasonCurrencyAt(seasons, 100).symbol).toBe("EMB");
        expect(rankedSeasonCurrencyAt(seasons, 199).symbol).toBe("EMB");
        expect(rankedSeasonCurrencyAt(seasons, 200).symbol).toBe("IRM");
        expect(rankedSeasonCurrencyAt(seasons, 300)).toEqual(CANONICAL_GOLD_CURRENCY);
        expect(rankedSeasonCurrencyAt(seasons, Number.NaN)).toEqual(CANONICAL_GOLD_CURRENCY);
    });

    test("rejects seasons with the wrong status or invalid dates", () => {
        expect(
            normalizeRankedSeasonSnapshot({
                current: {
                    sequence: 1,
                    name: "First Flame",
                    startsAt: 100,
                    endsAt: 200,
                    status: "upcoming",
                },
                next: {
                    sequence: 2,
                    name: "Iron Tide",
                    startsAt: 300,
                    endsAt: 250,
                    status: "upcoming",
                },
            }),
        ).toEqual({ current: null, next: null });
    });

    test("normalizes seasonal currency and encodes its SVG only as an image data URL", () => {
        const iconSvg = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7" /></svg>';
        expect(normalizeRankedSeasonCurrency({ name: "  Iron Marks ", symbol: " IRM ", iconSvg })).toEqual({
            name: "Iron Marks",
            symbol: "IRM",
            iconSvg,
        });
        const imageUrl = currencyIconSvgDataUrl(iconSvg);
        expect(imageUrl).toStartWith("data:image/svg+xml;charset=utf-8,");
        expect(imageUrl).toContain("%3Csvg");
        expect(imageUrl).not.toContain("<svg");
        expect(currencyIconSvgDataUrl("<svg>\ud800</svg>")).toBeUndefined();
    });

    test("falls back to canonical gold for missing, malformed, active, or oversized metadata", () => {
        expect(normalizeRankedSeasonCurrency(null)).toEqual(CANONICAL_GOLD_CURRENCY);
        expect(
            normalizeRankedSeasonCurrency({
                name: " ",
                symbol: "BAD\nSYMBOL",
                iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
            }),
        ).toEqual(CANONICAL_GOLD_CURRENCY);
        expect(normalizeRankedSeasonCurrency({ name: "Embers", symbol: 42, iconSvg: "not svg" })).toEqual({
            name: "Embers",
            symbol: CANONICAL_GOLD_CURRENCY.symbol,
            iconSvg: null,
        });
        expect(normalizeRankedSeasonCurrency({ name: "x".repeat(41), symbol: "IRM" })).toEqual({
            name: CANONICAL_GOLD_CURRENCY.name,
            symbol: "IRM",
            iconSvg: null,
        });
        expect(normalizeRankedSeasonCurrency({ iconSvg: '<img src="x" />' }).iconSvg).toBeNull();
        expect(normalizeRankedSeasonCurrency({ iconSvg: `<svg>${"é".repeat(8_193)}</svg>` }).iconSvg).toBeNull();
    });

    test("recognizes legacy insufficient-Gold transport errors", () => {
        expect(isInsufficientSeasonCurrencyError(new Error("Request failed: Not enough gold for that stake"))).toBe(
            true,
        );
        expect(isInsufficientSeasonCurrencyError({ response: { data: "Not enough gold to raise that high" } })).toBe(
            true,
        );
        expect(isInsufficientSeasonCurrencyError(new Error("Raising is closed"))).toBe(false);
    });
});
