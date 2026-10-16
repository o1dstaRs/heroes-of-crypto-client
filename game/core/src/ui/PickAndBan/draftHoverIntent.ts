/**
 * Cursor-intent rules for the draft readout.
 *
 * Reading a card means walking the cursor from the pool up to the stat panel in the header, and that walk
 * crosses every row of cards above the one being read. Each of those rows answers mouseenter, so the panel
 * the player was heading for was replaced mid-flight by whatever card happened to be under the cursor on
 * the way — and the gaps between rows expired the readout outright.
 *
 * So a fast upward cursor is read as travel, not as a new inspection: the switch to the card it crosses is
 * deferred until the cursor settles, and the readout is held through the gaps for as long as the climb
 * lasts. Sideways and downward moves keep the old instant behaviour.
 */

export interface CursorSample {
    x: number;
    y: number;
    /** Milliseconds from any monotonic clock, as long as every sample uses the same one. */
    t: number;
}

/** Samples older than this say nothing about where the cursor is going now — it may have stopped since. */
export const HOVER_TRAIL_WINDOW_MS = 160;

/** Upward px/ms above which the cursor is travelling to the header rather than shopping for a card. */
export const HOVER_CLIMB_SPEED_PX_PER_MS = 0.5;

/** A climb this shallow is a diagonal along the row, not a run for the header. */
export const HOVER_CLIMB_MIN_STEEPNESS = 1;

/** How long a deferred switch waits before it gives in and shows the card the cursor stopped on. */
export const HOVER_SWITCH_DELAY_MS = 190;

/** Grace before the readout clears once the cursor is off every card. */
export const INSPECT_CLEAR_DELAY_MS = 90;

/** The same grace while the cursor is still climbing — long enough to cross a row and its gutters. */
export const INSPECT_CLEAR_CLIMBING_DELAY_MS = 420;

/**
 * Upward speed in px/ms between two cursor samples. Zero for downward, sideways-dominated, stale or
 * out-of-order pairs, so every caller can treat "0" as "not heading for the header".
 */
export const cursorClimbRate = (from: CursorSample | null | undefined, to: CursorSample): number => {
    if (!from) {
        return 0;
    }
    const dt = to.t - from.t;
    if (dt <= 0 || dt > HOVER_TRAIL_WINDOW_MS) {
        return 0;
    }
    const up = from.y - to.y;
    if (up <= 0) {
        return 0;
    }
    // A shallow diagonal is someone scanning along a row; only a mostly vertical run counts as a climb.
    if (up < Math.abs(to.x - from.x) * HOVER_CLIMB_MIN_STEEPNESS) {
        return 0;
    }
    return up / dt;
};

/** True while the cursor is running upward fast enough to be on its way to the header readout. */
export const isClimbingToHeader = (from: CursorSample | null | undefined, to: CursorSample): boolean =>
    cursorClimbRate(from, to) >= HOVER_CLIMB_SPEED_PX_PER_MS;

/** How long the readout survives after the cursor leaves a card. */
export const inspectClearDelayMs = (climbing: boolean): number =>
    climbing ? INSPECT_CLEAR_CLIMBING_DELAY_MS : INSPECT_CLEAR_DELAY_MS;

/**
 * Whether a freshly hovered card should wait its turn instead of taking the readout immediately. Only a
 * card crossed mid-climb waits, and only while there is a readout it would displace.
 */
export const shouldDeferInspectSwitch = (options: {
    climbing: boolean;
    /** A readout is currently on screen — the one the player is walking toward. */
    hasReadout: boolean;
    /** The hovered card is the one already shown; switching to it changes nothing. */
    sameTarget: boolean;
}): boolean => options.climbing && options.hasReadout && !options.sameTarget;
