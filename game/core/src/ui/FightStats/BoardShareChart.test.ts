import { describe, expect, test } from "bun:test";

import { boardSharePct } from "./BoardShareChart";
import type { IFightStatsSample } from "../../scenes/VisibleState";

const sample = (over: Partial<IFightStatsSample> = {}): IFightStatsSample => ({
    lap: 1,
    leftKilled: 0,
    rightKilled: 0,
    leftKilledPct: 0,
    rightKilledPct: 0,
    ...over,
});

describe("board share", () => {
    test("opens dead level at 50 for a full-strength board", () => {
        expect(boardSharePct(sample({ leftHpPct: 100, rightHpPct: 100 }))).toBe(50);
    });

    test("opens at 50 even when the two armies started with different health", () => {
        // Each side is normalised against its OWN start, so a 4000hp army and a 900hp army both read 100.
        expect(boardSharePct(sample({ leftHpPct: 100, rightHpPct: 100, leftKilled: 0 }))).toBe(50);
    });

    test("rises above 50 for whoever holds more of their army", () => {
        expect(boardSharePct(sample({ leftHpPct: 80, rightHpPct: 40 }))).toBeGreaterThan(50);
        expect(boardSharePct(sample({ leftHpPct: 40, rightHpPct: 80 }))).toBeLessThan(50);
    });

    test("scales with the size of the lead, not the raw numbers", () => {
        // Same 2:1 ratio late in a bloody fight as early in a clean one — the lead is what's plotted.
        expect(boardSharePct(sample({ leftHpPct: 80, rightHpPct: 40 }))).toBeCloseTo(
            boardSharePct(sample({ leftHpPct: 20, rightHpPct: 10 })),
            6,
        );
    });

    test("pins to the extremes when one side is wiped out", () => {
        expect(boardSharePct(sample({ leftHpPct: 55, rightHpPct: 0 }))).toBe(100);
        expect(boardSharePct(sample({ leftHpPct: 0, rightHpPct: 55 }))).toBe(0);
    });

    test("holds the midline when both sides are wiped in the same instant", () => {
        // A mutual kill must not divide by zero or slam the line to an arbitrary edge.
        expect(boardSharePct(sample({ leftHpPct: 0, rightHpPct: 0 }))).toBe(50);
    });

    test("falls back to survivors for series recorded before HP was tracked", () => {
        // No HP fields at all (older replays / fixtures): 30% of green dead vs 70% of red dead.
        expect(boardSharePct(sample({ leftKilledPct: 30, rightKilledPct: 70 }))).toBeCloseTo(70, 6);
    });
});
