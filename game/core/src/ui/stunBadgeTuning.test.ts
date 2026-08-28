import { describe, expect, test } from "bun:test";

import { DEFAULT_STUN_BADGE_TUNING, normalizeStunBadgeTuning, stunBadgeLayout } from "./stunBadgeTuning";

describe("stun badge tuning", () => {
    test("uses the values exported from the development editor", () => {
        expect(DEFAULT_STUN_BADGE_TUNING.widthScale).toBeCloseTo(1.7848);
        expect(DEFAULT_STUN_BADGE_TUNING.heightScale).toBeCloseTo(1.9303);
        expect(DEFAULT_STUN_BADGE_TUNING.offsetXFlagHeights).toBe(0.25);

        const layout = stunBadgeLayout(20, -30, DEFAULT_STUN_BADGE_TUNING);
        expect(layout.width).toBeCloseTo(35.696);
        expect(layout.height).toBeCloseTo(38.606);
        expect(layout.centerX).toBeCloseTo(-30 - 35.696 * 0.5 + 35.696 * 0.04 + 20 * 0.25);
    });

    test("moves the badge horizontally without changing its size", () => {
        const original = stunBadgeLayout(20, -30, DEFAULT_STUN_BADGE_TUNING);
        const moved = stunBadgeLayout(20, -30, {
            ...DEFAULT_STUN_BADGE_TUNING,
            offsetXFlagHeights: DEFAULT_STUN_BADGE_TUNING.offsetXFlagHeights + 0.5,
        });

        expect(moved.width).toBe(original.width);
        expect(moved.height).toBe(original.height);
        expect(moved.centerX - original.centerX).toBeCloseTo(10);
    });

    test("clamps unsafe values from the development editor", () => {
        expect(
            normalizeStunBadgeTuning({
                widthScale: 10,
                heightScale: -2,
                offsetXFlagHeights: 8,
            }),
        ).toEqual({
            widthScale: 3,
            heightScale: 0.5,
            offsetXFlagHeights: 1.5,
        });
    });
});
