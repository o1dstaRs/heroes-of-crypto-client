/**
 * The gold figure a page shows. Owner decision (2026-09-13): players see their TOTAL gold, what is available plus
 * what is in play in open wagers and predictions, so putting gold into a wager or a prediction never lowers a
 * balance, a title or a place. A server that predates `totalGold` sends only `gold`, which then stands in for it.
 */
export const displayedGold = (entry: { gold: number; totalGold?: number }): number =>
    typeof entry.totalGold === "number" && Number.isFinite(entry.totalGold)
        ? Math.max(0, Math.trunc(entry.totalGold))
        : entry.gold;
