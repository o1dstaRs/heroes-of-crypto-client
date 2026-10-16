/**
 * Which gold figure a screen shows. Owner decision (2026-09-13): players see their TOTAL gold, what is available
 * plus what is in play in open wagers and predictions, so putting gold into a wager or a prediction never makes a
 * balance, a title or a place look smaller. Anything that spends gold (a wager, a prediction, a lobby fee) still
 * checks the available figure.
 *
 * Servers send `gold` as the available figure and, once they know them, `totalGold` and `goldInPlay`. An older
 * server sends only `gold`, which then stands in for the total.
 */
export interface GoldFigures {
    gold?: number;
    totalGold?: number;
    goldInPlay?: number;
}

const wholeGold = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : undefined;

/** The figure to show: the total when the server sends it, else available gold; undefined when neither is known. */
export const displayedGold = (figures: GoldFigures | null | undefined): number | undefined =>
    wholeGold(figures?.totalGold) ?? wholeGold(figures?.gold);

/** The figure that gates spending: available gold only, 0 when unknown. */
export const availableGold = (figures: GoldFigures | null | undefined): number => wholeGold(figures?.gold) ?? 0;
