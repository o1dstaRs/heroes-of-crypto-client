import { describe, expect, test } from "bun:test";

import {
    buildSeasonCurrencyCatalogUrl,
    LEGACY_SEASON_CURRENCY,
    LEGACY_SEASON_CURRENCY_ICON_URL,
    normalizeSeasonCurrency,
    normalizeSeasonCurrencyCatalog,
    seasonCurrencyForTimestamp,
    seasonCurrencyIconUrl,
} from "./season-currency";

describe("season currency", () => {
    test("normalizes public metadata and trims the validated SVG", () => {
        expect(
            normalizeSeasonCurrency({
                name: "  Ember Shards ",
                symbol: " ES ",
                iconSvg: '  <svg viewBox="0 0 8 8"><path d="M0 0h8v8z"/></svg>  ',
            }),
        ).toEqual({
            name: "Ember Shards",
            symbol: "ES",
            iconSvg: '<svg viewBox="0 0 8 8"><path d="M0 0h8v8z"/></svg>',
        });
    });

    test("preserves the canonical gold fallback for legacy payloads", () => {
        expect(normalizeSeasonCurrency(undefined)).toEqual(LEGACY_SEASON_CURRENCY);
        expect(seasonCurrencyIconUrl(null)).toBe(LEGACY_SEASON_CURRENCY_ICON_URL);
        expect(seasonCurrencyIconUrl({ iconSvg: "not svg" })).toBe(LEGACY_SEASON_CURRENCY_ICON_URL);
        expect(seasonCurrencyIconUrl("<svg>\ud800</svg>")).toBe(LEGACY_SEASON_CURRENCY_ICON_URL);
    });

    test("encodes SVG markup for image src instead of returning injectable markup", () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="4"/></svg>';
        const url = seasonCurrencyIconUrl(svg);

        expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
        expect(url).not.toContain("<svg");
        expect(url).not.toContain("<script");
        expect(decodeURIComponent(url.split(",", 2)[1] ?? "")).toBe(svg);
    });

    test("normalizes the public season catalog and resolves historical branding by time window", () => {
        const catalog = normalizeSeasonCurrencyCatalog({
            currentSequence: 2,
            seasons: [
                {
                    sequence: 2,
                    name: "Ashfall",
                    startsAt: 200,
                    endsAt: 300,
                    currency: { name: "Embers", symbol: "EM", iconSvg: "<svg></svg>" },
                },
                {
                    sequence: 1,
                    name: "First Flame",
                    startsAt: 100,
                    endsAt: 200,
                    currency: { name: "Crowns", symbol: "CR", iconSvg: "" },
                },
                { sequence: 0, startsAt: 0, endsAt: 100 },
            ],
        });

        expect(catalog.current?.currency.name).toBe("Embers");
        expect(catalog.seasons.map((season) => season.sequence)).toEqual([1, 2]);
        expect(seasonCurrencyForTimestamp(catalog, 199).name).toBe("Crowns");
        expect(seasonCurrencyForTimestamp(catalog, 200).name).toBe("Embers");
        expect(seasonCurrencyForTimestamp(catalog, 99)).toEqual(LEGACY_SEASON_CURRENCY);
    });

    test("builds production and local public season catalog URLs", () => {
        expect(buildSeasonCurrencyCatalogUrl({ baseUrl: "https://mm.test/", production: true })).toBe(
            "https://mm.test/v1/seasons",
        );
        expect(buildSeasonCurrencyCatalogUrl({ baseUrl: "http://localhost:3001", production: false })).toBe(
            "http://localhost:3001/v1/mm/seasons",
        );
    });
});
