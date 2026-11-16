import type { IVisibleState } from "../../scenes/VisibleState";

/** Full replay playback owns the board even if the last strike has already resolved the winner. */
export const canShowFightResults = (
    state: Pick<IVisibleState, "hasFinished" | "replayPlaybackActive">,
    dismissed: boolean,
): boolean => !!state.hasFinished && !state.replayPlaybackActive && !dismissed;
