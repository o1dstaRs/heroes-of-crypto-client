import { describe, expect, test } from "bun:test";

import {
    HOVER_TRAIL_WINDOW_MS,
    INSPECT_CLEAR_CLIMBING_DELAY_MS,
    INSPECT_CLEAR_DELAY_MS,
    cursorClimbRate,
    inspectClearDelayMs,
    isClimbingToHeader,
    shouldDeferInspectSwitch,
} from "./draftHoverIntent";

describe("draft cursor climb detection", () => {
    test("reads a fast run up toward the header as a climb", () => {
        // Bottom row to the header band: ~300px of travel in 100ms.
        expect(isClimbingToHeader({ x: 500, y: 900, t: 0 }, { x: 510, y: 600, t: 100 })).toBe(true);
    });

    test("ignores sideways scanning along a row", () => {
        expect(isClimbingToHeader({ x: 300, y: 900, t: 0 }, { x: 700, y: 896, t: 100 })).toBe(false);
        expect(cursorClimbRate({ x: 300, y: 900, t: 0 }, { x: 700, y: 896, t: 100 })).toBe(0);
    });

    test("ignores a shallow diagonal — that is still shopping, not travel", () => {
        expect(isClimbingToHeader({ x: 300, y: 900, t: 0 }, { x: 600, y: 800, t: 100 })).toBe(false);
    });

    test("ignores downward and level moves", () => {
        expect(cursorClimbRate({ x: 500, y: 600, t: 0 }, { x: 500, y: 900, t: 100 })).toBe(0);
        expect(cursorClimbRate({ x: 500, y: 600, t: 0 }, { x: 500, y: 600, t: 100 })).toBe(0);
    });

    test("ignores a slow drift upward — the player is picking the card above, not leaving", () => {
        expect(isClimbingToHeader({ x: 500, y: 900, t: 0 }, { x: 500, y: 880, t: 150 })).toBe(false);
    });

    test("ignores stale, missing and out-of-order samples", () => {
        const far: { x: number; y: number; t: number } = { x: 500, y: 300, t: HOVER_TRAIL_WINDOW_MS + 50 };
        expect(cursorClimbRate({ x: 500, y: 900, t: 0 }, far)).toBe(0);
        expect(cursorClimbRate(null, { x: 500, y: 300, t: 10 })).toBe(0);
        expect(cursorClimbRate({ x: 500, y: 900, t: 100 }, { x: 500, y: 300, t: 100 })).toBe(0);
        expect(cursorClimbRate({ x: 500, y: 900, t: 100 }, { x: 500, y: 300, t: 40 })).toBe(0);
    });
});

describe("draft readout hold rules", () => {
    test("holds the readout far longer while the cursor is still climbing", () => {
        expect(inspectClearDelayMs(false)).toBe(INSPECT_CLEAR_DELAY_MS);
        expect(inspectClearDelayMs(true)).toBe(INSPECT_CLEAR_CLIMBING_DELAY_MS);
        expect(INSPECT_CLEAR_CLIMBING_DELAY_MS).toBeGreaterThan(INSPECT_CLEAR_DELAY_MS);
    });

    test("defers only the cards crossed mid-climb", () => {
        expect(shouldDeferInspectSwitch({ climbing: true, hasReadout: true, sameTarget: false })).toBe(true);
        expect(shouldDeferInspectSwitch({ climbing: false, hasReadout: true, sameTarget: false })).toBe(false);
    });

    test("never defers the first card hovered — there is no readout to protect", () => {
        expect(shouldDeferInspectSwitch({ climbing: true, hasReadout: false, sameTarget: false })).toBe(false);
    });

    test("never defers re-entering the card already on screen", () => {
        expect(shouldDeferInspectSwitch({ climbing: true, hasReadout: true, sameTarget: true })).toBe(false);
    });
});
