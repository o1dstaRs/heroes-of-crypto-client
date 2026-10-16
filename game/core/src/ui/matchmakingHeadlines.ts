/**
 * Headlines the ranked search cycles through while it waits.
 *
 * One fixed line ("Scouting for a worthy rival") made a long queue read as a frozen screen, so the
 * headline changes every few seconds instead. The first entry stays the one players already know, and
 * the order is fixed rather than random so the screen never flickers back and forth between repaints
 * (the route repaints twice a second for the queue clock).
 *
 * These reach t() as a variable, so the i18n literal scan cannot see them — i18n.test.ts asserts a
 * Russian entry for every line here.
 */
export const SEARCH_HEADLINES = [
    "Scouting for a worthy rival",
    "Sounding the horn for a challenger",
    "Reading the field for a rival",
    "Sizing up the warbands",
    "Calling challengers to the arena",
    "Combing the ranks for your match",
] as const;

/** How long each headline holds before the next one takes over. */
export const SEARCH_HEADLINE_SECONDS = 7;

/** The headline for a search that has been running `elapsedSeconds`; the first line for a fresh one. */
export const searchHeadline = (elapsedSeconds: number): string => {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
        return SEARCH_HEADLINES[0];
    }
    const step = Math.floor(elapsedSeconds / SEARCH_HEADLINE_SECONDS);
    return SEARCH_HEADLINES[step % SEARCH_HEADLINES.length];
};
