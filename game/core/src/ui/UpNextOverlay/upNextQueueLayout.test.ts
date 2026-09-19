import { describe, expect, test } from "bun:test";

import {
    ACTIVE_TURN_GLOW_MARGIN_PX,
    QUEUE_CARD_GAP_PX,
    queueScrollState,
    upNextQueueCardWidth,
    upNextQueueFit,
    upNextQueueRowWidth,
} from "./upNextQueueLayout";

describe("Up Next queue sizing", () => {
    test("a row's width counts every border, the gaps and the active card's glow", () => {
        // One card at a 84px portrait: round(84 * 190/256) + 2 = 64.
        expect(upNextQueueCardWidth(84)).toBe(64);
        // Alone, a card is still the ACTIVE card, so it carries the pulse scale and both glow margins.
        expect(upNextQueueRowWidth(1, 84)).toBe(Math.ceil(64 * 1.075) + ACTIVE_TURN_GLOW_MARGIN_PX * 2);
        // Each further card adds itself plus one gap.
        expect(upNextQueueRowWidth(3, 84)).toBe(upNextQueueRowWidth(1, 84) + 2 * (64 + QUEUE_CARD_GAP_PX));
        expect(upNextQueueRowWidth(0, 84)).toBe(0);
    });

    // Measured in a live fight at 1280x800 (11 queued units, an 815px band): the row laid out 821px wide
    // inside 783px of usable band, while the old estimate — which divided the band by the card count and
    // skipped the borders and the glow — reported a comfortable fit. The cards spilled past the band's
    // edge and, because that same estimate gates scroll mode, no scrollbar was offered either.
    test("the eleven-card band that used to overflow in silence now scrolls", () => {
        expect(upNextQueueRowWidth(11, 84)).toBe(821);
        expect(upNextQueueFit(11, 783, 84, 84)).toEqual({ portraitHeight: 84, needsScroll: true });
    });

    test("a short queue keeps the biggest cards the band's height allows, and does not scroll", () => {
        const fit = upNextQueueFit(4, 783, 84, 84);
        expect(fit.needsScroll).toBe(false);
        expect(fit.portraitHeight).toBe(84);
        expect(upNextQueueRowWidth(4, fit.portraitHeight)).toBeLessThanOrEqual(783);
    });

    test("cards shrink to fit before the queue resorts to scrolling", () => {
        const fit = upNextQueueFit(8, 500, 200, 60);
        expect(fit.needsScroll).toBe(false);
        expect(upNextQueueRowWidth(8, fit.portraitHeight)).toBeLessThanOrEqual(500);
        // The largest that fits: one pixel more would not.
        expect(upNextQueueRowWidth(8, fit.portraitHeight + 1)).toBeGreaterThan(500);
        expect(fit.portraitHeight).toBeLessThan(200);
    });

    test("shrinking stops at the readable floor, and the queue scrolls instead", () => {
        const fit = upNextQueueFit(30, 500, 200, 120);
        expect(fit.needsScroll).toBe(true);
        // Scroll mode keeps a comfortable card rather than an unreadable one.
        expect(fit.portraitHeight).toBe(200);
    });

    test("an empty queue asks for nothing and never scrolls", () => {
        expect(upNextQueueFit(0, 500, 200, 120)).toEqual({ portraitHeight: 200, needsScroll: false });
    });
});

describe("the drawn scrollbar's geometry", () => {
    test("a row showing everything it holds gets no bar at all", () => {
        expect(queueScrollState(null)).toBeNull();
        expect(queueScrollState({ scrollWidth: 800, clientWidth: 800, scrollLeft: 0 })).toBeNull();
        // A sub-pixel difference is not a scroll; it would only flicker a bar nobody can use.
        expect(queueScrollState({ scrollWidth: 801, clientWidth: 800, scrollLeft: 0 })).toBeNull();
    });

    test("the thumb is the visible share of the queue, and sits where the row is scrolled to", () => {
        const start = queueScrollState({ scrollWidth: 1000, clientWidth: 500, scrollLeft: 0 });
        expect(start).toEqual({ thumb: 0.5, offset: 0 });

        const middle = queueScrollState({ scrollWidth: 1000, clientWidth: 500, scrollLeft: 250 });
        expect(middle?.offset).toBeCloseTo(0.25);

        // Scrolled to the end, the thumb's LEFT edge stops where its own width leaves off — so the bar
        // reads full, rather than running past the end of its track.
        const end = queueScrollState({ scrollWidth: 1000, clientWidth: 500, scrollLeft: 500 });
        expect(end).toEqual({ thumb: 0.5, offset: 0.5 });
    });

    test("an overscrolled row is still reported inside its track", () => {
        const past = queueScrollState({ scrollWidth: 1000, clientWidth: 500, scrollLeft: 900 });
        expect(past?.offset).toBe(0.5);
        const negative = queueScrollState({ scrollWidth: 1000, clientWidth: 500, scrollLeft: -40 });
        expect(negative?.offset).toBe(0);
    });
});
