import { ACTIVE_TURN_QUEUE_PULSE_MAX_SCALE } from "../activeTurnQueuePulse";
import { CREATURE_PORTRAIT_ASPECT } from "../creaturePortraitVisual";

/** The gap the queue's Stack puts between neighbouring cards (`spacing={1}`). */
export const QUEUE_CARD_GAP_PX = 8;

/** How much of the queue is on screen (`thumb`) and how far along it is (`offset`), both 0..1. */
export interface IQueueScrollState {
    thumb: number;
    offset: number;
}

/**
 * The drawn bar's geometry for a scrolling row, or null when the row shows everything it holds.
 *
 * The queue cannot use the native bar: a styled ::-webkit-scrollbar is an OVERLAY on macOS, claiming no
 * layout space and fading out while idle, so it says nothing in the one moment it matters — measured at
 * 0px in headless Chromium for both a 6px pseudo-element bar and `scrollbar-width: thin`.
 */
export const queueScrollState = (row: { scrollWidth: number; clientWidth: number; scrollLeft: number } | null) => {
    if (!row || row.scrollWidth <= row.clientWidth + 1) {
        return null;
    }
    const thumb = Math.min(1, row.clientWidth / row.scrollWidth);
    const maxScroll = row.scrollWidth - row.clientWidth;
    const travelled = maxScroll > 0 ? Math.min(1, Math.max(0, row.scrollLeft / maxScroll)) : 0;
    // The thumb travels the track's remaining length, so its offset is bounded by what is left of it.
    return { thumb, offset: travelled * (1 - thumb) };
};

/** Room the active card's glow needs around its scaled portrait, on each side. */
export const ACTIVE_TURN_GLOW_MARGIN_PX = 16;

/** One card: the portrait, plus the 1px border it carries on each side. */
export const upNextQueueCardWidth = (portraitHeight: number): number =>
    Math.round(portraitHeight * CREATURE_PORTRAIT_ASPECT) + 2;

/**
 * The width the queue row REALLY occupies — the same arithmetic its own boxes perform: every card carries
 * its border, the active one is scaled by the turn pulse and keeps its glow margin either side, and the
 * Stack puts a gap between neighbours.
 *
 * What this replaces simply divided the band by the card count and skipped both the borders and the glow,
 * so it answered "they all fit" for a row that then ran ~38px past the band's edge: the cards spilled out
 * of the band, and since that same estimate decided whether the row scrolls, no scrollbar was offered
 * either (owner report 2026-09-19).
 */
export const upNextQueueRowWidth = (count: number, portraitHeight: number): number => {
    if (count <= 0) {
        return 0;
    }
    const cardWidth = upNextQueueCardWidth(portraitHeight);
    const activeSlotWidth = Math.ceil(cardWidth * ACTIVE_TURN_QUEUE_PULSE_MAX_SCALE) + ACTIVE_TURN_GLOW_MARGIN_PX * 2;
    return activeSlotWidth + (count - 1) * (cardWidth + QUEUE_CARD_GAP_PX);
};

/**
 * The card size the band can actually hold: as large as fits, and never smaller than the size at which a
 * portrait stops being readable. When even that smallest readable row is too wide, the queue scrolls
 * instead — which is the only state that should ever show a scrollbar.
 */
export const upNextQueueFit = (
    count: number,
    availableWidth: number,
    maxPortraitHeight: number,
    minimumReadableHeight: number,
): { portraitHeight: number; needsScroll: boolean } => {
    if (count <= 0) {
        return { portraitHeight: maxPortraitHeight, needsScroll: false };
    }
    const floorHeight = Math.min(minimumReadableHeight, maxPortraitHeight);
    if (upNextQueueRowWidth(count, floorHeight) > availableWidth) {
        return { portraitHeight: Math.min(maxPortraitHeight, 256), needsScroll: true };
    }
    // The row's width grows with the card size, so the largest height that still fits is a binary search
    // between the readable floor (known to fit) and the tallest the band's height allows.
    let fits = floorHeight;
    let tooTall = maxPortraitHeight;
    while (fits < tooTall) {
        const mid = Math.ceil((fits + tooTall) / 2);
        if (upNextQueueRowWidth(count, mid) <= availableWidth) {
            fits = mid;
        } else {
            tooTall = mid - 1;
        }
    }
    return { portraitHeight: fits, needsScroll: false };
};
