import { describe, expect, test } from "bun:test";

import { boardSharePct } from "./BoardShareChart";
import type { IFightStatsSample } from "../../scenes/VisibleState";

const sample = (over: Partial<IFightStatsSample> = {}): IFightStatsSample => ({
    lap: 1,
    lowerKilled: 0,
    upperKilled: 0,
    lowerKilledPct: 0,
    upperKilledPct: 0,
    ...over,
});

describe("board share", () => {
    test("opens dead level at 50 for a full-strength board", () => {
        expect(boardSharePct(sample({ lowerHpPct: 100, upperHpPct: 100 }))).toBe(50);
    });

    test("opens at 50 even when the two armies started with different health", () => {
        // Each side is normalised against its OWN start, so a 4000hp army and a 900hp army both read 100.
        expect(boardSharePct(sample({ lowerHpPct: 100, upperHpPct: 100, lowerKilled: 0 }))).toBe(50);
    });

    test("rises above 50 for whoever holds more of their army", () => {
        expect(boardSharePct(sample({ lowerHpPct: 80, upperHpPct: 40 }))).toBeGreaterThan(50);
        expect(boardSharePct(sample({ lowerHpPct: 40, upperHpPct: 80 }))).toBeLessThan(50);
    });

    test("scales with the size of the lead, not the raw numbers", () => {
        // Same 2:1 ratio late in a bloody fight as early in a clean one — the lead is what's plotted.
        expect(boardSharePct(sample({ lowerHpPct: 80, upperHpPct: 40 }))).toBeCloseTo(
            boardSharePct(sample({ lowerHpPct: 20, upperHpPct: 10 })),
            6,
        );
    });

    test("pins to the extremes when one side is wiped out", () => {
        expect(boardSharePct(sample({ lowerHpPct: 55, upperHpPct: 0 }))).toBe(100);
        expect(boardSharePct(sample({ lowerHpPct: 0, upperHpPct: 55 }))).toBe(0);
    });

    test("holds the midline when both sides are wiped in the same instant", () => {
        // A mutual kill must not divide by zero or slam the line to an arbitrary edge.
        expect(boardSharePct(sample({ lowerHpPct: 0, upperHpPct: 0 }))).toBe(50);
    });

    test("falls back to survivors for series recorded before HP was tracked", () => {
        // No HP fields at all (older replays / fixtures): 30% of green dead vs 70% of red dead.
        expect(boardSharePct(sample({ lowerKilledPct: 30, upperKilledPct: 70 }))).toBeCloseTo(70, 6);
    });
});
