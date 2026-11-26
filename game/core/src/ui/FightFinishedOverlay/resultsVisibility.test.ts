import { expect, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";
import type { IFightStatsReport, IVisibleState } from "../../scenes/VisibleState";
import { canShowFightResults, nextFinishedResultsView } from "./resultsVisibility";

test("results remain hidden until replay playback has finished, then reopen on its final frame", () => {
    expect(canShowFightResults({ hasFinished: true, replayPlaybackActive: false }, false)).toBe(true);
    expect(canShowFightResults({ hasFinished: true, replayPlaybackActive: true }, false)).toBe(false);
    expect(canShowFightResults({ hasFinished: false, replayPlaybackActive: true }, false)).toBe(false);
    expect(canShowFightResults({ hasFinished: true, replayPlaybackActive: false }, false)).toBe(true);
    expect(canShowFightResults({ hasFinished: true, replayPlaybackActive: false }, true)).toBe(false);
});

test("a finished fight waits while the board plays out its final blow, deaths or Armageddon", () => {
    expect(canShowFightResults({ hasFinished: true, replayPlaybackActive: false, resultsHeld: true }, false)).toBe(
        false,
    );
    expect(canShowFightResults({ hasFinished: true, replayPlaybackActive: false, resultsHeld: false }, false)).toBe(
        true,
    );
});

const report = (winner: number) =>
    ({ winner, leftStartTotal: 10, rightStartTotal: 10 }) as unknown as IFightStatsReport;
const finished = (teamWin: number | undefined, statsWinner: number | undefined, resultsHeld = false) =>
    ({
        hasFinished: true,
        teamWin,
        resultsHeld,
        fightStats: statsWinner === undefined ? undefined : report(statsWinner),
    }) as unknown as IVisibleState;

test("a draw and an Armageddon finish always reach the final screen", () => {
    // Draw: the report's NO_TEAM winner is the result.
    expect(nextFinishedResultsView(finished(TeamVals.NO_TEAM, TeamVals.NO_TEAM), null)?.stats.winner).toBe(
        TeamVals.NO_TEAM,
    );
    // Engine finish before the authoritative report: held while the board plays out, then shown with the result.
    expect(nextFinishedResultsView(finished(TeamVals.LEFT, TeamVals.NO_TEAM, true), null)).toBeNull();
    const fallback = nextFinishedResultsView(finished(TeamVals.LEFT, TeamVals.NO_TEAM), null);
    expect(fallback?.stats.winner).toBe(TeamVals.LEFT);
    // The matching report replaces the fallback as soon as it arrives.
    const final = finished(TeamVals.LEFT, TeamVals.LEFT);
    expect(nextFinishedResultsView(final, fallback)?.stats).toBe(final.fightStats!);
    // A live fight shows nothing.
    expect(nextFinishedResultsView({ hasFinished: false } as IVisibleState, fallback)).toBeNull();
});
