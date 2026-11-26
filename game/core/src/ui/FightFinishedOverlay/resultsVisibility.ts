import type { IFightStatsReport, IVisibleState } from "../../scenes/VisibleState";

/**
 * Full replay playback owns the board even if the last strike has already resolved the winner, and a live
 * finish waits while the board still plays the final blow, the last deaths or an Armageddon wave.
 */
export const canShowFightResults = (
    state: Pick<IVisibleState, "hasFinished" | "replayPlaybackActive" | "resultsHeld">,
    dismissed: boolean,
): boolean => !!state.hasFinished && !state.replayPlaybackActive && !state.resultsHeld && !dismissed;

export interface FinishedResultsView {
    state: IVisibleState;
    stats: IFightStatsReport;
}

/**
 * Which finished fight the overlay shows. A report whose winner matches the result is always taken (and
 * replaces anything shown before). A report that still carries an earlier winner, which happens when an
 * engine finish (Armageddon, a draw) lands before the authoritative report, is shown with the known result
 * once the board has played the fight out, so the final screen always appears; the matching report then
 * replaces it.
 */
export const nextFinishedResultsView = (
    state: IVisibleState,
    previous: FinishedResultsView | null,
): FinishedResultsView | null => {
    if (!state.hasFinished) return null;
    const stats = state.fightStats;
    if (!stats || state.teamWin === undefined) return previous;
    if (stats.winner === state.teamWin) return { state, stats };
    if (!state.resultsHeld && !previous) return { state, stats: { ...stats, winner: state.teamWin } };
    return previous;
};
