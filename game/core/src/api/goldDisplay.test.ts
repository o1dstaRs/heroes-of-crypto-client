import { describe, expect, test } from "bun:test";

import { availableGold, displayedGold } from "./goldDisplay";

describe("gold shown versus gold spent", () => {
    test("shows the total, available plus in play, when the server sends it", () => {
        expect(displayedGold({ gold: 300, totalGold: 800, goldInPlay: 500 })).toBe(800);
    });

    test("falls back to available gold for a server that predates the total", () => {
        expect(displayedGold({ gold: 300 })).toBe(300);
    });

    test("knows nothing when neither figure is sent, so a row can draw a dash", () => {
        expect(displayedGold({})).toBeUndefined();
        expect(displayedGold(undefined)).toBeUndefined();
    });

    test("gates spending on available gold only, never on the total", () => {
        expect(availableGold({ gold: 300, totalGold: 800 })).toBe(300);
        expect(availableGold(null)).toBe(0);
    });

    test("drops fractions, negatives and non-numbers", () => {
        expect(displayedGold({ gold: 12.9 })).toBe(12);
        expect(displayedGold({ gold: -4, totalGold: Number.NaN })).toBe(0);
        expect(availableGold({ gold: Number.POSITIVE_INFINITY })).toBe(0);
    });
});
