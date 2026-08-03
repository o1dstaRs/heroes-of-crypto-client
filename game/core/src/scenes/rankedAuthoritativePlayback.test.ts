import { describe, expect, test } from "bun:test";

import { isRankedAuthoritativeRecordAlreadyApplied } from "./RankedPlayScene";

describe("ranked authoritative playback ordering", () => {
    test("skips a delayed AI move after a newer polled snapshot was applied", () => {
        expect(isRankedAuthoritativeRecordAlreadyApplied(48, { latestSequence: 47 })).toBe(true);
    });

    test("skips a duplicate record at the applied sequence", () => {
        expect(isRankedAuthoritativeRecordAlreadyApplied(47, { latestSequence: 47 })).toBe(true);
    });

    test("plays the next record in sequence", () => {
        expect(isRankedAuthoritativeRecordAlreadyApplied(46, { latestSequence: 47 })).toBe(false);
    });

    test("plays the first record before any snapshot has been applied", () => {
        expect(isRankedAuthoritativeRecordAlreadyApplied(-1, { latestSequence: 0 })).toBe(false);
    });

    test("supports the largest valid JavaScript sequence without rounding it", () => {
        expect(
            isRankedAuthoritativeRecordAlreadyApplied(Number.MAX_SAFE_INTEGER, {
                latestSequence: Number.MAX_SAFE_INTEGER,
            }),
        ).toBe(true);
    });

    test("does not suppress records without a usable checkpoint", () => {
        expect(isRankedAuthoritativeRecordAlreadyApplied(48, undefined)).toBe(false);
        expect(isRankedAuthoritativeRecordAlreadyApplied(48, { latestSequence: "47" })).toBe(false);
    });

    test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 47.5])(
        "rejects an invalid checkpoint sequence: %p",
        (latestSequence) => {
            expect(isRankedAuthoritativeRecordAlreadyApplied(48, { latestSequence })).toBe(false);
        },
    );

    test("does not mistake arrays or unrelated objects for checkpoints", () => {
        expect(isRankedAuthoritativeRecordAlreadyApplied(48, [])).toBe(false);
        expect(isRankedAuthoritativeRecordAlreadyApplied(48, { sequence: 47 })).toBe(false);
    });
});
